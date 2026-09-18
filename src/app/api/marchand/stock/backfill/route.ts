import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { stockBackfillSchema, formatZodError } from '@/lib/validation/marchand'
import { backfillOpeningBalancesViaRpc } from '@/lib/stock/stock-service'

/**
 * POST /api/marchand/stock/backfill
 * Migration de l'existant (§40) : chaque produit actif du marchand reçoit
 * une balance (stock legacy = point de départ) et, si son stock legacy est
 * non nul, un mouvement OPENING_BALANCE (+qty). Idempotent et rejouable —
 * réexécuter ne duplique rien (balance ON CONFLICT DO NOTHING, mouvement
 * sur operation_id déterministe).
 *
 * Route explicite pour l'ops / la bascule STK-804 ; le GET de
 * /api/marchand/stock/balance déclenche aussi le backfill au premier
 * accès d'un marchand sans balances.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = stockBackfillSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }

    const auth = await requireDeviceOwner(request, 'merchant', parsed.data.merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const outcome = await backfillOpeningBalancesViaRpc(supabase)

    if (!outcome.ok) {
      if ('rpcMissing' in outcome) {
        return NextResponse.json(
          { erreur: 'Le module de stock n\'est pas encore actif sur le serveur (db push requis).', code: 'STOCK_RPC_MISSING' },
          { status: 503 },
        )
      }
      console.error('Erreur RPC backfill stock:', 'raw' in outcome ? outcome.raw : outcome)
      return NextResponse.json({ erreur: 'Erreur lors du backfill du stock' }, { status: 500 })
    }

    const data = outcome.data as Record<string, unknown>
    return NextResponse.json({
      productsScanned: data.products_scanned as number,
      balancesCreated: data.balances_created as number,
      movementsCreated: data.movements_created as number,
    })
  } catch (error) {
    console.error('Erreur backfill stock:', error)
    return NextResponse.json({ erreur: 'Erreur lors du backfill du stock' }, { status: 500 })
  }
}
