import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { awardLoyaltyForEvent } from '@/lib/loyalty/evaluator'
import { createSaleSchema, formatZodError } from '@/lib/validation/marchand'
import {
  operationUuid,
  parseStockRpcError,
  recordSaleViaRpc,
  type StockBusinessError,
} from '@/lib/stock/stock-service'

function mapSale(row: Record<string, unknown>) {
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

function mapSaleItem(row: Record<string, unknown>) {
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

    // MODE-939 (AUDIT-003 PF-03) — la liste est BORNÉE (plafond 500,
    // défaut 200, plus récentes d'abord) au lieu de charger tout
    // l'historique du marchand. Les annulations ne sont plus lues pour
    // TOUT le marchand : seules celles ciblant les ventes de la page
    // (WHERE sale_client_id IN …) — le même scan sur une table indexée,
    // pas sur le grand livre entier.
    const limitBrut = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitBrut) ? Math.min(500, Math.max(1, limitBrut)) : 200

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
    query = query.limit(limit)

    const { data: sales, error: salesError } = await query
    if (salesError) throw salesError

    const saleIds = (sales ?? []).map((s) => s.id)

    let items: Record<string, unknown>[] = []
    if (saleIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('legacy_sale_items')
        .select('*')
        .in('sale_id', saleIds)
      if (itemsError) throw itemsError
      items = itemsData ?? []
    }

    // MODE-909 (§28) — annulations : une vente annulée = EXISTS une
    // merchant_sale_reversals la ciblant. La LISTE garde toutes les ventes
    // (historique intact — jamais de suppression) ; chaque vente porte
    // `annulee: boolean`. Table non migrée (42P01) → personne n'est annulé,
    // JAMAIS bloquant (compat avant/après migration).
    // MODE-939 (PF-03) — borné aux ventes de la page (IN), plus jamais
    // le scan des reversals du marchand entier.
    const reversedClientIds = new Set<string>()
    const pageClientIds = (sales ?? []).map((s) => s.client_id).filter((c): c is string => typeof c === 'string')
    if (pageClientIds.length > 0) {
      try {
        const { data: reversals, error: reversalsError } = await supabase
          .from('merchant_sale_reversals')
          .select('sale_client_id')
          .eq('merchant_id', merchantId!)
          .in('sale_client_id', pageClientIds)
        if (!reversalsError) {
          for (const r of reversals ?? []) {
            if (typeof r.sale_client_id === 'string') reversedClientIds.add(r.sale_client_id)
          }
        }
      } catch {
        // Table absente / réseau : annulée = false, honnête par défaut.
      }
    }

    const salesWithItems = (sales ?? []).map((s) => ({
      ...mapSale(s),
      annulee: s.client_id ? reversedClientIds.has(s.client_id as string) : false,
      items: items.filter((i) => i.sale_id === s.id).map(mapSaleItem),
    }))

    // Revenu = ce qui est COMPTE : les ventes annulées restent visibles
    // dans l'historique mais sortent du chiffre d'affaires ; elles sont
    // comptées à part (cancelledCount).
    const countedSales = salesWithItems.filter((s) => !s.annulee)
    const totalRevenue = countedSales.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0)

    return NextResponse.json({
      sales: salesWithItems,
      totalRevenue,
      count: salesWithItems.length,
      cancelledCount: salesWithItems.length - countedSales.length,
      // MODE-939 (PF-03) — le client peut savoir que la page est bornée
      // (count === limit ⇒ il peut exister des ventes plus anciennes).
      limit,
    })
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
    const { merchantId, items, amountReceived, paymentMethod, isVoiceSale, voiceTranscript, note, clientId, sellingPointClientId, sellingPointName, sessionId } = parsed.data

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
      // MODE-939 (F-10) — la vente porte sa session de caisse : le bilan
      // de clôture est réconciliable serveur (le champ RPC existait déjà,
      // la route ne le transmettait jamais — les achats, si).
      sessionId: sessionId ?? null,
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
      // La vente est déjà validée par la RPC stock. La fidélité est une
      // projection secondaire : une panne de son moteur ne doit jamais
      // annuler ni ralentir une vente terrain.
      void awardLoyaltyForEvent(supabase, {
        subjectId: merchantId,
        subjectRole: 'marchand',
        actionType: 'sale',
        source: 'sale',
        sourceId: String(sale.id),
        amountCfa: Number(sale.total_amount ?? 0),
        metadata: { sessionId: sessionId ?? null, clientId: clientId ?? null },
      }).catch((error) => console.error('[loyalty] attribution vente', error))
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
        sellingPointClientId, sellingPointName,
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
 * ne jamais envoyer la colonne si la base ne la connaît pas encore).
 * MODE-908 : sellingPointClientId est résolu en merchant_selling_points.id
 * et écrit dans selling_point_client_id SEULEMENT si résolu (point inconnu
 * ou table non migrée → pas de colonne, la vente n'est JAMAIS bloquée —
 * même écart documenté A1 que payment_method pour la RPC, non modifiée). */
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
    sellingPointClientId?: string
    sellingPointName?: string
  },
) {
  // MODE-908 — résolution de l'étiquette : client_id → merchant_selling_points.id.
  // Jamais bloquante : toute erreur (point inconnu, table absente) laisse la
  // vente partir sans la colonne.
  let sellingPointId: string | null = null
  if (data.sellingPointClientId) {
    try {
      const { data: point, error: pointError } = await supabase
        .from('merchant_selling_points')
        .select('id')
        .eq('client_id', data.sellingPointClientId)
        .maybeSingle()
      if (!pointError && point?.id) {
        sellingPointId = point.id as string
      }
    } catch {
      // Table non migrée / réseau : l'étiquette est simplement absente.
    }
  }

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
  if (sellingPointId) {
    // MODE-908 — étiquette du point de vente, uniquement si résolue.
    saleRow.selling_point_client_id = sellingPointId
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
