import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { computeMargin, PRICE_LEVELS, resolveCurrentPrice, type PriceEntry } from '@/lib/stock/prices'

/**
 * GET /api/marchand/stock/marge?merchantId=…&productId=…[&salePriceCfa=…]
 * Marge unitaire discrète (STK-810, §29-§30) — le calcul joint les
 * SOURCES réelles :
 *  • coût = weighted_avg_cost de la balance (coût moyen pondéré §30,
 *    alimenté par les achats RPC) ;
 *  • prix de vente = paramètre explicite (dicté / affiché à l'écran)
 *    OU prix courant RETAIL enregistré.
 * Coût inconnu → margin:null — la réponse DIT « je ne sais pas » au lieu
 * d'inventer. Perte → margin négatif affiché tel quel.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')
    const productId = searchParams.get('productId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    if (!productId) {
      return NextResponse.json({ erreur: 'productId obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const [balanceRes, pricesRes, productRes] = await Promise.all([
      supabase
        .from('merchant_stock_balances')
        .select('weighted_avg_cost, quantity_base, stock_precision')
        .eq('merchant_id', merchantId!)
        .eq('product_id', productId)
        .maybeSingle(),
      supabase
        .from('merchant_product_prices')
        .select('product_id, price_type, amount_cfa, valid_from, valid_to')
        .eq('merchant_id', merchantId!)
        .eq('product_id', productId),
      supabase.from('legacy_products').select('name').eq('id', productId).maybeSingle(),
    ])

    if (balanceRes.error) throw balanceRes.error
    if (pricesRes.error) throw pricesRes.error

    const balance = balanceRes.data as { weighted_avg_cost: number | null; quantity_base: number | null; stock_precision: string } | null
    const salePriceParam = searchParams.get('salePriceCfa')

    const priceEntries: PriceEntry[] = ((pricesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      priceType: r.price_type as string,
      amountCfa: r.amount_cfa as number,
      validFrom: r.valid_from as string,
      validTo: r.valid_to as string | null,
    }))

    // Prix de vente : paramètre explicite sinon RETAIL courant sinon null.
    let salePriceCfa: number | null = null
    if (salePriceParam !== null && salePriceParam !== '') {
      const n = Number(salePriceParam)
      if (Number.isFinite(n) && n >= 0) salePriceCfa = n
    }
    if (salePriceCfa === null) {
      const retail = resolveCurrentPrice(priceEntries, 'RETAIL')
      salePriceCfa = retail?.amountCfa ?? null
    }

    const unitCostCfa = balance?.weighted_avg_cost != null && balance.weighted_avg_cost > 0
      ? Number(balance.weighted_avg_cost)
      : null

    const margin = salePriceCfa !== null ? computeMargin(salePriceCfa, unitCostCfa) : null

    // Prix courants tous niveaux (le panneau discret montre tout §29).
    const currentPrices: Record<string, number | null> = {}
    for (const level of PRICE_LEVELS) {
      const hit = resolveCurrentPrice(priceEntries, level)
      currentPrices[level] = hit?.amountCfa ?? null
    }

    return NextResponse.json({
      productId,
      productName: (productRes.data as { name: string } | null)?.name ?? null,
      unitCostCfa,
      salePriceCfa,
      margin,
      currentPrices,
      stockPrecision: balance?.stock_precision ?? 'UNKNOWN',
    })
  } catch (error) {
    console.error('Erreur calcul marge:', error)
    return NextResponse.json({ erreur: 'Erreur lors du calcul de la marge' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
