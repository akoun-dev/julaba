import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createSaleReversalSchema, formatZodError } from '@/lib/validation/marchand'
import { deriveOperationUuid, operationUuid } from '@/lib/stock/stock-service'

// MODE-909 (§28) — annulation/correction de vente.
//
// Une vente enregistrée ne se supprime JAMAIS : l'annulation est une
// OPÉRATION INVERSE append-only (table merchant_sale_reversals + mouvements
// CUSTOMER_RETURN pour rendre le stock). Chemin principal : RPC
// merchant_reverse_sale (verrou sur la vente FOR UPDATE, idempotence
// (merchant_id, operation_id) ET (merchant_id, sale_client_id) — une vente
// ne s'annule qu'UNE fois, rejeu offline → état courant sans refaire).
//
// Repli PGRST202 (migrations non poussées) : repli non transactionnel
// HONNÊTE — l'annulation est enregistrée (insert append-only) et le stock
// est rendu via la RPC de mouvement existante merchant_record_movement si
// elle est disponible ; sinon le stock est SKIPPÉ avec une note explicite
// (l'opération reste rejouable, la vérité serveur reprendra à la sync).
// 42P01 (table absente) → 503 transitoire : l'entrée reste en file offline.
// « Vente introuvable » → 422 définitif (conflit rapporté, jamais de boucle).

function isTransientDbError(error: { code?: string } | null | undefined): boolean {
  // 42P01 = relation inexistante (migrations non appliquées) → transitoire :
  // l'entrée en file offline n'est PAS rejetée, elle sera rejouée.
  return error?.code === '42P01'
}

/** Quantité rendue d'un item (entier legacy_sale_items) — jamais négative. */
function returnedQuantity(quantity: unknown): number {
  return Math.max(0, Math.floor(Number(quantity) || 0))
}

