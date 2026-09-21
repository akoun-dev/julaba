import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { marketSessionSchema, formatZodError, type MarketSessionPayload } from '@/lib/validation/marchand'

// MODE-902 (§7-8) — sessions de journée marché.
//
// Upsert IDEMPOTENT par `client_id` (§31-32) : le même payload peut être
// envoyé deux fois (envoi initial « open » puis rejeu offline, ou clôture)
// sans jamais créer de doublon — ON CONFLICT met à jour le contexte et la
// clôture. La caisse (fond, ventes, dépenses) reste la source de vérité ;
// cette table ne porte que le contexte de terrain et le bilan résumé.

function toRow(payload: MarketSessionPayload) {
  return {
    merchant_id: payload.merchantId,
    client_id: payload.clientId,
    market_name: payload.marketName ?? null,
    location_mode: payload.locationMode,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    accuracy_m: payload.accuracyM ?? null,
    started_at: payload.startedAt,
    starting_cash: payload.startingCash,
    status: payload.status ?? 'open',
    closed_at: payload.closedAt ?? null,
    ending_cash: payload.endingCash ?? null,
    sales_total: payload.salesTotal ?? null,
    expenses_total: payload.expensesTotal ?? null,
  }
}

/**
 * POST /api/marchand/market-sessions
 * Upsert d'une session de journée marché (ouverture puis clôture, même
 * client_id). Réponses : 201 créé, 200 déjà connu (idempotent), 422 payload
 * invalide, 401/403 session appareil absente ou marchand différent.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = marketSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 422 })
  }
  const payload = parsed.data

  const auth = await requireDeviceOwner(request, 'merchant', payload.merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()
  const row = toRow(payload)

  // Détection explicite déjà-connu : un client_id existant = mise à jour
  // (clôture / rejeu) → 200 idempotent ; sinon création → 201.
  const { data: existing } = await supabase
    .from('merchant_market_sessions')
    .select('client_id')
    .eq('client_id', payload.clientId)
    .maybeSingle()

  const { error } = existing
    ? await supabase
        .from('merchant_market_sessions')
        .update(row)
        .eq('client_id', payload.clientId)
    : await supabase.from('merchant_market_sessions').insert(row)

  if (error) {
    // Course concurrente : deux envois du même client_id en même temps —
    // l'unicité (23505) protège ; on retente en mise à jour, toujours
    // idempotent.
    if (existing === null && (error as { code?: string }).code === '23505') {
      const { error: retryError } = await supabase
        .from('merchant_market_sessions')
        .update(row)
        .eq('client_id', payload.clientId)
      if (retryError) {
        console.error('[market-sessions] upsert retry failed:', retryError.message)
        return NextResponse.json({ error: 'Enregistrement de la session marché impossible' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, duplicate: true, clientId: payload.clientId }, { status: 200 })
    }
    // Le rejeu offline reste la source de vérité : tout échec serveur
    // transitoire se traduit par un statut 5xx — l'entrée en file est
    // conservée et rejouée (jamais de perte silencieuse).
    console.error('[market-sessions] upsert failed:', error.message)
    return NextResponse.json({ error: 'Enregistrement de la session marché impossible' }, { status: 500 })
  }

  const duplicate = existing !== null
  return NextResponse.json(
    { ok: true, duplicate, clientId: payload.clientId },
    { status: duplicate ? 200 : 201 },
  )
}
