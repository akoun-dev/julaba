import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

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

export async function POST(request: NextRequest) {
  let body: { merchantId?: string; fondDeCaisse?: number; clientId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 }) }
  const merchantId = body.merchantId ?? null
  const denied = await requireDeviceOwner(request, 'merchant', merchantId)
  if (denied) return denied
  const fond = Number(body.fondDeCaisse)
  if (!Number.isInteger(fond) || fond < 0) return NextResponse.json({ erreur: 'Fond de caisse invalide' }, { status: 400 })
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

export async function PATCH(request: NextRequest) {
  let body: { merchantId?: string; sessionId?: string; countedCash?: number }
  try { body = await request.json() } catch { return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400 }) }
  const merchantId = body.merchantId ?? null
  const denied = await requireDeviceOwner(request, 'merchant', merchantId)
  if (denied) return denied
  if (!body.sessionId) return NextResponse.json({ erreur: 'sessionId requis' }, { status: 400 })
  try {
    const supabase = createSupabaseAdminClient()
    const update: Record<string, unknown> = { is_open: false, closed_at: new Date().toISOString() }
    if (Number.isInteger(body.countedCash) && (body.countedCash as number) >= 0) update.total_final = body.countedCash
    const { data, error } = await supabase.from('legacy_caisse_sessions').update(update)
      .eq('id', body.sessionId).eq('merchant_id', merchantId as string).eq('is_open', true).select('*').maybeSingle()
    if (error) throw error
    return NextResponse.json({ session: data ? toSession(data) : null })
  } catch (error) {
    console.error('[API caisse-session PATCH]', error)
    return NextResponse.json({ erreur: 'Clôture caisse indisponible' }, { status: 500 })
  }
}
