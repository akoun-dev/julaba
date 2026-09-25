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
      // AUDIT-012 P1-2 : l'initiation de paiement est ATOMIQUE + IDEMPOTENTE
      // côté SQL (RPC marketplace_initiate_payment — déployée en prod par le
      // porteur 20260924130000, reconstruite dans le dépôt MODE-1004) :
      // verrou FOR UPDATE sur la commande, unicité du paiement actif sous
      // verrou, montant = total_cfa CÔTÉ SQL, clé client_id OBLIGATOIRE avec
      // empreinte de payload (retry après perte de réponse → paiement
      // existant, IDEMPOTENCY_PAYLOAD_MISMATCH si contenu différent),
      // événement écrit dans la même transaction. AVANT : insert payment →
      // update commande → événement, trois écritures séparées avec contrôle
      // `pending` lu hors verrou (course) et `pending` orphelin possible.
      if (!body.clientId) {
        return NextResponse.json({ erreur: 'clientId requis (clé d\'idempotence)' }, { status: 400 })
      }
      const method = ['cash','mobile_money','card','wallet','credit','cash_on_delivery','other'].includes(String(body.paymentMethod)) ? String(body.paymentMethod) : null
      if (!method) return NextResponse.json({ erreur:'Mode de paiement invalide' }, {status:400})
      const { data, error: rpcError } = await supabase.rpc('marketplace_initiate_payment', {
        p_order_id: id,
        p_buyer_merchant_id: order.buyer_merchant_id,
        p_client_id: String(body.clientId),
        p_method: method,
        p_provider: body.provider ? String(body.provider) : null,
        p_provider_reference: body.providerReference ? String(body.providerReference) : null,
        p_metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      })
      if (rpcError) return reponseErreurMarketplace(rpcError, 'PATCH initiation paiement')
      return NextResponse.json(data)
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
