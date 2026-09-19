import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createSellingPointSchema, formatZodError, type SellingPointPayload } from '@/lib/validation/marchand'

// MODE-908 (§18) — points de vente multiples du marchand
// (merchant_selling_points). Upsert IDEMPOTENT par client_id (§31-32) :
// le rejeu offline rejoue le MÊME payload → 200 ; le renommage et
// l'archivage voyagent par le MÊME client_id → connu = UPDATE name/kind
// (+ archived_at SEULEMENT s'il est fourni — jamais NULLé : on ne
// désarchive pas par accident). Création → 201 ; course concurrente
// 23505 → relecture → 200 ; table non migrée (42P01) → 503 transitoire
// (l'entrée reste en file offline et sera rejouée). Le point actif est
// une préférence appareil : rien à écrire ici.

function mapSellingPoint(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string,
    name: row.name as string,
    kind: row.kind as string,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

/**
 * GET /api/marchand/selling-points?merchantId=…[&limit=…]
 * Liste scoppée au marchand, les plus récents d'abord (limit clampé à 200).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const merchantId = searchParams.get('merchantId')

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 200)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('merchant_selling_points')
    .select('*')
    .eq('merchant_id', merchantId!)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // Table pas encore migrée : erreur transitoire (l'entrée en file
    // offline reste conservée et rejouée).
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ erreur: 'Table points de vente non encore migrée' }, { status: 503 })
    }
    console.error('[selling-points] GET failed:', error.message)
    return NextResponse.json({ erreur: 'Lecture des points de vente impossible' }, { status: 500 })
  }

  return NextResponse.json({ sellingPoints: (data ?? []).map(mapSellingPoint) })
}

/**
 * POST /api/marchand/selling-points
 * Upsert idempotent (client_id). 201 créé, 200 déjà connu (mis à jour),
 * 400 payload invalide, 503 table non migrée (transitoire).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ erreur: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createSellingPointSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
  }
  const payload = parsed.data

  const auth = await requireDeviceOwner(request, 'merchant', payload.merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()

  // Upsert : déjà connu par client_id → mise à jour (rename/archive par le
  // même client_id), 200. Idempotent : rejouer le même payload réécrit les
  // mêmes valeurs.
  const { data: existing } = await supabase
    .from('merchant_selling_points')
    .select('*')
    .eq('client_id', payload.clientId)
    .maybeSingle()
  if (existing) {
    return await updateKnownSellingPoint(supabase, payload)
  }

  const insertRow: Record<string, unknown> = {
    merchant_id: payload.merchantId,
    client_id: payload.clientId,
    name: payload.name,
    kind: payload.kind,
  }
  if (payload.archivedAt) {
    insertRow.archived_at = payload.archivedAt
  }

  const { data: created, error } = await supabase
    .from('merchant_selling_points')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      // Course concurrente (client_id unique) : le serveur connaît déjà ce
      // point → relecture → 200 (jamais une erreur pour un rejeu offline).
      const { data: reread } = await supabase
        .from('merchant_selling_points')
        .select('*')
        .eq('client_id', payload.clientId)
        .maybeSingle()
      if (reread) {
        return NextResponse.json({ sellingPoint: mapSellingPoint(reread) }, { status: 200 })
      }
      console.error('[selling-points] 23505 sans relecture trouvée:', error.message)
      return NextResponse.json({ erreur: 'Conflit de création du point de vente' }, { status: 409 })
    }
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ erreur: 'Table points de vente non encore migrée' }, { status: 503 })
    }
    console.error('[selling-points] insert failed:', error.message)
    return NextResponse.json({ erreur: 'Création du point de vente impossible' }, { status: 500 })
  }

  return NextResponse.json({ sellingPoint: mapSellingPoint(created) }, { status: 201 })
}

/** Mise à jour d'un point connu (rename/archive par le même client_id).
 * archived_at n'est écrit QUE si le payload le porte — jamais NULLé. */
async function updateKnownSellingPoint(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: SellingPointPayload,
): Promise<NextResponse> {
  const update: Record<string, unknown> = { name: payload.name, kind: payload.kind }
  if (payload.archivedAt) {
    update.archived_at = payload.archivedAt
  }
  const { data: updated, error } = await supabase
    .from('merchant_selling_points')
    .update(update)
    .eq('client_id', payload.clientId)
    .select()
    .single()
  if (error) {
    console.error('[selling-points] update failed:', error.message)
    return NextResponse.json({ erreur: 'Mise à jour du point de vente impossible' }, { status: 500 })
  }
  return NextResponse.json({ sellingPoint: mapSellingPoint(updated) }, { status: 200 })
}
