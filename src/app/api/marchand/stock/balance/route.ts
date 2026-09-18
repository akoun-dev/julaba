import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { backfillOpeningBalancesViaRpc } from '@/lib/stock/stock-service'

function mapBalance(row: Record<string, unknown>, product?: Record<string, unknown>) {
  return {
    productId: row.product_id as string,
    product: (product?.name as string) ?? null,
    quantityBase: row.quantity_base as number,
    stockPrecision: row.stock_precision as 'EXACT' | 'ESTIMATED' | 'UNKNOWN',
    lowStockThreshold: row.low_stock_threshold as number | null,
    weightedAvgCost: row.weighted_avg_cost as number | null,
    lastMovementAt: row.last_movement_at as string | null,
    legacyStockQty: (product?.stock_qty as number) ?? null,
    updatedAt: row.updated_at as string,
  }
}

/**
 * GET /api/marchand/stock/balance?merchantId=…&productId=…
 * Cache lisible du stock (source de vérité = merchant_stock_movements).
 *
 * Au premier accès d'un marchand dont aucun produit n'a encore de balance
 * (bascule STK-804), déclenche le backfill OPENING_BALANCE (§40) :
 * idempotent, rejouable, l'ancien stock legacy devient le point de départ
 * de l'historique. Sans balance, la RPC de vente traiterait le produit
 * comme non suivi (D7) — le backfill est donc la marche d'entrée obligée.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const productId = searchParams.get('productId')

    let balances = await loadBalances(supabase, merchantId!, productId)

    // Auto-backfill : le marchand a des produits mais AUCUNE balance →
    // les balances n'existent pas encore (idempotent, une seule fois).
    if (balances.length === 0 && !productId) {
      const { data: products } = await supabase
        .from('legacy_products')
        .select('id')
        .eq('merchant_id', merchantId!)
        .eq('is_active', true)
        .limit(1)
      if ((products ?? []).length > 0) {
        const outcome = await backfillOpeningBalancesViaRpc(supabase)
        if (outcome.ok) {
          console.info('stock: backfill OPENING_BALANCE', outcome.data)
          balances = await loadBalances(supabase, merchantId!, productId)
        } else if ('rpcMissing' in outcome) {
          // Migrations STK-802/803 pas encore appliquées en base : on
          // répond avec les données legacy (jamais de fausse erreur).
          console.warn('stock: RPC backfill indisponible (db push à faire)')
        } else {
          console.error('stock: backfill échoué', outcome)
        }
      }
    }

    return NextResponse.json({ balances, count: balances.length })
  } catch (error) {
    console.error('Erreur balance stock marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du stock' }, { status: 500 })
  }
}

async function loadBalances(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  merchantId: string,
  productId: string | null,
) {
  let query = supabase
    .from('merchant_stock_balances')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('last_movement_at', { ascending: false, nullsFirst: false })
  if (productId) query = query.eq('product_id', productId)

  const { data: rows, error } = await query
  if (error) throw error

  const productIds = (rows ?? []).map((r: Record<string, unknown>) => r.product_id as string)
  const productsById = new Map<string, Record<string, unknown>>()
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('legacy_products')
      .select('id, name, stock_qty')
      .in('id', productIds)
    for (const p of products ?? []) productsById.set(p.id as string, p)
  }

  return (rows ?? []).map((r: Record<string, unknown>) =>
    mapBalance(r, productsById.get(r.product_id as string)),
  )
}
