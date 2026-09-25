import { NextResponse } from 'next/server'

/**
 * A11-F14 (AUDIT-011) — traduction uniforme des erreurs des RPC
 * marketplace en réponses HTTP, SANS fuite de Postgres verbatim.
 *
 * Les RPC métier lèvent des codes AMÉNAGÉS (raise exception …
 * message='INSUFFICIENT_MARKETPLACE_STOCK' etc.) : seul ce registre fermé
 * traverse la frontière HTTP, avec son statut. Toute autre erreur (rejet
 * Postgres inattendu, contrainte non prévue, base pas encore migrée) est
 * renvoyée en message générique — le détail reste en log serveur. AVANT :
 * error.message était renvoyé tel quel, incluant les erreurs NON métier.
 */
export const CODES_METIER_MARKETPLACE = new Set([
  'BUYER_NOT_FOUND',
  'CLIENT_ID_REQUIRED',
  'INSUFFICIENT_MARKETPLACE_STOCK',
  'INVALID_PAYMENT_METHOD',
  'INVALID_QUANTITY',
  'INVALID_TOTAL',
  'INVALID_TRANSITION',
  'LISTING_UNAVAILABLE',
  'MULTI_SELLER_ORDER',
  'NOT_YOUR_ORDER',
  'ORDER_EMPTY',
  'ORDER_NOT_CANCELLABLE',
  'ORDER_NOT_DELIVERED',
  'ORDER_NOT_FOUND',
  'ORDER_NOT_FULFILLABLE',
  'ORDER_NOT_PAYABLE',
  'PAYMENT_ALREADY_PENDING',
  'PRODUCT_UNAVAILABLE',
  'SELLER_UNAVAILABLE',
  'STOCK_UNKNOWN',
])

const STATUT_PAR_CODE: Record<string, number> = {
  BUYER_NOT_FOUND: 404,
  CLIENT_ID_REQUIRED: 400,
  INSUFFICIENT_MARKETPLACE_STOCK: 422,
  INVALID_PAYMENT_METHOD: 400,
  INVALID_QUANTITY: 400,
  INVALID_TOTAL: 400,
  INVALID_TRANSITION: 409,
  LISTING_UNAVAILABLE: 409,
  MULTI_SELLER_ORDER: 409,
  NOT_YOUR_ORDER: 403,
  ORDER_EMPTY: 400,
  ORDER_NOT_CANCELLABLE: 409,
  ORDER_NOT_DELIVERED: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_FULFILLABLE: 409,
  ORDER_NOT_PAYABLE: 409,
  PAYMENT_ALREADY_PENDING: 409,
  PRODUCT_UNAVAILABLE: 409,
  SELLER_UNAVAILABLE: 409,
  STOCK_UNKNOWN: 422,
}

export function reponseErreurMarketplace(error: unknown, contexte: string): NextResponse {
  const e = error as { message?: string; details?: string }
  let detail: Record<string, unknown> = {}
  if (e?.details) {
    try {
      detail = JSON.parse(e.details) as Record<string, unknown>
    } catch {
      // details non JSON — ignoré (jamais propagé verbatim).
    }
  }
  const code = e?.message ?? ''
  if (CODES_METIER_MARKETPLACE.has(code)) {
    return NextResponse.json(
      { erreur: code, code, ...detail },
      { status: STATUT_PAR_CODE[code] ?? 400 }
    )
  }
  console.error(`[marketplace] ${contexte} — erreur non métier:`, error)
  return NextResponse.json({ erreur: 'MARKETPLACE_ERROR', code: 'MARKETPLACE_ERROR' }, { status: 500 })
}
