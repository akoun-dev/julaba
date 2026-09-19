import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createSaleSchema, formatZodError } from '@/lib/validation/marchand'
import {
  operationUuid,
  parseStockRpcError,
  recordSaleViaRpc,
  type StockBusinessError,
} from '@/lib/stock/stock-service'

function mapSale(row: any) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    totalAmount: row.total_amount as number,
    amountReceived: row.amount_received as number,
    changeAmount: row.change_amount as number,
    isVoiceSale: row.is_voice_sale as boolean,
    voiceTranscript: row.voice_transcript as string | null,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapSaleItem(row: any) {
  return {
    id: row.id as string,
    saleId: row.sale_id as string,
    productName: row.product_name as string,
    quantity: row.quantity as number,
    unitPrice: row.unit_price as number,
    subtotal: row.subtotal as number,
    productId: row.product_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('legacy_sales')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString())
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString())
    }

    const { data: sales, error: salesError } = await query
    if (salesError) throw salesError

    const saleIds = (sales ?? []).map((s) => s.id)

    let items: any[] = []
    if (saleIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('legacy_sale_items')
        .select('*')
        .in('sale_id', saleIds)
      if (itemsError) throw itemsError
      items = itemsData ?? []
    }

    const salesWithItems = (sales ?? []).map((s) => ({
      ...mapSale(s),
      items: items.filter((i) => i.sale_id === s.id).map(mapSaleItem),
    }))

    const totalRevenue = salesWithItems.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0)

    return NextResponse.json({ sales: salesWithItems, totalRevenue, count: salesWithItems.length })
  } catch (error) {
    console.error('Erreur ventes marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des ventes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createSaleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, items, amountReceived, paymentMethod, isVoiceSale, voiceTranscript, note, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_sales')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        const { data: existingItems } = await supabase
          .from('legacy_sale_items')
          .select('*')
          .eq('sale_id', existing.id)
        return NextResponse.json(
          { ...mapSale(existing), items: (existingItems ?? []).map(mapSaleItem) },
          { status: 200 },
        )
      }
    }

    // ── Bascule STK-804 : la transaction de vente vit désormais dans
    // PostgreSQL (merchant_record_sale) — verrous FOR UPDATE, refus strict
    // INSUFFICIENT_STOCK (§3 : IMPOSSIBLE DE VENDRE SANS STOCK), mouvement
    // SALE + balance + double écriture legacy (D3), tout-ou-rien. L'idem-
    // potence offline est double : pré-check client_id ci-dessus (ventes
    // d'avant bascule) + operation_id UUID dérivé DÉTERMINISTEMENT du
    // clientId (rejeu offline → RPC idempotente, jamais de doublon).
    const rpcItems = items.map((item) => ({
      productId: item.productId ?? null,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
    const outcome = await recordSaleViaRpc(supabase, {
      merchantId,
      operationId: operationUuid(clientId),
      items: rpcItems,
      amountReceived: amountReceived || 0,
      isVoiceSale: isVoiceSale || false,
      voiceTranscript: voiceTranscript || null,
      note: note || null,
    })

    if (outcome.ok) {
      const result = outcome.data as Record<string, unknown>
      const sale = result.sale as Record<string, unknown>
      // Contrat de réponse préservé : mêmes champs que l'ancien chemin
      // (écrans et file offline ne lisent que le statut, mais le GET et
      // les clients à jour attendent items depuis legacy_sale_items).
      const { data: saleItems } = await supabase
        .from('legacy_sale_items')
        .select('*')
        .eq('sale_id', sale.id)
      return NextResponse.json(
        { ...mapSale(sale), items: (saleItems ?? []).map(mapSaleItem) },
        { status: result.created ? 201 : 200 },
      )
    }

    if ('business' in outcome) {
      // Refus métier (§36) : 422 + payload {available, requested, unit,
      // product} — la marchande/Tata doit pouvoir corriger intelligemment.
      const b: StockBusinessError = outcome.business
      const labels: Record<string, string> = {
        INSUFFICIENT_STOCK: 'Stock insuffisant',
        PRODUCT_NOT_FOUND: 'Produit introuvable',
        PRODUCT_INACTIVE: 'Produit inactif',
        INVALID_QUANTITY: 'Quantité invalide',
        UNKNOWN_STOCK: "Stock inconnu — compte le stock d'abord",
      }
      return NextResponse.json(
        { erreur: labels[b.code] ?? b.code, ...b },
        { status: b.code === 'INSUFFICIENT_STOCK' || b.code === 'UNKNOWN_STOCK' ? 422 : 400 },
      )
    }

    if ('rpcMissing' in outcome) {
      // Migrations STK-802/803 pas encore appliquées en base (db push à
      // venir) : repli sur l'ancien chemin (2 inserts) pour NE JAMAIS
      // bloquer une vente — intégration progressive, zéro régression.
      console.warn('stock: RPC merchant_record_sale indisponible, repli legacy (db push à faire)')
      return await legacyInsertSale(supabase, {
        merchantId, items, amountReceived, paymentMethod, isVoiceSale, voiceTranscript, note, clientId,
      })
    }

    console.error('Erreur RPC vente:', outcome.raw)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la vente' }, { status: 500 })
  } catch (error) {
    console.error('Erreur creation vente:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la vente' }, { status: 500 })
  }
}

