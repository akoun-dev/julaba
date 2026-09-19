import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createPartnerSchema, formatZodError, type PartnerPayload } from '@/lib/validation/marchand'

// MODE-906 (§21-22) — clients nommés du marchand (business_partners, kind
// client/fournisseur). Upsert IDEMPOTENT par client_id (§31-32) : rejeu
// offline = même payload → 200 « déjà connu » ; création → 201 ; course
// concurrente 23505 → relecture → 200. Le solde balance_cfa n'est JAMAIS
// écrit ici : seul le grand livre merchant_credit_ops (RPC) le modifie.

function mapPartner(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    kind: row.kind as string,
    name: row.name as string,
    phone: row.phone as string | null,
    note: (row.notes ?? row.note) as string | null,
    balanceCfa: (row.balance_cfa ?? 0) as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * GET /api/marchand/partners?merchantId=…&kind=client[&limit=…]
 * Liste scoppée au marchand, les plus récents d'abord (limit clampé à 200).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const merchantId = searchParams.get('merchantId')

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const kind = searchParams.get('kind') ?? 'client'
  if (kind !== 'client' && kind !== 'fournisseur') {
    return NextResponse.json({ erreur: 'Type de partenaire invalide' }, { status: 400 })
  }
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 200)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('business_partners')
    .select('*')
    .eq('merchant_id', merchantId!)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // Table pas encore migrée : erreur transitoire (l'entrée en file
    // offline reste conservée et rejouée).
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ erreur: 'Table partenaires non encore migrée' }, { status: 503 })
    }
    console.error('[partners] GET failed:', error.message)
    return NextResponse.json({ erreur: 'Lecture des partenaires impossible' }, { status: 500 })
  }

  return NextResponse.json({ partners: (data ?? []).map(mapPartner) })
}

/** Relecture après course concurrente : par client_id puis par téléphone. */
async function rereadPartner(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: PartnerPayload,
): Promise<Record<string, unknown> | null> {
  const { data: byClientId } = await supabase
    .from('business_partners')
    .select('*')
    .eq('client_id', payload.clientId)
    .maybeSingle()
  if (byClientId) return byClientId
  if (payload.phone) {
    const { data: byPhone } = await supabase
      .from('business_partners')
      .select('*')
      .eq('merchant_id', payload.merchantId)
      .eq('kind', payload.kind)
      .eq('phone', payload.phone)
      .maybeSingle()
    if (byPhone) return byPhone
  }
  return null
}

/**
 * POST /api/marchand/partners
 * Création idempotente (client_id) d'un partenaire. 201 créé, 200 déjà
 * connu, 400 payload invalide, 503 table non migrée (transitoire).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ erreur: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createPartnerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
  }
  const payload = parsed.data

  const auth = await requireDeviceOwner(request, 'merchant', payload.merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()

  // Idempotence : déjà connu par client_id → 200, rien ne se recrée.
  const { data: existing } = await supabase
    .from('business_partners')
    .select('*')
    .eq('client_id', payload.clientId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ partner: mapPartner(existing) }, { status: 200 })
  }

  const { data: created, error } = await supabase
    .from('business_partners')
    .insert({
      merchant_id: payload.merchantId,
      client_id: payload.clientId,
      kind: payload.kind,
      name: payload.name,
      phone: payload.phone || null,
      notes: payload.note || null,
    })
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      // Course concurrente (client_id ou téléphone unique) : le serveur
      // connaît déjà ce partenaire → relecture → 200 (jamais une erreur
      // pour un rejeu offline).
      const partner = await rereadPartner(supabase, payload)
      if (partner) {
        return NextResponse.json({ partner: mapPartner(partner) }, { status: 200 })
      }
      console.error('[partners] 23505 sans relecture trouvée:', error.message)
      return NextResponse.json({ erreur: 'Conflit de création du partenaire' }, { status: 409 })
    }
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ erreur: 'Table partenaires non encore migrée' }, { status: 503 })
    }
    console.error('[partners] insert failed:', error.message)
    return NextResponse.json({ erreur: 'Création du partenaire impossible' }, { status: 500 })
  }

  return NextResponse.json({ partner: mapPartner(created) }, { status: 201 })
}
