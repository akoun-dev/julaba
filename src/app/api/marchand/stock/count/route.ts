import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { stockCountSchema, formatZodError } from '@/lib/validation/marchand'
import {
  adjustToCountViaRpc,
  operationUuid,
  type StockBusinessError,
} from '@/lib/stock/stock-service'

/**
 * POST /api/marchand/stock/count
 * Comptage réel (§22) : « j'ai compté, il reste 30 kg » alors que le
 * système annonce 35 → la RPC calcule le delta et trace ADJUSTMENT_OUT
 * reason=INVENTORY_COUNT. JAMAIS d'écrasement sans trace (§44) : la
 * correction EST un mouvement, l'historique est conservé. Après comptage
 * la balance passe à EXACT ; compter un produit jamais suivi INITIALISE
 * sa balance (§23 : UNKNOWN → demander une vérification → c'est ce
 * comptage).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = stockCountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const data = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const outcome = await adjustToCountViaRpc(supabase, {
      merchantId: data.merchantId,
      operationId: operationUuid(data.operationId),
      productId: data.productId,
      countedQuantityBase: data.countedQuantityBase,
      note: data.note,
    })

    if (!outcome.ok) {
      if ('business' in outcome) {
        const b: StockBusinessError = outcome.business
        const labels: Record<string, string> = {
          PRODUCT_NOT_FOUND: 'Produit introuvable',
          INVALID_QUANTITY: 'Quantité comptée invalide',
        }
        return NextResponse.json(
          { erreur: labels[b.code] ?? b.code, ...b },
          { status: 400 },
        )
      }
      if ('rpcMissing' in outcome) {
        return NextResponse.json(
          { erreur: 'Le module de stock n\'est pas encore actif sur le serveur (db push requis).', code: 'STOCK_RPC_MISSING' },
          { status: 503 },
        )
      }
      console.error('Erreur RPC comptage stock:', outcome.raw)
      return NextResponse.json({ erreur: 'Erreur lors de l\'enregistrement du comptage' }, { status: 500 })
    }

    const result = outcome.data as Record<string, unknown>
    const movement = result.movement as Record<string, unknown> | null
    return NextResponse.json(
      {
        created: result.created as boolean,
        before: result.before as number | null,
        after: result.after as number | null,
        delta: result.delta as number | null,
        movement: movement
          ? {
              id: movement.id,
              movementType: movement.movement_type,
              quantityBase: movement.quantity_base,
              reason: movement.reason,
              createdAt: movement.created_at,
            }
          : null,
        balance: result.balance ?? null,
      },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    console.error('Erreur comptage stock:', error)
    return NextResponse.json({ erreur: 'Erreur lors du comptage du stock' }, { status: 500 })
  }
}
