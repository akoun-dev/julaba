import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { recordPurchaseViaRpc, operationUuid } from '@/lib/stock/stock-service'

const ORDER_STATUSES = ['en_attente', 'confirmee', 'livree', 'annulee'] as const
type OrderStatus = typeof ORDER_STATUSES[number]

type ProductRow = {
  id: string
  merchant_id: string
  name: string | null
  category: string | null
  price_unit: number | null
  stock_qty: number | null
  image_url: string | null
  is_active: boolean | null
  created_at: string | null
  updated_at: string | null
}

type SupplierOrderRow = {
  id: string
  merchant_id: string
  supplier: string | null
  product_name: string | null
  quantity: number | null
  unit_price: number | null
  total_amount: number | null
  status: string | null
  note: string | null
  created_at: string | null
  updated_at: string | null
}

type MerchantOptionRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  categorie_marchand: string | null
}

function productStatus(stock: number, active: boolean) {
  if (!active) return 'inactif'
  return stock > 0 ? 'en_stock' : 'rupture'
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Vendeur inconnu'
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 500))

    const [productsResult, ordersResult] = await Promise.all([
      supabase
        .from('legacy_products')
        .select('id, merchant_id, name, category, price_unit, stock_qty, image_url, is_active, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('legacy_supplier_orders')
        .select('id, merchant_id, supplier, product_name, quantity, unit_price, total_amount, status, note, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

    if (productsResult.error) throw productsResult.error
    if (ordersResult.error) throw ordersResult.error

    const products = (productsResult.data ?? []) as ProductRow[]
    const orders = (ordersResult.data ?? []) as SupplierOrderRow[]
    const merchantIds = [...new Set([
      ...products.map((p) => p.merchant_id),
      ...orders.map((o) => o.merchant_id),
    ].filter(Boolean))]

    const [merchantsResult, actorsResult, salesResult] = await Promise.all([
      supabase.from('merchants').select('id, first_name, last_name, phone, categorie_marchand').limit(500),
      merchantIds.length
        ? supabase.from('legacy_bo_actors').select('id, merchant_id, actor_id, status, zone, type').in('merchant_id', merchantIds)
        : Promise.resolve({ data: [], error: null }),
      merchantIds.length
        ? supabase.from('legacy_sales').select('merchant_id, total_amount').in('merchant_id', merchantIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (merchantsResult.error) throw merchantsResult.error
    if (actorsResult.error) throw actorsResult.error
    if (salesResult.error) throw salesResult.error

    const merchantMap = new Map<string, any>((merchantsResult.data ?? []).map((m: any): [string, any] => [m.id, m]))
    const actorMap = new Map<string, any>((actorsResult.data ?? []).map((a: any): [string, any] => [a.merchant_id, a]))
    const salesMap = new Map<string, number>()
    for (const sale of salesResult.data ?? []) {
      salesMap.set(sale.merchant_id, (salesMap.get(sale.merchant_id) ?? 0) + Number(sale.total_amount ?? 0))
    }

    const productsMapped = products.map((p) => {
      const merchant = merchantMap.get(p.merchant_id)
      const seller = fullName(merchant?.first_name, merchant?.last_name)
      return {
        id: p.id,
        merchantId: p.merchant_id,
        name: p.name,
        price: Number(p.price_unit ?? 0),
        stock: Number(p.stock_qty ?? 0),
        status: productStatus(Number(p.stock_qty ?? 0), Boolean(p.is_active)),
        seller,
        sellerPhone: merchant?.phone ?? null,
        sellerCategory: merchant?.categorie_marchand ?? null,
        category: p.category ?? 'autre',
        imageUrl: p.image_url ?? null,
        isActive: Boolean(p.is_active),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }
    })

    const ordersMapped = orders.map((o) => {
      const merchant = merchantMap.get(o.merchant_id)
      return {
        id: o.id,
        merchantId: o.merchant_id,
        buyer: fullName(merchant?.first_name, merchant?.last_name),
        buyerPhone: merchant?.phone ?? null,
        supplier: o.supplier,
        productName: o.product_name,
        quantity: Number(o.quantity ?? 0),
        unitPrice: Number(o.unit_price ?? 0),
        amount: Number(o.total_amount ?? 0),
        status: o.status,
        note: o.note ?? null,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      }
    })

    const sellerMap = new Map<string, {
      id: string
      name: string
      phone: string | null
      zone: string
      category: string | null
      productsCount: number
      totalSales: number
      ordersCount: number
      status: 'actif' | 'inactif'
    }>()

    for (const p of productsMapped) {
      const current = sellerMap.get(p.merchantId) ?? {
        id: p.merchantId,
        name: p.seller,
        phone: p.sellerPhone,
        zone: actorMap.get(p.merchantId)?.zone ?? '',
        category: p.sellerCategory,
        productsCount: 0,
        totalSales: salesMap.get(p.merchantId) ?? 0,
        ordersCount: 0,
        status: actorMap.get(p.merchantId)?.status === 'actif' ? 'actif' : 'inactif',
      }
      current.productsCount += 1
      sellerMap.set(p.merchantId, current)
    }

    for (const order of ordersMapped) {
      const current = sellerMap.get(order.merchantId)
      if (current) current.ordersCount += 1
    }

    const merchantOptions = ((merchantsResult.data ?? []) as MerchantOptionRow[]).map((m) => ({
      id: m.id,
      name: fullName(m.first_name, m.last_name),
      phone: m.phone,
      category: m.categorie_marchand,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return NextResponse.json({
      products: productsMapped,
      orders: ordersMapped,
      sellers: Array.from(sellerMap.values()).sort((a, b) => b.productsCount - a.productsCount),
      merchantOptions,
      categories: Array.from(new Set(productsMapped.map((p) => p.category))).sort(),
      stats: {
        totalProducts: productsMapped.length,
        activeProducts: productsMapped.filter((p) => p.isActive).length,
        outOfStock: productsMapped.filter((p) => p.isActive && p.stock <= 0).length,
        sellers: sellerMap.size,
        orders: ordersMapped.length,
        pendingOrders: ordersMapped.filter((o) => o.status === 'en_attente').length,
        totalVolume: ordersMapped.reduce((sum, o) => sum + o.amount, 0),
      },
    })
  } catch (error) {
    console.error('[API backoffice/marketplace GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du marketplace' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const merchantId = String(body.merchantId ?? '').trim()
    const name = String(body.name ?? '').trim()
    const category = String(body.category ?? 'autre').trim() || 'autre'
    const priceUnit = Number(body.priceUnit)
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null

    if (!merchantId || !name || !Number.isFinite(priceUnit) || priceUnit < 0) {
      return NextResponse.json({ erreur: 'Vendeur, nom du produit et prix valide sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: merchant } = await supabase.from('merchants').select('id').eq('id', merchantId).single()
    if (!merchant) return NextResponse.json({ erreur: 'Vendeur introuvable' }, { status: 404 })

    const { data: product, error } = await supabase
      .from('legacy_products')
      .insert({
        merchant_id: merchantId,
        name,
        category,
        price_unit: Math.round(priceUnit),
        stock_qty: 0,
        image_url: imageUrl,
        is_active: true,
      })
      .select('id, merchant_id, name, category, price_unit, stock_qty, image_url, is_active, created_at, updated_at')
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id,
      userName: auth.user.name,
      userEmail: auth.user.email,
      action: 'marketplace_product_create',
      module: 'marketplace',
      details: `Produit créé : ${product.name} (${product.id})`,
      request,
    })

    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    console.error('[API backoffice/marketplace POST]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la création du produit' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const action = String(body.action ?? '')
    const id = String(body.id ?? '').trim()
    if (!id) return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })

    const supabase = createSupabaseAdminClient()

    if (action === 'product') {
      const { data: existing, error: readError } = await supabase.from('legacy_products').select('*').eq('id', id).single()
      if (readError || !existing) return NextResponse.json({ erreur: 'Produit introuvable' }, { status: 404 })

      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) {
        const name = String(body.name).trim()
        if (!name) return NextResponse.json({ erreur: 'Le nom du produit est obligatoire' }, { status: 400 })
        updates.name = name
      }
      if (body.category !== undefined) updates.category = String(body.category).trim() || 'autre'
      if (body.priceUnit !== undefined) {
        const price = Number(body.priceUnit)
        if (!Number.isFinite(price) || price < 0) return NextResponse.json({ erreur: 'Prix invalide' }, { status: 400 })
        updates.price_unit = Math.round(price)
      }
      if (body.imageUrl !== undefined) updates.image_url = body.imageUrl ? String(body.imageUrl).trim() : null
      if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive)

      if (!Object.keys(updates).length) return NextResponse.json({ erreur: 'Aucune modification' }, { status: 400 })

      const { data: product, error } = await supabase.from('legacy_products').update(updates).eq('id', id).select().single()
      if (error) throw error

      await logAudit({
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        action: 'marketplace_product_update',
        module: 'marketplace',
        details: `Produit ${id} mis à jour`,
        request,
      })
      return NextResponse.json({ product })
    }

    if (action === 'order') {
      const nextStatus = String(body.status ?? '') as OrderStatus
      if (!ORDER_STATUSES.includes(nextStatus)) {
        return NextResponse.json({ erreur: 'Statut de commande invalide' }, { status: 400 })
      }

      const { data: existing, error: readError } = await supabase
        .from('legacy_supplier_orders')
        .select('*')
        .eq('id', id)
        .single()
      if (readError || !existing) return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })

      const allowed: Record<string, OrderStatus[]> = {
        en_attente: ['confirmee', 'annulee'],
        confirmee: ['livree', 'annulee'],
        livree: [],
        annulee: [],
      }
      if (!allowed[existing.status]?.includes(nextStatus)) {
        return NextResponse.json({ erreur: `Transition ${existing.status} → ${nextStatus} non autorisée` }, { status: 409 })
      }

      if (nextStatus === 'livree') {
        const outcome = await recordPurchaseViaRpc(supabase, {
          merchantId: existing.merchant_id,
          operationId: operationUuid(`bo-reception-${id}`),
          items: [{
            productName: existing.product_name,
            quantity: existing.quantity,
            unitCostCfa: existing.unit_price,
          }],
          amountPaid: existing.total_amount,
          note: `Réception BO commande fournisseur ${existing.supplier} (${id})`,
        })
        if (!outcome.ok) {
          if ('business' in outcome) {
            return NextResponse.json({ erreur: outcome.business.code }, { status: 400 })
          }
          if ('rpcMissing' in outcome) {
            return NextResponse.json({ erreur: 'Le module de stock/achats n’est pas actif sur le serveur' }, { status: 503 })
          }
          throw outcome.raw
        }
      }

      const { data: order, error } = await supabase
        .from('legacy_supplier_orders')
        .update({ status: nextStatus })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      await logAudit({
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        action: 'marketplace_order_status_update',
        module: 'marketplace',
        details: `Commande ${id} : ${existing.status} → ${nextStatus}`,
        request,
      })

      return NextResponse.json({ order })
    }

    if (action === 'seller') {
      const nextStatus = body.status === 'actif' ? 'actif' : body.status === 'inactif' ? 'inactif' : null
      if (!nextStatus) return NextResponse.json({ erreur: 'Statut vendeur invalide' }, { status: 400 })

      const { data: actor, error: actorError } = await supabase
        .from('legacy_bo_actors')
        .select('id, merchant_id, zone, status')
        .eq('merchant_id', id)
        .eq('type', 'marchand')
        .limit(1)
        .maybeSingle()

      if (actorError) throw actorError
      if (!actor) return NextResponse.json({ erreur: 'Aucun acteur BO lié à ce vendeur' }, { status: 404 })
      if (!canAccessZone(auth.user, actor.zone)) return NextResponse.json({ erreur: 'Ce vendeur ne relève pas de votre périmètre' }, { status: 403 })

      const { data: updated, error } = await supabase
        .from('legacy_bo_actors')
        .update({ status: nextStatus, validated_at: nextStatus === 'actif' ? new Date().toISOString() : undefined })
        .eq('id', actor.id)
        .select()
        .single()
      if (error) throw error

      await logAudit({
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        action: 'marketplace_seller_status_update',
        module: 'marketplace',
        details: `Vendeur ${id} : ${actor.status} → ${nextStatus}`,
        request,
      })

      return NextResponse.json({ seller: updated })
    }

    return NextResponse.json({ erreur: 'Action inconnue' }, { status: 400 })
  } catch (error) {
    console.error('[API backoffice/marketplace PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise à jour du marketplace' }, { status: 500 })
  }
}
