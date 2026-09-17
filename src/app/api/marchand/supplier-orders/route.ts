import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications/server'
import {
  createSupplierOrderSchema,
  supplierOrderActionSchema,
  formatZodError,
} from '@/lib/validation/marchand'
import { formatFCFA } from '@/lib/voice/localIntent'

function mapOrder(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    supplier: row.supplier as string,
    productName: row.product_name as string,
    quantity: row.quantity as number,
    unitPrice: row.unit_price as number,
    totalAmount: row.total_amount as number,
    status: row.status as string,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** GET /api/marchand/supplier-orders?merchantId= — the marchand's own
 * supplier orders, newest first (drives the Commandes tracking screen). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase
      .from('legacy_supplier_orders')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ orders: (data ?? []).map(mapOrder) })
  } catch (error) {
    console.error('[API marchand/supplier-orders GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des commandes' }, { status: 500 })
  }
}

/** POST /api/marchand/supplier-orders — order a catalog entry. The total is
 * recomputed server-side (quantity × unitPrice) so a tampered client total
 * is never trusted — same rule as createSaleSchema. Idempotent on clientId
 * (offline-queued orders replay exactly once). */
export async function POST(request: NextRequest) {
  try {
    const parsed = createSupplierOrderSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, supplier, productName, quantity, unitPrice, note, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_supplier_orders')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        return NextResponse.json({ order: mapOrder(existing) }, { status: 200 })
      }
    }

    const { data: order, error: orderError } = await supabase
      .from('legacy_supplier_orders')
      .insert({
        merchant_id: merchantId,
        supplier,
        product_name: productName,
        quantity,
        unit_price: unitPrice,
        total_amount: quantity * unitPrice,
        note: note || null,
        client_id: clientId || null,
      })
      .select()
      .single()
    if (orderError) throw orderError

    await createNotification({
      subjectType: 'merchant',
      subjectId: merchantId,
      type: 'supplier_order',
      title: 'Commande envoyée',
      body: `Votre commande de ${quantity} × ${productName} auprès de ${supplier} (${formatFCFA(order.total_amount)}) a été transmise.`,
      data: { orderId: order.id },
    })

    return NextResponse.json({ order: mapOrder(order) }, { status: 201 })
  } catch (error) {
    console.error('[API marchand/supplier-orders POST]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la création de la commande' }, { status: 500 })
  }
}

/** PATCH /api/marchand/supplier-orders?id= — the marchand can only cancel,
 * and only while the order is still en_attente (once the supplier confirmed
 * it, cancellation goes through the backoffice, not the device). */
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    const parsed = supplierOrderActionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing, error: existingError } = await supabase
      .from('legacy_supplier_orders')
      .select('*')
      .eq('id', id)
      .single()
    if (existingError || !existing) {
      return NextResponse.json({ erreur: 'Commande introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'merchant', existing.merchant_id)
    if (auth) return auth

    if (existing.status !== 'en_attente') {
      return NextResponse.json(
        { erreur: 'Seule une commande en attente peut être annulée' },
        { status: 409 }
      )
    }

    const { data: order, error: orderError } = await supabase
      .from('legacy_supplier_orders')
      .update({ status: 'annulee' })
      .eq('id', id)
      .select()
      .single()
    if (orderError) throw orderError

    return NextResponse.json({ order: mapOrder(order) })
  } catch (error) {
    console.error('[API marchand/supplier-orders PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise à jour de la commande' }, { status: 500 })
  }
}
