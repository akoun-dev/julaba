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
 * GET /api/marchand/purchases?merchantId=…[&limit=…][&supplierId=…|&supplierClientId=…]
 * Historique des achats de marchandises (documents + lignes).
 * MODE-907 (§15) — filtre par fournisseur : supplierId direct, ou
 * supplierClientId (client_id du partenaire) résolu en business_partners.id ;
 * fournisseur jamais synchronisé → liste vide honnête (jamais tous les
 * achats).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)

    // MODE-907 — résolution du filtre fournisseur (supplierId prioritaire).
    let supplierFilter: string | null = searchParams.get('supplierId')
    const supplierClientId = searchParams.get('supplierClientId')
    if (!supplierFilter && supplierClientId) {
      const { data: partner, error: partnerError } = await supabase
        .from('business_partners')
        .select('id')
        .eq('client_id', supplierClientId)
        .eq('merchant_id', merchantId!)
        .maybeSingle()
      if (partnerError) throw partnerError
      if (!partner) {
        // Le partenaire n'existe pas (encore) côté serveur : aucun achat ne
        // peut le référencer — liste vide, JAMAIS l'historique complet.
        return NextResponse.json({ purchases: [], count: 0 })
      }
      supplierFilter = (partner as { id: string }).id
    }

    let purchasesQuery = supabase
      .from('merchant_purchases')
      .select('*')
      .eq('merchant_id', merchantId!)
    if (supplierFilter) {
      purchasesQuery = purchasesQuery.eq('supplier_id', supplierFilter)
    }
    const { data: purchases, error } = await purchasesQuery
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
 * MODE-907 (§15) — résolution du fournisseur d'un achat.
 * supplierClientId (client_id d'idempotence du partenaire) →
 * business_partners.id, scopé au marchand. Introuvable : création à la
 * volée SI supplierName (upsert idempotent — course 23505 → relecture),
 * sinon refus 422 honnête. Table non migrée (42P01) → 503 transitoire.
 */
type SupplierResolution =
  | { ok: true; id: string }
  | { ok: false; status: number; erreur: string }

async function resolveSupplierId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  merchantId: string,
  supplierClientId: string,
  supplierName: string | undefined,
): Promise<SupplierResolution> {
  const { data: existing } = await supabase
    .from('business_partners')
    .select('id')
    .eq('client_id', supplierClientId)
    .eq('merchant_id', merchantId)
    .maybeSingle()
  if (existing) return { ok: true, id: (existing as { id: string }).id }

  const name = supplierName?.trim()
  if (!name || name.length < 2) {
    return { ok: false, status: 422, erreur: 'Fournisseur inconnu' }
  }

  const { data: created, error } = await supabase
    .from('business_partners')
    .insert({
      merchant_id: merchantId,
      client_id: supplierClientId,
      kind: 'fournisseur',
      name,
      phone: null,
      notes: null,
    })
    .select('id')
    .single()

  if (!error && created) return { ok: true, id: (created as { id: string }).id }

  const code = (error as { code?: string }).code
  if (code === '23505') {
    // Course concurrente (le partenaire vient d'être créé, ex. rejeu de la
    // file 'merchant-partner') : relecture → même contrat que l'upsert.
    const { data: reread } = await supabase
      .from('business_partners')
      .select('id')
      .eq('client_id', supplierClientId)
      .eq('merchant_id', merchantId)
      .maybeSingle()
    if (reread) return { ok: true, id: (reread as { id: string }).id }
    return { ok: false, status: 409, erreur: 'Conflit de création du fournisseur' }
  }
  if (code === '42P01') {
    return { ok: false, status: 503, erreur: 'Table partenaires non encore migrée' }
  }
  console.error('[purchases] création fournisseur à la volée échouée:', error?.message ?? code)
  return { ok: false, status: 500, erreur: 'Création du fournisseur impossible' }
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

    // MODE-907 (§15) — fournisseur : supplierId direct (compat, la RPC
    // valide son existence) OU supplierClientId résolu en
    // business_partners.id (création à la volée si supplierName, sinon 422
    // « Fournisseur inconnu »). supplierName SEUL (sans client_id) n'est ni
    // résolu ni créé — aucune clé d'idempotence appareil : l'achat part
    // sans fournisseur plutôt qu'un rattachement incertain.
    let supplierId: string | null | undefined = data.supplierId
    if (!supplierId && data.supplierClientId) {
      const resolved = await resolveSupplierId(supabase, data.merchantId, data.supplierClientId, data.supplierName)
      if (!resolved.ok) {
        return NextResponse.json({ erreur: resolved.erreur }, { status: resolved.status })
      }
      supplierId = resolved.id
    }

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
      supplierId,
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
