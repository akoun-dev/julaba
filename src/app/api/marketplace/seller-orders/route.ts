import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

const TRANSITIONS: Record<string, string[]> = { pending: ['confirmed', 'cancelled', 'rejected'], confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['shipped'], shipped: ['delivered'] }

export async function GET(request: NextRequest) {
  const merchantId = new URL(request.url).searchParams.get('merchantId')?.trim()
  if (!merchantId) return NextResponse.json({ erreur: 'merchantId requis' }, { status: 400 })
  const auth = await requireDeviceOwner(request, 'producteur', merchantId); if (auth) return auth
  const supabase = createSupabaseAdminClient()
  try {
    const { data: seller, error: sellerError } = await supabase.from('marketplace_seller_profiles').select('id,merchant_id,display_name,status').eq('merchant_id', merchantId).single()
    if (sellerError || !seller) return NextResponse.json({ orders: [] })
    const { data: items, error: itemError } = await supabase.from('marketplace_order_items').select('id,order_id,listing_id,product_id,product_name,quantity,unit_price_cfa,subtotal_cfa,seller_id').eq('seller_id', seller.id).order('created_at', { ascending: false })
    if (itemError) throw itemError
    const orderIds = [...new Set((items ?? []).map((i: any) => i.order_id))]
    if (!orderIds.length) return NextResponse.json({ orders: [], seller })
    const { data: orders, error: orderError } = await supabase.from('marketplace_orders').select('id,order_number,buyer_merchant_id,total_cfa,status,payment_status,payment_method,delivery_status,delivery_address,delivery_zone,buyer_note,created_at,updated_at').in('id', orderIds).order('created_at', { ascending: false })
    if (orderError) throw orderError
    const buyerIds = [...new Set((orders ?? []).map((o: any) => o.buyer_merchant_id))]
    const { data: buyers } = buyerIds.length ? await supabase.from('merchants').select('id,first_name,last_name,phone').in('id', buyerIds) : { data: [] as any[] }
    const buyerMap = new Map<string, any>((buyers ?? []).map((b: any): [string, any] => [b.id, b]))
    return NextResponse.json({ seller, orders: (orders ?? []).map((o: any) => {
      const orderItems = (items ?? []).filter((i: any) => i.order_id === o.id)
      const uniqueSellers = [...new Set((items ?? []).filter((i: any) => i.order_id === o.id).map((i: any) => i.seller_id))]
      const buyer = buyerMap.get(o.buyer_merchant_id)
      return { ...o, buyerName: [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ') || 'Marchand', buyerPhone: buyer?.phone ?? null, items: orderItems, multiSeller: uniqueSellers.length > 1 }
    }) })
  } catch (error) { console.error('[marketplace seller-orders GET]', error); return NextResponse.json({ erreur: 'Impossible de charger les commandes marketplace' }, { status: 500 }) }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json(); const merchantId = String(body.merchantId ?? '').trim(); const orderId = String(body.orderId ?? '').trim(); const target = String(body.status ?? '').trim()
  if (!merchantId || !orderId || !target) return NextResponse.json({ erreur: 'merchantId, orderId et status sont requis' }, { status: 400 })
  const auth = await requireDeviceOwner(request, 'producteur', merchantId); if (auth) return auth
  const supabase = createSupabaseAdminClient()
  try {
    const { data: seller } = await supabase.from('marketplace_seller_profiles').select('id,merchant_id,status').eq('merchant_id', merchantId).single()
    if (!seller || seller.status !== 'active') return NextResponse.json({ erreur: 'Profil vendeur indisponible' }, { status: 403 })
    const { data: order } = await supabase.from('marketplace_orders').select('id,status').eq('id', orderId).single()
    if (!order) return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })
    const { data: orderItems } = await supabase.from('marketplace_order_items').select('seller_id').eq('order_id', orderId)
    const sellerIds = [...new Set((orderItems ?? []).map((i: any) => i.seller_id))]
    if (!sellerIds.includes(seller.id)) return NextResponse.json({ erreur: 'Cette commande ne vous appartient pas' }, { status: 403 })
    if (sellerIds.length > 1) return NextResponse.json({ erreur: 'Commande multi-vendeurs : traitement séparé non autorisé' }, { status: 409 })
    if (!TRANSITIONS[order.status]?.includes(target)) return NextResponse.json({ erreur: 'Transition ' + order.status + ' → ' + target + ' non autorisée' }, { status: 409 })
    const updates: Record<string, unknown> = { status: target, updated_at: new Date().toISOString() }
    if (target === 'confirmed') updates.confirmed_at = new Date().toISOString(); if (target === 'delivered') updates.delivered_at = new Date().toISOString()
    const { data: updated, error } = await supabase.from('marketplace_orders').update(updates).eq('id', orderId).select().single(); if (error) throw error
    await supabase.from('marketplace_order_events').insert({ order_id: orderId, event_type: 'status_changed', from_status: order.status, to_status: target, actor_type: 'seller', actor_id: merchantId })
    return NextResponse.json({ order: updated })
  } catch (error) { console.error('[marketplace seller-orders PATCH]', error); return NextResponse.json({ erreur: 'Impossible de mettre à jour la commande' }, { status: 500 }) }
}