/**
 * POST /api/marchand/sale-reversals
 * Annule une vente (opération inverse). 201 créé, 200 déjà connu
 * (idempotent), 422 vente introuvable, 503 transitoire (migrations absentes).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ erreur: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createSaleReversalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
  }
  const { merchantId, clientId, saleClientId, reason } = parsed.data

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()
  const operationId = operationUuid(clientId)

  // ── Chemin principal : RPC transactionnelle (verrou vente FOR UPDATE,
  // idempotence double, retours de stock tout-ou-rien).
  const { data: rpcData, error: rpcError } = await supabase.rpc('merchant_reverse_sale', {
    p_merchant_id: merchantId,
    p_operation_id: operationId,
    p_sale_client_id: saleClientId,
    p_reason: reason,
  })

  if (!rpcError) {
    const result = rpcData as {
      operation_id?: string
      sale_client_id?: string
      items_returned?: number
      created?: boolean
    }
    return NextResponse.json(
      {
        operationId: result.operation_id ?? operationId,
        saleClientId: result.sale_client_id ?? saleClientId,
        itemsReturned: (result.items_returned ?? 0) as number,
        created: result.created ?? true,
      },
      { status: result.created ? 201 : 200 },
    )
  }

  // Refus définitif : la vente ciblée n'existe pas (jamais syncronisée ou
  // identifiant erroné) — rejouer ne réussira jamais.
  if (rpcError.message === 'Vente introuvable') {
    return NextResponse.json(
      { erreur: 'Vente introuvable', code: 'SALE_NOT_FOUND' },
      { status: 422 },
    )
  }

  if (isTransientDbError(rpcError as { code?: string })) {
    return NextResponse.json({ erreur: 'Annulations de vente non encore migrées' }, { status: 503 })
  }

  // ── Repli PGRST202 : la RPC merchant_reverse_sale n'existe pas encore en
  // base. Même sémantique métier, SANS transaction globale : l'annulation
  // (le fait métier) est enregistrée append-only ; le retour de stock est
  // best-effort via la RPC de mouvement existante, avec note honnête si
  // indisponible.
  if (rpcError.code === 'PGRST202') {
    console.warn('[sale-reversals] RPC merchant_reverse_sale indisponible, repli non transactionnel')

    // 1. La vente cible existe ?
    const { data: sale } = await supabase
      .from('legacy_sales')
      .select('id')
      .eq('merchant_id', merchantId)
      .eq('client_id', saleClientId)
      .maybeSingle()
    if (!sale?.id) {
      return NextResponse.json(
        { erreur: 'Vente introuvable', code: 'SALE_NOT_FOUND' },
        { status: 422 },
      )
    }

    // 2. Déjà annulée (idempotence par vente) → état courant sans refaire.
    const { data: existingBySale } = await supabase
      .from('merchant_sale_reversals')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('sale_client_id', saleClientId)
      .maybeSingle()
    if (existingBySale) {
      return NextResponse.json(
        {
          operationId: (existingBySale as Record<string, unknown>).operation_id as string,
          saleClientId,
          itemsReturned: 0,
          created: false,
        },
        { status: 200 },
      )
    }

    // 3. Déjà connu par operation_id (rejeu) → état courant sans refaire.
    const { data: existingByOp } = await supabase
      .from('merchant_sale_reversals')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('operation_id', operationId)
      .maybeSingle()
    if (existingByOp) {
      return NextResponse.json(
        { operationId, saleClientId, itemsReturned: 0, created: false },
        { status: 200 },
      )
    }

    // 4. Les articles de la vente (pour rendre le stock).
    const { data: items } = await supabase
      .from('legacy_sale_items')
      .select('*')
      .eq('sale_id', sale.id as string)
    const saleItems = (items ?? []) as Array<Record<string, unknown>>

    let itemsReturned = 0
    let stockSkipped = false
    for (const item of saleItems) {
      const productId = item.product_id as string | null
      const quantity = returnedQuantity(item.quantity)
      // Ligne libre sans produit : aucun suivi, ignorée sans erreur (§28).
      if (!productId || quantity <= 0) continue

      // Produit NON suivi (balance absente ou UNKNOWN) : la vente n'avait
      // rien décrémenté de compté → rien à rendre, ignoré sans erreur.
      const { data: balance } = await supabase
        .from('merchant_stock_balances')
        .select('stock_precision')
        .eq('merchant_id', merchantId)
        .eq('product_id', productId)
        .maybeSingle()
      const precision = (balance as Record<string, unknown> | null)?.stock_precision
      if (!balance || precision === 'UNKNOWN') continue

      // Mouvement CUSTOMER_RETURN via la RPC existante — operation_id dérivé
      // déterministe (même formule que la RPC merchant_reverse_sale côté SQL :
      // md5(op || ':reversal:' || product_id)) → rejeu = même uuid = jamais de
      // doublon dans le journal append-only des mouvements.
      const { error: movementError } = await supabase.rpc('merchant_record_movement', {
        p_merchant_id: merchantId,
        p_operation_id: deriveOperationUuid(operationId, 'reversal', productId),
        p_device_id: null,
        p_product_id: productId,
        p_movement_type: 'CUSTOMER_RETURN',
        p_quantity_base: quantity,
        p_quantity_commercial: quantity,
        p_unit_code: null,
        p_reason: 'Annulation de vente',
        p_reason_note: reason,
        p_reference_type: 'sale_reversal',
        p_reference_id: saleClientId,
      })
      if (movementError) {
        const err = movementError as { code?: string; message?: string }
        if (err.code === 'PGRST202' || /could not find the function/i.test(err.message ?? '')) {
          // RPC de mouvement indisponible : skip stock, note honnête —
          // l'annulation reste enregistrée (le fait métier prime).
          stockSkipped = true
          break
        }
        // Produit introuvable / refus de mouvement : item ignoré (best-effort),
        // les autres articles continuent.
        continue
      }
      itemsReturned += 1
    }

    // 5. L'annulation elle-même : insert append-only. Une course concurrente
    // sur sale_client_id (23505) → relecture → 200 idempotent.
    const { error: insertError } = await supabase
      .from('merchant_sale_reversals')
      .insert({
        merchant_id: merchantId,
        operation_id: operationId,
        sale_client_id: saleClientId,
        reason,
      })
    if (insertError) {
      if (insertError.code === '23505') {
        const { data: reread } = await supabase
          .from('merchant_sale_reversals')
          .select('*')
          .eq('merchant_id', merchantId)
          .eq('sale_client_id', saleClientId)
          .maybeSingle()
        return NextResponse.json(
          {
            operationId: ((reread as Record<string, unknown> | null)?.operation_id as string) ?? operationId,
            saleClientId,
            itemsReturned: 0,
            created: false,
          },
          { status: 200 },
        )
      }
      if (isTransientDbError(insertError)) {
        return NextResponse.json({ erreur: 'Annulations de vente non encore migrées' }, { status: 503 })
      }
      console.error('[sale-reversals] repli insert failed:', insertError.message)
      return NextResponse.json({ erreur: 'Enregistrement de l\u2019annulation impossible' }, { status: 500 })
    }

    return NextResponse.json(
      {
        operationId,
        saleClientId,
        itemsReturned,
        created: true,
        ...(stockSkipped
          ? { note: 'Stock non restitué (mouvements indisponibles) — sera régularisé à la synchronisation' }
          : {}),
      },
      { status: 201 },
    )
  }

  console.error('[sale-reversals] RPC failed:', rpcError.code, rpcError.message)
  return NextResponse.json({ erreur: 'Enregistrement de l\u2019annulation impossible' }, { status: 500 })
}
