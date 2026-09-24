import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { getDeviceSubject } from '@/lib/device-session'
import { reponseErreurMarketplace } from '@/lib/marketplace-errors'

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
    const { data: order, error } = await supabase.from('marketplace_orders').select('id,buyer_merchant_id,status,total_cfa,buyer_received_at').eq('id', id).single()
    if (error || !order) return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })

    const actor = await requireDeviceOwner(request, 'merchant', order.buyer_merchant_id)
    if (actor) return actor

    if (body.action === 'payment') {
      const method = ['cash','mobile_money','card','wallet','credit','cash_on_delivery','other'].includes(String(body.paymentMethod)) ? String(body.paymentMethod) : null
      if (!method) return NextResponse.json({ erreur:'Mode de paiement invalide' }, {status:400})
      const { data: existingPending } = await supabase.from('marketplace_payments').select('id,status').eq('order_id',id).in('status',['pending','authorized']).maybeSingle()
      if (existingPending) return NextResponse.json({erreur:'Un paiement est déjà en attente pour cette commande',payment:existingPending},{status:409})
      const { data: payment, error: paymentError } = await supabase.from('marketplace_payments').insert({
        order_id:id, provider:body.provider ? String(body.provider) : null,
        provider_reference:body.providerReference ? String(body.providerReference) : null,
        amount_cfa:Number(order.total_cfa), currency:'XOF', status:'pending',
        metadata:body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      }).select().single()
      // A11-F14 : jamais de message Postgres verbatim sur la frontière HTTP.
      if (paymentError) {
        console.error('[marketplace order PATCH] paiement — erreur insert:', paymentError)
        return NextResponse.json({ erreur: 'Erreur lors de l’enregistrement du paiement' }, { status: 409 })
      }
      const { error: updateError } = await supabase.from('marketplace_orders').update({payment_method:method,updated_at:new Date().toISOString()}).eq('id',id)
      if(updateError) return NextResponse.json({erreur:'Erreur lors de la mise à jour de la commande'},{status:500})
      await supabase.from('marketplace_order_events').insert({order_id:id,event_type:'payment_initiated',actor_type:'buyer',actor_id:order.buyer_merchant_id,metadata:{method}})
      return NextResponse.json({payment})
    }
    if (body.action === 'receipt') {
      const { data, error: rpcError } = await supabase.rpc('marketplace_confirm_receipt', {
        p_order_id: id,
        p_buyer_merchant_id: order.buyer_merchant_id,
      })
      if (rpcError) return reponseErreurMarketplace(rpcError, 'PATCH confirmation réception')
      return NextResponse.json(data)
    }
    if (body.action !== 'cancel') return NextResponse.json({ erreur: 'Action inconnue' }, { status: 400 })

    const { data, error: rpcError } = await supabase.rpc('marketplace_cancel_order', {
      p_order_id: id,
      p_actor_type: 'buyer',
      p_actor_id: order.buyer_merchant_id,
      p_reason: body.reason ? String(body.reason) : null,
    })
    if (rpcError) return reponseErreurMarketplace(rpcError, 'PATCH annulation commande')
    return NextResponse.json(data)
  } catch (error) {
    console.error('[marketplace order PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur lors de l’annulation' }, { status: 500 })
  }
}
