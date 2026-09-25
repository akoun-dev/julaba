import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { formatZodError, stockTransferActionSchema, stockTransferCreateSchema } from '@/lib/validation/marchand'
import { operationUuid, transferCancelViaRpc, transferOutViaRpc, transferReceiveViaRpc, type StockBusinessError } from '@/lib/stock/stock-service'

// MODE-1006 (noImplicitAny) — type de ligne minimal : le client admin est
// volontairement non typé (DET-008) ; schéma 20260919090800 :
// merchant_id/to_merchant_id/status/created_at NOT NULL, note/sent_at/
// received_at nullables.
interface TransferRow {
  id: string
  merchant_id: string
  to_merchant_id: string
  status: string
  note: string | null
  created_at: string
  sent_at: string | null
  received_at: string | null
}

function businessError(b: StockBusinessError) {
  // Codes = messages RAISE EXCEPTION exacts des RPC (dumps pg_proc) —
  // un code ajouté en base doit être mappé ici (garde transverse STK-812).
  const labels: Record<string, string> = {
    INSUFFICIENT_STOCK: 'Stock insuffisant pour ce transfert',
    PRODUCT_NOT_FOUND: 'Produit introuvable',
    PRODUCT_INACTIVE: 'Produit inactif',
    INVALID_QUANTITY: 'Quantité invalide',
    UNKNOWN_STOCK: "Stock inconnu — compte le stock d'abord",
    TRANSFER_SELF: 'Un transfert vers soi-même n\'a pas de sens',
    TRANSFER_NOT_FOUND: 'Transfert introuvable',
    TRANSFER_NOT_ADDRESSED: 'Ce transfert ne vous est pas destiné',
    TRANSFER_NOT_OWNER: 'Seul l\'expéditeur peut annuler ce transfert',
    TRANSFER_ALREADY_PROCESSED: 'Transfert déjà reçu ou annulé',
  }
  return NextResponse.json(
    { erreur: labels[b.code] ?? b.code, ...b },
    { status: b.code === 'INSUFFICIENT_STOCK' || b.code === 'UNKNOWN_STOCK' ? 422 : 400 },
  )
}

const RPC_MISSING = {
  erreur: "Le module de transferts n'est pas encore actif sur le serveur (db push requis).",
  code: 'STOCK_RPC_MISSING',
}

/**
 * GET /api/marchand/stock/transfers?merchantId=…[&direction=in|out]
 * Documents de transfert impliquant ce marchand (envoyés ET reçus) —
 * « sortant » (mes envois) / « entrant » (à recevoir).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const direction = searchParams.get('direction')
    let query = supabase
      .from('merchant_stock_transfers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (direction === 'out') query = query.eq('merchant_id', merchantId!)
    else if (direction === 'in') query = query.eq('to_merchant_id', merchantId!)
    else query = query.or(`merchant_id.eq.${merchantId},to_merchant_id.eq.${merchantId}`)

    const { data: rows, error } = await query
    if (error) throw error

    const transferIds = ((rows ?? []) as TransferRow[]).map((r) => r.id as string)
    const itemsByTransfer = new Map<string, unknown[]>()
    if (transferIds.length > 0) {
      const { data: items } = await supabase
        .from('merchant_stock_transfer_items')
        .select('*')
        .in('transfer_id', transferIds)
      for (const it of items ?? []) {
        const list = itemsByTransfer.get(it.transfer_id as string) ?? []
        list.push(it)
        itemsByTransfer.set(it.transfer_id as string, list)
      }
    }

    const transfers = ((rows ?? []) as TransferRow[]).map((r) => ({
      id: r.id as string,
      merchantId: r.merchant_id as string,
      toMerchantId: r.to_merchant_id as string,
      direction: r.merchant_id === merchantId ? 'out' : 'in',
      status: r.status as string,
      note: r.note as string | null,
      createdAt: r.created_at as string | null,
      sentAt: r.sent_at as string | null,
      receivedAt: r.received_at as string | null,
      // Pas de colonnes cancelled_at/cancel_reason en base (STK-809) : la
      // RPC merchant_transfer_cancel stocke la raison dans `note` — c'est
      // donc elle qu'on expose comme raison (STK-815).
      cancelReason: r.status === 'cancelled' ? (r.note as string | null) : null,
      items: (itemsByTransfer.get(r.id as string) ?? []).map((it) => {
        const i = it as Record<string, unknown>
        return {
          productId: i.product_id,
          productName: i.product_name,
          quantityBase: i.quantity_base,
          // Quantité réellement reçue (renseignée par merchant_transfer_
          // receive) — quantity_commercial n'existe PAS dans la table.
          receivedQuantityBase: i.received_quantity_base,
          unitCode: i.unit_code,
        }
      }),
    }))
    return NextResponse.json({ transfers, count: transfers.length })
  } catch (error) {
    console.error('Erreur lecture transferts:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des transferts' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/stock/transfers — envoi d'un transfert
 * (merchant_transfer_out : sorties TRANSFER_OUT + document status='sent',
 * idempotent sur clientId → operation_id déterministe).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = stockTransferCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const outcome = await transferOutViaRpc(supabase, {
      merchantId: data.merchantId,
      operationId: operationUuid(data.clientId),
      toMerchantId: data.toMerchantId,
      items: data.items,
      note: data.note ?? null,
    })

    if (!outcome.ok) {
      if ('business' in outcome) return businessError(outcome.business)
      if ('rpcMissing' in outcome) return NextResponse.json(RPC_MISSING, { status: 503 })
      console.error('Erreur RPC transfert envoi:', outcome.raw)
      return NextResponse.json({ erreur: "Erreur lors de l'envoi du transfert" }, { status: 500 })
    }

    const result = outcome.data as Record<string, unknown>
    return NextResponse.json(
      { created: result.created as boolean, transfer: result.transfer ?? null, items: result.items ?? [] },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    console.error('Erreur création transfert:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la création du transfert' }, { status: 500 })
  }
}

/**
 * PATCH /api/marchand/stock/transfers — action sur un transfert :
 * « recevoir » (merchant_transfer_receive : entrées RECEIPT + statut
 * received — SEUL le destinataire) ou « annuler » (merchant_transfer_
 * cancel, raison obligatoire — SEUL l'expéditeur). Le droit est vérifié
 * dans la RPC (p_merchant_id = to_merchant_id / merchant_id).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = stockTransferActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const outcome = data.action === 'recevoir'
      ? await transferReceiveViaRpc(supabase, {
          merchantId: data.merchantId,
          transferId: data.transferId,
        })
      : await transferCancelViaRpc(supabase, {
          merchantId: data.merchantId,
          transferId: data.transferId,
          reason: data.reason!,
        })

    if (!outcome.ok) {
      if ('business' in outcome) return businessError(outcome.business)
      if ('rpcMissing' in outcome) return NextResponse.json(RPC_MISSING, { status: 503 })
      console.error('Erreur RPC transfert action:', outcome.raw)
      return NextResponse.json({ erreur: "Erreur lors de l'action sur le transfert" }, { status: 500 })
    }

    const result = outcome.data as Record<string, unknown>
    return NextResponse.json({ transfer: result.transfer ?? null, items: result.items ?? [] })
  } catch (error) {
    console.error('Erreur action transfert:', error)
    return NextResponse.json({ erreur: "Erreur lors de l'action sur le transfert" }, { status: 500 })
  }
}

export const runtime = 'nodejs'