/** Ancien chemin (2 inserts non transactionnels) — conservé UNIQUEMENT
 * comme repli tant que les migrations de stock ne sont pas appliquées en
 * base. Aucun suivi de stock ici : c'est le comportement historique.
 * MODE-906 : payment_method est écrit SEULEMENT quand fourni ≠ 'especes'
 * (colonne avec défaut → compatible avant/après migration 20260919130000 :
 * ne jamais envoyer la colonne si la base ne la connaît pas encore). */
async function legacyInsertSale(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  data: {
    merchantId: string
    items: Array<{ productName: string; quantity: number; unitPrice: number; productId?: string }>
    amountReceived?: number
    paymentMethod?: 'especes' | 'mobile_money' | 'credit' | 'autre'
    isVoiceSale?: boolean
    voiceTranscript?: string
    note?: string
    clientId?: string
  },
) {
  const saleItemsData = data.items.map((item) => ({
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.quantity * item.unitPrice,
    product_id: item.productId || null,
  }))

  const totalAmount = saleItemsData.reduce((sum, item) => sum + item.subtotal, 0)
  const changeAmount = (data.amountReceived || 0) - totalAmount

  const saleRow: Record<string, unknown> = {
    merchant_id: data.merchantId,
    client_id: data.clientId || null,
    total_amount: totalAmount,
    amount_received: data.amountReceived || 0,
    change_amount: Math.max(0, changeAmount),
    is_voice_sale: data.isVoiceSale || false,
    voice_transcript: data.voiceTranscript || null,
    note: data.note || null,
  }
  if (data.paymentMethod && data.paymentMethod !== 'especes') {
    saleRow.payment_method = data.paymentMethod
  }

  const { data: sale, error: saleError } = await supabase
    .from('legacy_sales')
    .insert(saleRow)
    .select()
    .single()
  if (saleError) throw saleError

  if (saleItemsData.length > 0) {
    const itemsWithSaleId = saleItemsData.map((item) => ({ ...item, sale_id: sale.id }))
    const { error: itemsError } = await supabase
      .from('legacy_sale_items')
      .insert(itemsWithSaleId)
    if (itemsError) throw itemsError
  }

  const { data: saleItems } = await supabase
    .from('legacy_sale_items')
    .select('*')
    .eq('sale_id', sale.id)

  return NextResponse.json(
    { ...mapSale(sale), items: (saleItems ?? []).map(mapSaleItem) },
    { status: 201 },
  )
}
