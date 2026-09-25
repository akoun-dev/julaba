import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — schémas d'entrée Zod (porte JSON), typés d'après l'USAGE RÉEL :
// champs dont l'absence/invalidité a déjà un 400 à message spécifique →
// nullish/unknown (la validation manuelle garde SON message) ; priceUnit et
// amountCfa traversent Number() (coercion historique) → z.unknown() ; `action`
// est le sélecteur de dispatch du PATCH — une valeur inconnue doit continuer
// à sortir « Action inconnue » du dispatch. `status` change de sens selon la
// branche (order / listing_moderation / payment / delivery / seller) — chacune
// a son propre refus testé → z.unknown().
const engineListingCreateSchema = z.object({
  merchantId: z.string().nullish(),
  name: z.string().nullish(),
  priceUnit: z.unknown().optional(),
  category: z.string().nullish(),
  imageUrl: z.string().nullish(),
})

const enginePatchSchema = z.object({
  action: z.string(),
  id: z.string().nullish(),
  name: z.string().nullish(),
  category: z.string().nullish(),
  priceUnit: z.unknown().optional(),
  isActive: z.boolean().nullish(),
  imageUrl: z.string().nullish(),
  status: z.unknown().optional(),
  reason: z.string().nullish(),
  amountCfa: z.unknown().optional(),
  provider: z.string().nullish(),
  providerReference: z.string().nullish(),
  metadata: z.unknown().optional(),
  zone: z.string().nullish(),
  address: z.string().nullish(),
  recipientName: z.string().nullish(),
  recipientPhone: z.string().nullish(),
  trackingReference: z.string().nullish(),
  courierName: z.string().nullish(),
})

const STATUS_MAP: Record<string, 'en_attente'|'confirmee'|'livree'|'annulee'> = {
  pending: 'en_attente',
  confirmed: 'confirmee',
  preparing: 'confirmee',
  ready: 'confirmee',
  shipped: 'confirmee',
  delivered: 'livree',
  cancelled: 'annulee',
  rejected: 'annulee',
}

function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Marchand'
}

function productStatus(stock: number, active: boolean) {
  if (!active) return 'inactif'
  return stock > 0 ? 'en_stock' : 'rupture'
}

type EngineListingRow = {
  id: string
  seller_id: string
  product_id: string
  title: string | null
  category: string | null
  price_unit: number | null
  status: string
  created_at: string | null
  updated_at: string | null
  marketplace_seller_profiles: {
    merchant_id: string
    display_name: string | null
    phone: string | null
    zone: string | null
    status: string
  }
  legacy_products: {
    name: string | null
    stock_qty: number | null
    image_url: string | null
    is_active: boolean | null
  }
}

type EngineOrderRow = {
  id: string
  order_number: string | null
  buyer_merchant_id: string
  total_cfa: number | null
  status: string
  payment_status: string | null
  delivery_status: string | null
  created_at: string | null
  updated_at: string | null
}

type EngineSellerRow = {
  id: string
  merchant_id: string
  display_name: string | null
  phone: string | null
  zone: string | null
  status: string
}

type EngineMerchantRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  categorie_marchand: string | null
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 500))

    const [listingRes, sellerRes, orderRes, merchantRes] = await Promise.all([
      supabase.from('marketplace_listings')
        .select('id,seller_id,product_id,title,category,price_unit,status,created_at,updated_at,marketplace_seller_profiles!inner(merchant_id,display_name,phone,zone,status),legacy_products!inner(name,stock_qty,image_url,is_active)')
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('marketplace_seller_profiles').select('id,merchant_id,display_name,phone,zone,status').limit(500),
      supabase.from('marketplace_orders').select('id,order_number,buyer_merchant_id,total_cfa,status,payment_status,delivery_status,created_at,updated_at').order('created_at', { ascending: false }).limit(limit),
      supabase.from('merchants').select('id,first_name,last_name,phone,categorie_marchand').limit(500),
    ])
    if (listingRes.error) throw listingRes.error
    if (sellerRes.error) throw sellerRes.error
    if (orderRes.error) throw orderRes.error
    if (merchantRes.error) throw merchantRes.error

    const listings = (listingRes.data ?? []) as EngineListingRow[]
    const orders = (orderRes.data ?? []) as EngineOrderRow[]
    const sellers = (sellerRes.data ?? []) as EngineSellerRow[]
    const merchants = (merchantRes.data ?? []) as EngineMerchantRow[]

    const orderIds = orders.map((o: any) => o.id)
    const sellerIds = listings.map((l: any) => l.seller_id)
    const [itemRes, eventRes] = await Promise.all([
      orderIds.length
        ? supabase.from('marketplace_order_items').select('order_id,seller_id,product_id,product_name,quantity,unit_price_cfa,subtotal_cfa').in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null } as any),
      orderIds.length
        ? supabase.from('marketplace_order_events').select('order_id,event_type,from_status,to_status,actor_type,actor_id,note,created_at').in('order_id', orderIds).order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
    ])
    if (itemRes.error) throw itemRes.error
    if (eventRes.error) throw eventRes.error

    const merchantMap = new Map<string, any>(merchants.map((m: any): [string, any] => [m.id, m]))
    const sellerMap = new Map<string, any>(sellers.map((s: any): [string, any] => [s.id, s]))
    const itemRows = itemRes.data ?? []

    const products = listings.map((l: any) => {
      const seller = l.marketplace_seller_profiles
      const product = l.legacy_products
      const merchant = merchantMap.get(seller.merchant_id)
      return {
        id: l.id,
        listingId: l.id,
        productId: l.product_id,
        merchantId: seller.merchant_id,
        name: l.title,
        price: Number(l.price_unit),
        stock: Number(product.stock_qty ?? 0),
        status: productStatus(Number(product.stock_qty ?? 0), l.status === 'published' && Boolean(product.is_active)),
        seller: seller.display_name || fullName(merchant?.first_name, merchant?.last_name),
        sellerPhone: seller.phone || merchant?.phone || null,
        sellerCategory: merchant?.categorie_marchand || null,
        category: l.category,
        imageUrl: product.image_url ?? null,
        isActive: l.status === 'published' && Boolean(product.is_active),
        listingStatus: l.status,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      }
    })

    const ordersMapped = orders.map((o: any) => {
      const items = itemRows.filter((i: any) => i.order_id === o.id)
      const sellerNames = [...new Set(items.map((i: any) => sellerMap.get(i.seller_id)?.display_name).filter(Boolean))]
      const buyer = merchantMap.get(o.buyer_merchant_id)
      return {
        id: o.id,
        orderNumber: o.order_number,
        merchantId: o.buyer_merchant_id,
        buyer: fullName(buyer?.first_name, buyer?.last_name),
        buyerPhone: buyer?.phone ?? null,
        supplier: sellerNames.join(', ') || 'Marchand vendeur',
        productName: items.map((i: any) => `${i.quantity} × ${i.product_name}`).join(', ') || '—',
        quantity: items.reduce((n: number, i: any) => n + Number(i.quantity), 0),
        unitPrice: items.length === 1 ? Number(items[0].unit_price_cfa) : 0,
        amount: Number(o.total_cfa),
        status: STATUS_MAP[o.status] ?? 'en_attente',
        marketplaceStatus: o.status,
        paymentStatus: o.payment_status,
        deliveryStatus: o.delivery_status,
        items,
        events: (eventRes.data ?? []).filter((e: any) => e.order_id === o.id),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      }
    })

    const sellerStats = new Map<string, { productsCount:number; totalSales:number; orders:Set<string> }>()
    for (const l of listings) {
      const s = sellerStats.get(l.seller_id) ?? { productsCount:0,totalSales:0,orders:new Set<string>() }
      s.productsCount++
      sellerStats.set(l.seller_id,s)
    }
    for (const i of itemRows) {
      const order = orders.find((o:any) => o.id === i.order_id)
      if (!order || ['cancelled','rejected'].includes(order.status)) continue
      const s = sellerStats.get(i.seller_id) ?? { productsCount:0,totalSales:0,orders:new Set<string>() }
      s.totalSales += Number(i.subtotal_cfa)
      s.orders.add(i.order_id)
      sellerStats.set(i.seller_id,s)
    }

    const sellerRows = sellers.map((s:any) => {
      const m = merchantMap.get(s.merchant_id)
      const stats = sellerStats.get(s.id) ?? { productsCount:0,totalSales:0,orders:new Set<string>() }
      return {
        id: s.merchant_id,
        sellerProfileId: s.id,
        name: s.display_name || fullName(m?.first_name,m?.last_name),
        phone: s.phone || m?.phone || null,
        zone: s.zone || '',
        category: m?.categorie_marchand || null,
        productsCount: stats.productsCount,
        totalSales: stats.totalSales,
        ordersCount: stats.orders.size,
        status: s.status === 'active' ? 'actif' : 'inactif',
      }
    })

    return NextResponse.json({
      products,
      orders: ordersMapped,
      sellers: sellerRows.sort((a,b) => b.productsCount-a.productsCount),
      merchantOptions: merchants.map((m:any) => ({
        id:m.id,name:fullName(m.first_name,m.last_name),phone:m.phone,category:m.categorie_marchand,
      })).sort((a,b)=>a.name.localeCompare(b.name,'fr')),
      categories: [...new Set(products.map(p=>p.category))].sort(),
      stats: {
        totalProducts: products.length,
        activeProducts: products.filter(p=>p.isActive).length,
        outOfStock: products.filter(p=>p.isActive && p.stock <= 0).length,
        sellers: sellers.length,
        orders: orders.length,
        pendingOrders: orders.filter((o:any)=>o.status==='pending').length,
        totalVolume: orders.filter((o:any)=>!['cancelled','rejected'].includes(o.status)).reduce((n:number,o:any)=>n+Number(o.total_cfa),0),
      },
    })
  } catch (error) {
    console.error('[API backoffice/marketplace-engine GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du marketplace' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'create')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const parsed = engineListingCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const merchantId = String(body.merchantId ?? '').trim()
    const name = String(body.name ?? '').trim()
    const priceUnit = Number(body.priceUnit)
    if (!merchantId || !name || !Number.isFinite(priceUnit) || priceUnit < 0) {
      return NextResponse.json({ erreur: 'Marchand, nom et prix valide sont obligatoires' }, { status:400 })
    }
    const supabase = createSupabaseAdminClient()
    const { data: merchant } = await supabase.from('merchants').select('id,first_name,last_name,phone').eq('id',merchantId).single()
    if (!merchant) return NextResponse.json({ erreur:'Marchand introuvable' }, {status:404})

    const { data: product, error: productError } = await supabase.from('legacy_products').insert({
      merchant_id:merchantId,name,category:String(body.category||'autre'),price_unit:Math.round(priceUnit),
      stock_qty:0,image_url:body.imageUrl ? String(body.imageUrl).trim() : null,is_active:true,
    }).select('id').single()
    if (productError) throw productError

    const { data: seller, error: sellerError } = await supabase.from('marketplace_seller_profiles').upsert({
      merchant_id:merchantId,display_name:fullName(merchant.first_name,merchant.last_name),phone:merchant.phone,status:'active',
    },{onConflict:'merchant_id'}).select('id').single()
    if (sellerError) throw sellerError

    const { data: listing, error: listingError } = await supabase.from('marketplace_listings').insert({
      seller_id:seller.id,product_id:product.id,title:name,category:String(body.category||'autre'),
      price_unit:Math.round(priceUnit),status:'published',
    }).select().single()
    if (listingError) throw listingError

    await logAudit({userId:auth.user.id,userName:auth.user.name,userEmail:auth.user.email,action:'marketplace_listing_create',module:'marketplace',details:`Listing créé : ${listing.id}`,request})
    return NextResponse.json({product:listing},{status:201})
  } catch (error) {
    console.error('[API backoffice/marketplace-engine POST]', error)
    return NextResponse.json({erreur:'Erreur lors de la création du listing'}, {status:500})
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'update')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const parsed = enginePatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const action = String(body.action||'')
    const id = String(body.id||'').trim()
    const supabase = createSupabaseAdminClient()

    if (action === 'product') {
      const {data: listing,error: readError}=await supabase.from('marketplace_listings').select('*,legacy_products(*)').eq('id',id).single()
      if(readError||!listing) return NextResponse.json({erreur:'Listing introuvable'},{status:404})
      const updates:Record<string,unknown>={}
      if(body.name!==undefined) updates.title=String(body.name).trim()
      if(body.category!==undefined) updates.category=String(body.category).trim()||'autre'
      if(body.priceUnit!==undefined) updates.price_unit=Math.round(Number(body.priceUnit))
      if(body.isActive!==undefined) updates.status=Boolean(body.isActive)?'published':'suspended'
      if(body.imageUrl!==undefined) {
        await supabase.from('legacy_products').update({image_url:body.imageUrl?String(body.imageUrl).trim():null}).eq('id',listing.product_id)
      }
      if(Object.keys(updates).length) {
        const {error}=await supabase.from('marketplace_listings').update(updates).eq('id',id)
        if(error) throw error
      }
      const productUpdates:Record<string,unknown>={}
      if(body.name!==undefined) productUpdates.name=String(body.name).trim()
      if(body.category!==undefined) productUpdates.category=String(body.category).trim()||'autre'
      if(body.priceUnit!==undefined) productUpdates.price_unit=Math.round(Number(body.priceUnit))
      if(body.isActive!==undefined) productUpdates.is_active=Boolean(body.isActive)
      if(Object.keys(productUpdates).length) {
        const {error}=await supabase.from('legacy_products').update(productUpdates).eq('id',listing.product_id)
        if(error) throw error
      }
      await logAudit({userId:auth.user.id,userName:auth.user.name,userEmail:auth.user.email,action:'marketplace_listing_update',module:'marketplace',details:`Listing ${id} mis à jour`,request})
      const {data:updated}=await supabase.from('marketplace_listings').select('*,legacy_products(*)').eq('id',id).single()
      return NextResponse.json({product:updated})
    }

    if (action === 'order') {
      const next = String(body.status)
      const {data:order,error}=await supabase.from('marketplace_orders').select('id,status,buyer_merchant_id').eq('id',id).single()
      if(error||!order) return NextResponse.json({erreur:'Commande introuvable'},{status:404})
      if(next==='annulee') {
        const {data,error:rpcError}=await supabase.rpc('marketplace_cancel_order',{p_order_id:id,p_actor_type:'backoffice',p_actor_id:auth.user.id,p_reason:body.reason?String(body.reason):'Annulation BO'})
        if(rpcError) return NextResponse.json({erreur:rpcError.message},{status:409})
        return NextResponse.json(data)
      }
      if(next==='livree') {
        const {data,error:rpcError}=await supabase.rpc('marketplace_fulfill_order',{p_order_id:id,p_actor_type:'backoffice',p_actor_id:auth.user.id})
        if(rpcError) return NextResponse.json({erreur:rpcError.message},{status:409})
        await logAudit({userId:auth.user.id,userName:auth.user.name,userEmail:auth.user.email,action:'marketplace_order_fulfill',module:'marketplace',details:`Commande ${id} livrée`,request})
        return NextResponse.json(data)
      }
      const transitions:Record<string,string[]>={pending:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['shipped','cancelled'],shipped:['delivered','cancelled']}
      const target = next==='confirmee'?'confirmed':next==='en_attente'?'pending':null
      if(target && transitions[order.status]?.includes(target)) {
        const {data:updated,error:updateError}=await supabase.from('marketplace_orders').update({
          status:target,confirmed_at:target==='confirmed'?new Date().toISOString():undefined,
        }).eq('id',id).select().single()
        if(updateError) throw updateError
        await supabase.from('marketplace_order_events').insert({order_id:id,event_type:'status_changed',from_status:order.status,to_status:target,actor_type:'backoffice',actor_id:auth.user.id})
        return NextResponse.json({order:updated})
      }
      return NextResponse.json({erreur:`Transition ${order.status} → ${next} non autorisée`},{status:409})
    }

    if (action === 'listing_moderation') {
      const status = ['draft','pending_review','published','suspended','archived'].includes(String(body.status)) ? String(body.status) : null
      if (!status) return NextResponse.json({ erreur: 'Statut de modération invalide' }, { status: 400 })
      const { data: listing, error: readError } = await supabase.from('marketplace_listings')
        .select('id,status,seller_id,title').eq('id', id).single()
      if (readError || !listing) return NextResponse.json({ erreur: 'Annonce introuvable' }, { status: 404 })
      const publishedAt = status === 'published' ? new Date().toISOString() : null
      const { data: updated, error } = await supabase.from('marketplace_listings')
        .update({ status, published_at: publishedAt }).eq('id', id).select().single()
      if (error) throw error
      await logAudit({
        userId:auth.user.id,userName:auth.user.name,userEmail:auth.user.email,
        action:'marketplace_listing_moderation',module:'marketplace',
        details:`Listing ${id} : ${listing.status} → ${status}`,request
      })
      return NextResponse.json({ listing: updated })
    }

    if (action === 'payment') {
      const status = ['pending','authorized','paid','failed','refunded'].includes(String(body.status)) ? String(body.status) : null
      if (!status) return NextResponse.json({ erreur: 'Statut paiement invalide' }, { status: 400 })
      const amount = Math.max(0, Math.round(Number(body.amountCfa) || 0))
      const { data: order, error: orderError } = await supabase.from('marketplace_orders').select('id,total_cfa').eq('id',id).single()
      if (orderError || !order) return NextResponse.json({ erreur:'Commande introuvable' }, {status:404})
      const { data: payment, error } = await supabase.from('marketplace_payments').upsert({
        order_id:id, provider:body.provider ? String(body.provider) : null,
        provider_reference:body.providerReference ? String(body.providerReference) : null,
        amount_cfa:amount || Number(order.total_cfa), status,
        paid_at:status === 'paid' ? new Date().toISOString() : null,
        metadata:body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      }, { onConflict:'provider,provider_reference' }).select().single()
      if (error) throw error
      await supabase.from('marketplace_orders').update({payment_status:status}).eq('id',id)
      await supabase.from('marketplace_order_events').insert({order_id:id,event_type:'payment_status_changed',actor_type:'backoffice',actor_id:auth.user.id,metadata:{status}})
      return NextResponse.json({payment})
    }

    if (action === 'delivery') {
      const status = ['pending','assigned','picked_up','in_transit','delivered','failed','cancelled'].includes(String(body.status)) ? String(body.status) : null
      if (!status) return NextResponse.json({ erreur:'Statut livraison invalide' }, {status:400})
      const { data: delivery, error } = await supabase.from('marketplace_deliveries').update({
        status,
        zone:body.zone !== undefined ? String(body.zone) : undefined,
        address:body.address !== undefined ? String(body.address) : undefined,
        recipient_name:body.recipientName !== undefined ? String(body.recipientName) : undefined,
        recipient_phone:body.recipientPhone !== undefined ? String(body.recipientPhone) : undefined,
        tracking_reference:body.trackingReference !== undefined ? String(body.trackingReference) : undefined,
        courier_name:body.courierName !== undefined ? String(body.courierName) : undefined,
        picked_up_at:status === 'picked_up' ? new Date().toISOString() : undefined,
        delivered_at:status === 'delivered' ? new Date().toISOString() : undefined,
      }).eq('order_id',id).select().single()
      if (error) throw error
      await supabase.from('marketplace_orders').update({delivery_status:status}).eq('id',id)
      await supabase.from('marketplace_order_events').insert({order_id:id,event_type:'delivery_status_changed',actor_type:'backoffice',actor_id:auth.user.id,metadata:{status}})
      return NextResponse.json({delivery})
    }

    if (action === 'seller') {
      const nextStatus=body.status==='actif'?'active':body.status==='inactif'?'suspended':null
      if(!nextStatus) return NextResponse.json({erreur:'Statut vendeur invalide'},{status:400})
      const {data:seller,error}=await supabase.from('marketplace_seller_profiles').select('*').eq('merchant_id',id).single()
      if(error||!seller) return NextResponse.json({erreur:'Profil vendeur introuvable'},{status:404})
      if(!canAccessZone(auth.user,seller.zone)) return NextResponse.json({erreur:'Ce vendeur ne relève pas de votre périmètre'},{status:403})
      const {data:updated,error:updateError}=await supabase.from('marketplace_seller_profiles').update({status:nextStatus}).eq('id',seller.id).select().single()
      if(updateError) throw updateError
      if(nextStatus!=='active') await supabase.from('marketplace_listings').update({status:'suspended'}).eq('seller_id',seller.id).eq('status','published')
      await logAudit({userId:auth.user.id,userName:auth.user.name,userEmail:auth.user.email,action:'marketplace_seller_status_update',module:'marketplace',details:`Vendeur ${id} : ${seller.status} → ${nextStatus}`,request})
      return NextResponse.json({seller:updated})
    }

    return NextResponse.json({erreur:'Action inconnue'},{status:400})
  } catch(error) {
    console.error('[API backoffice/marketplace-engine PATCH]',error)
    return NextResponse.json({erreur:'Erreur lors de la mise à jour du marketplace'},{status:500})
  }
}
