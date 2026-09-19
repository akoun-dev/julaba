import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications/server'
import {
  createSupplierOrderSchema,
  supplierOrderActionSchema,
  supplierOrderReceiveSchema,
  formatZodError,
} from '@/lib/validation/marchand'
import { operationUuid, recordPurchaseViaRpc } from '@/lib/stock/stock-service'
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

/** PATCH /api/marchand/supplier-orders?id= — deux actions marchand :
 *  • « annuler » — seulement en_attente (une fois confirmée par le
 *    fournisseur, l'annulation passe par le backoffice) ;
 *  • « recevoir » (STK-809) — la réception GÉNÈRE un achat réel via
 *    merchant_record_purchase (mouvement PURCHASE + coût moyen pondéré +
 *    coût D3), puis seulement ensuite la commande passe à « livrée ».
 *    Le stock serveur est l'autorité : si la RPC n'existe pas encore
 *    (rpcMissing → 503), la commande reste inchangée — jamais une
 *    réception « papier » sans achat en base. Idempotent : le rejeu
 *    réutilise le même operation_id déterministe « reception-<id> ». */
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    const body = await request.json()

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

    const actionSchema = z.discriminatedUnion('action', [
      supplierOrderActionSchema,
      supplierOrderReceiveSchema,
    ])
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const action = parsed.data

    // ── Réception (STK-809) ────────────────────────────────────────────
    if (action.action === 'recevoir') {
      if (existing.status !== 'confirmee' && existing.status !== 'en_attente') {
        return NextResponse.json(
          { erreur: 'Seule une commande en attente ou confirmée peut être réceptionnée' },
          { status: 409 },
        )
      }
      // items : la commande est mono-produit — l'achat suit exactement ce
      // qui a été commandé, le coût unitaire catalogue fait foi (jamais
      // recalculé côté client).
      const outcome = await recordPurchaseViaRpc(supabase, {
        merchantId: existing.merchant_id as string,
        operationId: operationUuid(`reception-${id}`),
        items: [
          {
            productName: existing.product_name,
            quantity: existing.quantity,
            unitCostCfa: existing.unit_price,
          },
        ],
        amountPaid: action.amountPaid ?? (existing.total_amount as number),
        note: `Réception commande fournisseur ${existing.supplier} (${id})`,
        createExpense: action.createExpense ?? false,
        expenseCategory: action.expenseCategory,
      })

      if (!outcome.ok) {
        if ('business' in outcome) {
          const b = outcome.business
          const labels: Record<string, string> = {
            PRODUCT_NOT_FOUND: 'Produit introuvable — ajoutez-le d\'abord dans MES PRODUITS',
            PRODUCT_INACTIVE: 'Produit inactif — réactivez-le avant réception',
            INVALID_QUANTITY: 'Quantité commandée invalide',
          }
          return NextResponse.json({ erreur: labels[b.code] ?? b.code, ...b }, { status: 400 })
        }
        if ('rpcMissing' in outcome) {
          return NextResponse.json(
            { erreur: "Le module d'achats n'est pas encore actif sur le serveur (db push requis).", code: 'STOCK_RPC_MISSING' },
            { status: 503 },
          )
        }
        console.error('[API marchand/supplier-orders PATCH recevoir]', outcome.raw)
        return NextResponse.json({ erreur: 'Erreur lors de la réception de la commande' }, { status: 500 })
      }

      // La RPC a écrit l'achat + le mouvement PURCHASE — MAINTENANT
      // seulement la commande passe à « livrée ».
      const { data: order, error: orderError } = await supabase
        .from('legacy_supplier_orders')
        .update({ status: 'livree' })
        .eq('id', id)
        .select()
        .single()
      if (orderError) throw orderError

      const result = outcome.data as Record<string, unknown>
      await createNotification({
        subjectType: 'merchant',
        subjectId: existing.merchant_id as string,
        type: 'stock_reception',
        title: 'Réception enregistrée',
        body: `${existing.quantity} × ${existing.product_name} ajoutés à votre stock (${formatFCFA(existing.total_amount)}).`,
        data: { orderId: id },
      })

      return NextResponse.json({
        order: mapOrder(order),
        purchase: result.purchase ?? null,
      })
    }

    // ── Annulation (comportement historique) ───────────────────────────
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
