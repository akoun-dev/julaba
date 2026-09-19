import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import {
  createStockMovementSchema,
  formatZodError,
} from '@/lib/validation/marchand'
import {
  operationUuid,
  recordMovementViaRpc,
  type StockBusinessError,
} from '@/lib/stock/stock-service'

function mapMovement(row: Record<string, unknown>, productName?: string) {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    product: productName ?? null,
    movementType: row.movement_type as string,
    quantityBase: row.quantity_base as number,
    quantityCommercial: row.quantity_commercial as number | null,
    unitCode: row.unit_code as string | null,
    reason: row.reason as string | null,
    reasonNote: row.reason_note as string | null,
    referenceType: row.reference_type as string | null,
    referenceId: row.reference_id as string | null,
    operationId: row.operation_id as string,
    deviceId: row.device_id as string | null,
    createdAt: row.created_at as string,
  }
}

function businessError(b: StockBusinessError) {
  const labels: Record<string, string> = {
    INSUFFICIENT_STOCK: 'Stock insuffisant',
    PRODUCT_NOT_FOUND: 'Produit introuvable',
    PRODUCT_INACTIVE: 'Produit inactif',
    INVALID_QUANTITY: 'Quantité invalide',
    UNKNOWN_STOCK: "Stock inconnu — compte le stock d'abord",
  }
  return NextResponse.json(
    { erreur: labels[b.code] ?? b.code, ...b },
    { status: b.code === 'INSUFFICIENT_STOCK' || b.code === 'UNKNOWN_STOCK' ? 422 : 400 },
  )
}

/**
 * GET /api/marchand/stock/movements?merchantId=…[&productId=…][&limit=…]
 * Journal des mouvements — LA source de vérité (§5) : ACHAT +100,
 * VENTE −20, PERTE −5… append-only, jamais de DELETE (§44).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const productId = searchParams.get('productId')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('merchant_stock_movements')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (productId) query = query.eq('product_id', productId)
    if (startDate) query = query.gte('created_at', new Date(startDate).toISOString())
    if (endDate) query = query.lte('created_at', new Date(endDate).toISOString())

    const { data: rows, error } = await query
    if (error) throw error

    const productIds = [...new Set((rows ?? []).map((r: Record<string, unknown>) => r.product_id as string))]
    const namesById = new Map<string, string>()
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('legacy_products')
        .select('id, name')
        .in('id', productIds)
      for (const p of products ?? []) namesById.set(p.id as string, p.name as string)
    }

    const movements = (rows ?? []).map((r: Record<string, unknown>) =>
      mapMovement(r, namesById.get(r.product_id as string)),
    )
    return NextResponse.json({ movements, count: movements.length })
  } catch (error) {
    console.error('Erreur mouvements stock marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des mouvements' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/stock/movements
 * Mouvement simple via la RPC transactionnelle merchant_record_movement :
 * perte (« j'ai perdu 5 kilos » → LOSS −5, PAS une vente), dégât, don,
 * retour client, réception libre, production, ajustement manuel.
 * La garantie serveur (refus stock insuffisant, stock jamais négatif,
 * raison obligatoire sur sortie anormale) vit dans PostgreSQL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createStockMovementSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    // STK-808 — clientId lisible → UUID DÉTERMINISTE (operationUuid) : le
    // rejeu offline reproduit la même opération, jamais un doublon.
    const operationId = operationUuid(data.clientId ?? data.operationId)

    const outcome = await recordMovementViaRpc(supabase, {
      merchantId: data.merchantId,
      operationId,
      productId: data.productId,
      movementType: data.movementType,
      quantityBase: data.quantityBase,
      quantityCommercial: data.quantityCommercial,
      unitCode: data.unitCode,
      reason: data.reason,
      reasonNote: data.reasonNote,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
    })

    if (!outcome.ok) {
      if ('business' in outcome) return businessError(outcome.business)
      if ('rpcMissing' in outcome) {
        return NextResponse.json(
          {
            erreur: 'Le module de stock n\'est pas encore actif sur le serveur (db push requis).',
            code: 'STOCK_RPC_MISSING',
          },
          { status: 503 },
        )
      }
      console.error('Erreur RPC mouvement stock:', outcome.raw)
      return NextResponse.json(
        { erreur: 'Erreur lors de l\'enregistrement du mouvement' },
        { status: 500 },
      )
    }

    const result = outcome.data as Record<string, unknown>
    const movement = result.movement as Record<string, unknown> | null
    return NextResponse.json(
      {
        created: result.created as boolean,
        movement: movement ? mapMovement(movement) : null,
        balance: result.balance ?? null,
      },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    console.error('Erreur creation mouvement stock:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation du mouvement' }, { status: 500 })
  }
}
