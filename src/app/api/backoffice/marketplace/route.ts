import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// DET-004 (MODE-980) — types de ligne minimaux (colonnes réellement
// consommées ; l'index `[key: string]: unknown` préserve le spread du
// select('*') vers la réponse).
interface MarketProductRow {
  merchant_id: string | null
  category: string | null
  [key: string]: unknown
}
interface MarketMerchantRow {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}


export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()

    const [productsResult, totalProductsResult] = await Promise.all([
      supabase
        .from('legacy_products')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('legacy_products')
        .select('*', { count: 'exact', head: true }),
    ])

    if (productsResult.error) throw productsResult.error
    if (totalProductsResult.error) throw totalProductsResult.error

    const products = productsResult.data || []
    const totalProducts = totalProductsResult.count || 0

    // Fetch merchants and merge
    const merchantIds = [...new Set((products as MarketProductRow[]).map((p) => p.merchant_id).filter(Boolean))]
    let merchantMap: Record<string, MarketMerchantRow> = {}
    if (merchantIds.length > 0) {
      const { data: merchants } = await supabase
        .from('merchants')
        .select('id, first_name, last_name, phone')
        .in('id', merchantIds)

      for (const m of merchants || []) {
        merchantMap[m.id] = m
      }
    }

    const productsWithMerchants = (products as MarketProductRow[]).map((p) => {
      const merchant = merchantMap[p.merchant_id ?? ''] || null
      return {
        ...p,
        merchant: merchant ? {
          firstName: merchant.first_name,
          lastName: merchant.last_name,
          phone: merchant.phone,
        } : null,
      }
    })

    // Group by category in JS
    const categoryMap: Record<string, { count: number, stockSum: number }> = {}
    for (const p of products) {
      const cat = p.category || 'sans_categorie'
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, stockSum: 0 }
      }
      categoryMap[cat].count += 1
      categoryMap[cat].stockSum += p.stock_qty || 0
    }

    const categories = Object.entries(categoryMap).map(([category, agg]) => ({
      category,
      _count: { id: agg.count },
      _sum: { stock_qty: agg.stockSum },
    }))

    return NextResponse.json({
      products: productsWithMerchants,
      totalProducts,
      categories,
    })
  } catch (error) {
    console.error('Erreur marketplace:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du marketplace' }, { status: 500 })
  }
}
