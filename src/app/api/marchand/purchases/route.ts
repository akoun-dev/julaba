import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createPurchaseSchema, formatZodError } from '@/lib/validation/marchand'
import {
  operationUuid,
  recordPurchaseViaRpc,
  type StockBusinessError,
} from '@/lib/stock/stock-service'

function mapPurchase(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    supplierId: row.supplier_id as string | null,
    sessionId: row.session_id as string | null,
    totalAmount: row.total_amount as number,
    amountPaid: row.amount_paid as number,
    note: row.note as string | null,
    createdAt: row.created_at as string,
  }
}

function mapPurchaseItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    purchaseId: row.purchase_id as string,
    productId: row.product_id as string | null,
    productName: row.product_name as string,
    quantity: row.quantity as number,
    unitCode: row.unit_code as string | null,
    quantityBase: row.quantity_base as number,
    unitCostCfa: row.unit_cost_cfa as number,
    lineCostCfa: row.line_cost_cfa as number,
    createdAt: row.created_at as string,
  }
}

/**
 * GET /api/marchand/purchases?merchantId=…[&limit=…]
 * Historique des achats de marchandises (documents + lignes).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)

    const { data: purchases, error } = await supabase
      .from('merchant_purchases')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error

    const purchaseIds = (purchases ?? []).map((p: Record<string, unknown>) => p.id as string)
    let items: Record<string, unknown>[] = []
    if (purchaseIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('merchant_purchase_items')
        .select('*')
        .in('purchase_id', purchaseIds)
      if (itemsError) throw itemsError
      items = itemsData ?? []
    }

    const purchasesWithItems = (purchases ?? []).map((p: Record<string, unknown>) => ({
      ...mapPurchase(p),
      items: items.filter((i) => i.purchase_id === p.id).map(mapPurchaseItem),
    }))

    return NextResponse.json({
      purchases: purchasesWithItems,
      count: purchasesWithItems.length,
    })
  } catch (error) {
    console.error('Erreur achats marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des achats' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/purchases
 * Achat de marchandises (§10/§30) via la RPC transactionnelle
 * merchant_record_purchase : document + lignes + mouvement PURCHASE
 * (+qty) + balance + COÛT MOYEN PONDÉRÉ, tout dans la même transaction.
 * Un premier achat MET LE PRODUIT SOUS SUIVI (balance créée EXACT).
 * Dépense comptable liée OPTIONNELLE (D6 : achat ≠ dépense).
 * Idempotence offline : client_id = operation_id dérivé du clientId.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createPurchaseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const operationId = operationUuid(data.clientId)

    const outcome = await recordPurchaseViaRpc(supabase, {
      merchantId: data.merchantId,
      operationId,
      items: data.items.map((item) => ({
        productId: item.productId ?? null,
        productName: item.productName,
        quantity: item.quantity,
        quantityBase: item.quantityBase,
        unitCode: item.unitCode,
        unitCostCfa: item.unitCostCfa,
      })),
      supplierId: data.supplierId,
      amountPaid: data.amountPaid,
      note: data.note,
      sessionId: data.sessionId,
      createExpense: data.createExpense,
      expenseCategory: data.expenseCategory,
    })

    if (!outcome.ok) {
      if ('business' in outcome) {
        const b: StockBusinessError = outcome.business
        const labels: Record<string, string> = {
          PRODUCT_NOT_FOUND: 'Produit introuvable',
          INVALID_QUANTITY: 'Quantité ou coût invalide',
        }
        return NextResponse.json(
          { erreur: labels[b.code] ?? b.code, ...b },
          { status: 400 },
        )
      }
      if ('rpcMissing' in outcome) {
        return NextResponse.json(
          { erreur: 'Le module de stock n\'est pas encore actif sur le serveur (db push requis).', code: 'STOCK_RPC_MISSING' },
          { status: 503 },
        )
      }
      console.error('Erreur RPC achat stock:', outcome.raw)
      return NextResponse.json({ erreur: 'Erreur lors de l\'enregistrement de l\'achat' }, { status: 500 })
    }

    const result = outcome.data as Record<string, unknown>
    const purchase = result.purchase as Record<string, unknown>
    return NextResponse.json(
      {
        created: result.created as boolean,
        ...mapPurchase(purchase),
        items: result.items ?? [],
        expenseId: (result.expense_id as string | null) ?? null,
      },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    console.error('Erreur creation achat:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'achat' }, { status: 500 })
  }
}
