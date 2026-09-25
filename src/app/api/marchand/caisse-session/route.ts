import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { montantFcfaValide } from '@/lib/marchand/fcfa'
import { withServerTiming } from '@/lib/server-perf'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — schémas d'ouverture/clôture. Contrats préservés :
// • l'absence de merchantId est déjà refusée par requireDeviceOwner (« Identifiant requis ») → .optional() ;
// • fondDeCaisse/countedCash sont validés par montantFcfaValide (MODE-984)
//   qui refuse TOUT ce qui n'est pas un entier >= 0 plafonné — y compris les
//   strings « 1000 » — avec LEURS 400 testés (« Fond de caisse invalide »,
//   « Caisse comptée invalide ») → z.unknown() : Zod ne doit pas court-circuiter
//   cette garde (le test envoie volontairement '1000abc'/'1000') ;
// • !sessionId → 400 « sessionId requis » (validation manuelle) → .nullable().optional() ;
// • countedCash est absent du payload de clôture en estimation
//   (caisse-store ne l'envoie que s'il est défini) → .optional().
const caisseOpenSchema = z.object({
  merchantId: z.string().optional(),
  fondDeCaisse: z.unknown().optional(),
})

const caisseCloseSchema = z.object({
  merchantId: z.string().optional(),
  sessionId: z.string().nullable().optional(),
  countedCash: z.unknown().optional(),
})

function toSession(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    fondDeCaisse: Number(row.fond_de_caisse) || 0,
    isOpen: Boolean(row.is_open),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    serverSynced: true,
  }
}

export async function GET(request: NextRequest) {
  const merchantId = new URL(request.url).searchParams.get('merchantId')
  const denied = await requireDeviceOwner(request, 'merchant', merchantId)
  if (denied) return denied
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_caisse_sessions')
      .select('*')
      .eq('merchant_id', merchantId as string)
      .eq('is_open', true)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ session: data ? toSession(data) : null })
  } catch (error) {
    console.error('[API caisse-session GET]', error)
    return NextResponse.json({ erreur: 'Session caisse indisponible' }, { status: 500 })
  }
}

// I-04 (TRV-PERF-001) — latence d'écriture exposée en Server-Timing
// (ouverture POST, clôture PATCH). Logique métier inchangée.
export async function POST(request: NextRequest): Promise<NextResponse> {
  return withServerTiming('caisse-session-open', () => postHandler(request))
}

async function postHandler(request: NextRequest) {
  let body: { merchantId?: string; fondDeCaisse?: number; clientId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 }) }
  const parsedOpen = caisseOpenSchema.safeParse(body)
  if (!parsedOpen.success) {
    return NextResponse.json({ erreur: formatZodError(parsedOpen.error) }, { status: 400 })
  }
  const merchantId = body.merchantId ?? null
  const denied = await requireDeviceOwner(request, 'merchant', merchantId)
  if (denied) return denied
  // MODE-984 (AUDIT-008 P2) — contrat strict IDENTIQUE à l'UI : number
  // ENTIER >= 0 plafonné (safe integer) — pas de coercion silencieuse
  // (« 1000abc »/string/décimale/négatif/plafond dépassé → 400).
  if (!montantFcfaValide(body.fondDeCaisse)) return NextResponse.json({ erreur: 'Fond de caisse invalide' }, { status: 400 })
  const fond = body.fondDeCaisse
  try {
    const supabase = createSupabaseAdminClient()
    const { data: existing, error: existingError } = await supabase
      .from('legacy_caisse_sessions').select('*').eq('merchant_id', merchantId as string).eq('is_open', true)
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
    if (existingError) throw existingError
    if (existing) return NextResponse.json({ session: toSession(existing), existing: true })

    const { data, error } = await supabase
      .from('legacy_caisse_sessions')
      .insert({ merchant_id: merchantId, fond_de_caisse: fond, is_open: true })
      .select('*').single()
    if (error) {
      // Une ouverture concurrente sur un autre appareil doit récupérer la
      // session gagnante, jamais remettre le fond à zéro.
      if (error.code === '23505') {
        const { data: concurrent } = await supabase.from('legacy_caisse_sessions').select('*')
          .eq('merchant_id', merchantId as string).eq('is_open', true).order('opened_at', { ascending: false }).limit(1).maybeSingle()
        if (concurrent) return NextResponse.json({ session: toSession(concurrent), existing: true })
      }
      throw error
    }
    return NextResponse.json({ session: toSession(data), existing: false }, { status: 201 })
  } catch (error) {
    console.error('[API caisse-session POST]', error)
    return NextResponse.json({ erreur: 'Ouverture caisse indisponible' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return withServerTiming('caisse-session-close', () => patchHandler(request))
}

async function patchHandler(request: NextRequest) {
  let body: { merchantId?: string; sessionId?: string; countedCash?: number }
  try { body = await request.json() } catch { return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 }) }
  const parsedClose = caisseCloseSchema.safeParse(body)
  if (!parsedClose.success) {
    return NextResponse.json({ erreur: formatZodError(parsedClose.error) }, { status: 400 })
  }
  const merchantId = body.merchantId ?? null
  const denied = await requireDeviceOwner(request, 'merchant', merchantId)
  if (denied) return denied
  if (!body.sessionId) return NextResponse.json({ erreur: 'sessionId requis' }, { status: 400 })
  // MODE-984 (AUDIT-008 P2) — countedCash est optionnel (estimation) mais
  // s'il est PRÉSENT il doit être un montant FCFA strict : entier >= 0,
  // plafonné — un garbage explicite est refusé (400), jamais ignoré.
  if (body.countedCash !== undefined && !montantFcfaValide(body.countedCash)) {
    return NextResponse.json({ erreur: 'Caisse comptée invalide' }, { status: 400 })
  }
  try {
    const supabase = createSupabaseAdminClient()
    const update: Record<string, unknown> = { is_open: false, closed_at: new Date().toISOString() }
    if (montantFcfaValide(body.countedCash)) update.total_final = body.countedCash
    const { data, error } = await supabase.from('legacy_caisse_sessions').update(update)
      .eq('id', body.sessionId).eq('merchant_id', merchantId as string).eq('is_open', true).select('*').maybeSingle()
    if (error) throw error
    // MODE-984 (AUDIT-008 P1) — JAMAIS de faux succès générique : la réponse
    // distingue clôture réelle, déjà fermée (idempotent) et session inconnue.
    if (data) return NextResponse.json({ session: toSession(data), statut: 'closed' })
    const { data: existante, error: errExistance } = await supabase
      .from('legacy_caisse_sessions').select('*')
      .eq('id', body.sessionId).eq('merchant_id', merchantId as string).maybeSingle()
    if (errExistance) throw errExistance
    if (existante) return NextResponse.json({ session: toSession(existante), statut: 'already_closed' })
    return NextResponse.json({ erreur: 'Session inconnue', statut: 'no_session' }, { status: 404 })
  } catch (error) {
    console.error('[API caisse-session PATCH]', error)
    return NextResponse.json({ erreur: 'Clôture caisse indisponible' }, { status: 500 })
  }
}
