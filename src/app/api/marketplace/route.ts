import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { operationUuid } from '@/lib/stock/stock-service'

function rpcError(error: unknown) {
  const e = error as { message?: string; details?: string }
  let detail: Record<string, unknown> = {}
  if (e?.details) {
    try { detail = JSON.parse(e.details) as Record<string, unknown> } catch {}
  }
  const code = e?.message ?? 'MARKETPLACE_ERROR'
  const status =
    code === 'INSUFFICIENT_MARKETPLACE_STOCK' ? 422 :
    code === 'LISTING_UNAVAILABLE' || code === 'SELLER_UNAVAILABLE' || code === 'PRODUCT_UNAVAILABLE' ? 409 :
    code === 'BUYER_NOT_FOUND' ? 404 : 400
  return NextResponse.json({ erreur: code, code, ...detail }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const sellerId = searchParams.get('sellerId')
    const q = searchParams.get('q')?.trim()
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50))
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

    let query = supabase
      .from('marketplace_listings')
      .select('id,seller_id,product_id,title,description,category,price_unit,currency,status,min_order_quantity,max_order_quantity,published_at,marketplace_seller_profiles!inner(merchant_id,display_name,description,zone,phone,status),marketplace_listing_images(image_url,position,alt_text)', { count: 'exact' })
      .eq('status', 'published')
      .eq('marketplace_seller_profiles.status', 'active')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) query = query.eq('category', category)
    if (sellerId) query = query.eq('seller_id', sellerId)
    if (q) query = query.ilike('title', '%' + q.replace(/[%_]/g, '') + '%')

    const { data, error, count } = await query
    if (error) throw error

    const listings = (data ?? []).map((row: any) => ({
      id: row.id,
      sellerId: row.seller_id,
      productId: row.product_id,
      title: row.title,
      description: row.description,
      category: row.category,
      priceUnit: Number(row.price_unit),
      currency: row.currency,
      minOrderQuantity: Number(row.min_order_quantity),
      maxOrderQuantity: row.max_order_quantity == null ? null : Number(row.max_order_quantity),
      seller: row.marketplace_seller_profiles,
      images: (row.marketplace_listing_images ?? []).sort((a: any,b: any) => a.position-b.position),
    }))

    return NextResponse.json({ listings, count: count ?? listings.length, limit, offset })
  } catch (error) {
    console.error('[marketplace GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du catalogue' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const buyerMerchantId = String(body.buyerMerchantId ?? '').trim()
    const auth = await requireDeviceOwner(request, 'merchant', buyerMerchantId)
    if (auth) return auth

    const rawItems = Array.isArray(body.items) ? body.items : []
    const items = rawItems.map((item: any) => ({
      listingId: String(item.listingId ?? '').trim(),
      quantity: Number(item.quantity),
    }))
    if (!items.length || items.some((i: any) => !i.listingId || !Number.isFinite(i.quantity) || i.quantity <= 0)) {
      return NextResponse.json({ erreur: 'Les articles et quantités sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const clientId = body.clientId ? operationUuid(String(body.clientId)) : null
    const { data, error } = await supabase.rpc('marketplace_create_order', {
      p_buyer_merchant_id: buyerMerchantId,
      p_items: items,
      p_client_id: clientId,
      p_delivery_fee_cfa: Math.max(0, Math.round(Number(body.deliveryFeeCfa) || 0)),
      p_discount_cfa: Math.max(0, Math.round(Number(body.discountCfa) || 0)),
      p_payment_method: body.paymentMethod ? String(body.paymentMethod) : null,
      p_delivery_mode: body.deliveryMode === 'delivery' || body.deliveryMode === 'courier' ? body.deliveryMode : 'pickup',
      p_delivery_address: body.deliveryAddress ? String(body.deliveryAddress) : null,
      p_delivery_zone: body.deliveryZone ? String(body.deliveryZone) : null,
      p_buyer_note: body.buyerNote ? String(body.buyerNote) : null,
    })
    if (error) return rpcError(error)
    return NextResponse.json(data, { status: data?.created ? 201 : 200 })
  } catch (error) {
    console.error('[marketplace POST]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la création de la commande' }, { status: 500 })
  }
}
