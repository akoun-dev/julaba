import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { reponseErreurMarketplace } from '@/lib/marketplace-errors'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — PATCH : les trois champs passent par String(x).trim() et leur
// absence/vidité produit DÉJÀ le 400 testé « merchantId, orderId et status
// sont requis ». Champs .optional() ici : la validation manuelle garde SON
// message testé, Zod ne refuse que les types non-string.
const sellerOrderPatchSchema = z.object({
  merchantId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const merchantId = new URL(request.url).searchParams.get('merchantId')?.trim()
  if (!merchantId) return NextResponse.json({ erreur: 'merchantId requis' }, { status: 400 })
  // AUDIT-012 P1-1 : le vendeur marketplace est un MARCHAND —
  // marketplace_seller_profiles.merchant_id référence public.merchants et la
  // session est namespacée `merchant:<id>`. AVANT : namespace 'producteur'
  // (jamais délivré par /api/merchant/login) → parcours vendeur indisponible.
  const auth = await requireDeviceOwner(request, 'merchant', merchantId); if (auth) return auth
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
  const body = await request.json()
  const parsed = sellerOrderPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
  }
  const merchantId = String(body.merchantId ?? '').trim(); const orderId = String(body.orderId ?? '').trim(); const target = String(body.status ?? '').trim()
  if (!merchantId || !orderId || !target) return NextResponse.json({ erreur: 'merchantId, orderId et status sont requis' }, { status: 400 })
  // AUDIT-012 P1-1 : namespace 'merchant' (voir GET).
  const auth = await requireDeviceOwner(request, 'merchant', merchantId); if (auth) return auth
  // AUDIT-012 P1-2 : la transition est ATOMIQUE côté SQL (RPC
  // marketplace_seller_transition — déployée en prod par le porteur
  // 20260924130000, reconstruite dans le dépôt MODE-1004) — verrou FOR
  // UPDATE sur la commande, grille de transitions vérifiée sous verrou,
  // événement écrit dans la MÊME transaction. AVANT : lecture → vérification
  // en mémoire → update par id seul (double transition possible sous
  // concurrence) + événement inséré séparément avec erreur ignorée.
  const supabase = createSupabaseAdminClient()
  try {
    const { data, error: rpcError } = await supabase.rpc('marketplace_seller_transition', {
      p_order_id: orderId,
      p_merchant_id: merchantId,
      p_target_status: target,
    })
    if (rpcError) return reponseErreurMarketplace(rpcError, 'PATCH transition vendeur')
    return NextResponse.json(data)
  } catch (error) { console.error('[marketplace seller-orders PATCH]', error); return NextResponse.json({ erreur: 'Impossible de mettre à jour la commande' }, { status: 500 }) }
}
