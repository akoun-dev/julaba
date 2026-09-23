import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { getDeviceSubject } from '@/lib/device-session'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createSupabaseAdminClient()
    const { data: order, error } = await supabase.from('marketplace_orders').select('*').eq('id', id).single()
    if (error || !order) return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })

    const subject = await getDeviceSubject(request)
    if (!subject) return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })

    const [items, events, delivery, payments] = await Promise.all([
      supabase.from('marketplace_order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('marketplace_order_events').select('*').eq('order_id', id).order('created_at'),
      supabase.from('marketplace_deliveries').select('*').eq('order_id', id).maybeSingle(),
      supabase.from('marketplace_payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    ])

    const buyerSubject = `merchant:${order.buyer_merchant_id}`
    const ownsBuyer = subject === buyerSubject
    const sellerIds = [...new Set((items.data ?? []).map((i: any) => i.seller_id))]
    let sellerMerchantIds: string[] = []
    if (sellerIds.length) {
      const { data: sellers } = await supabase.from('marketplace_seller_profiles').select('id,merchant_id').in('id', sellerIds)
      sellerMerchantIds = (sellers ?? []).map((s: any) => `merchant:${s.merchant_id}`)
    }
    if (!ownsBuyer && !sellerMerchantIds.includes(subject)) {
      return NextResponse.json({ erreur: 'Accès refusé' }, { status: 403 })
    }

    return NextResponse.json({ order, items: items.data ?? [], events: events.data ?? [], delivery: delivery.data ?? null, payments: payments.data ?? [] })
  } catch (error) {
    console.error('[marketplace order GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement de la commande' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = createSupabaseAdminClient()
    const { data: order, error } = await supabase.from('marketplace_orders').select('id,buyer_merchant_id,status').eq('id', id).single()
    if (error || !order) return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })

    if (body.action !== 'cancel') return NextResponse.json({ erreur: 'Action inconnue' }, { status: 400 })
    const actor = await requireDeviceOwner(request, 'merchant', order.buyer_merchant_id)
    if (actor) return actor

    const { data, error: rpcError } = await supabase.rpc('marketplace_cancel_order', {
      p_order_id: id,
      p_actor_type: 'buyer',
      p_actor_id: order.buyer_merchant_id,
      p_reason: body.reason ? String(body.reason) : null,
    })
    if (rpcError) return NextResponse.json({ erreur: rpcError.message }, { status: 409 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('[marketplace order PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur lors de l’annulation' }, { status: 500 })
  }
}
