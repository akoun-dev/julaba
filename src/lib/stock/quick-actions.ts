/**
 * Actions rapides MES PRODUITS (STK-811, §2.9) — module PUR.
 *
 * Chaque action rapide trace un VRAI mouvement via la RPC PostgreSQL
 * (même architecture que la voix) : plus jamais d'écriture absolue du
 * stock côté client (l'ancien « Réappro » qui PATCHait stockQty est
 * supprimé — il écrasait la vérité serveur avec une valeur périmée).
 *
 * L'affichage d'historique (§43) et les libellés FR vivent ici pour être
 * testés unitairement et identiques partout.
 */

import { unitLabel } from '@/lib/stock/units'

export type QuickActionType = 'AJOUTER' | 'PERTE' | 'COMPTER' | 'VENDRE'

export const QUICK_ACTIONS: readonly QuickActionType[] = ['AJOUTER', 'PERTE', 'COMPTER', 'VENDRE'] as const

/** Raison normalisée du mouvement — visible par la marchande dans
 * l'historique, donc en français, jamais un code brut. */
export const QUICK_ACTION_REASON: Record<Exclude<QuickActionType, 'VENDRE' | 'COMPTER'>, string> = {
  AJOUTER: 'Ajout manuel',
  PERTE: 'Perte déclarée',
}

export interface QuickMovementPayload {
  merchantId: string
  productId: string
  movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'LOSS'
  quantityBase: number
  unitCode?: string
  reason: string
  clientId: string
}

export interface QuickCountPayload {
  merchantId: string
  productId: string
  countedQuantityBase: number
  clientId: string
}

/** ClientId lisible → la route le convertit en UUID déterministe
 * (operationUuid) : rejeu offline = un seul mouvement (STK-808). */
export function quickActionClientId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `qa-${Date.now()}-${rand}`
}

/**
 * Construit le payload du mouvement pour AJOUTER / PERTE (VENDRE passe
 * par quick-sale → merchant_record_sale ; COMPTER a son propre payload).
 * quantityBase DOIT déjà être converti (resolveSpokenQuantity côté voix,
 * conversion unité × facteur côté UI) — ce module ne convertit pas.
 */
export function buildQuickMovementPayload(
  action: 'AJOUTER' | 'PERTE',
  input: { merchantId: string; productId: string; quantityBase: number; unitCode?: string },
): QuickMovementPayload {
  return {
    merchantId: input.merchantId,
    productId: input.productId,
    movementType: action === 'AJOUTER' ? 'ADJUSTMENT_IN' : 'LOSS',
    quantityBase: input.quantityBase,
    ...(input.unitCode ? { unitCode: input.unitCode } : {}),
    reason: QUICK_ACTION_REASON[action],
    clientId: quickActionClientId(),
  }
}

export function buildQuickCountPayload(input: {
  merchantId: string
  productId: string
  countedQuantityBase: number
}): QuickCountPayload {
  return {
    merchantId: input.merchantId,
    productId: input.productId,
    countedQuantityBase: input.countedQuantityBase,
    clientId: quickActionClientId(),
  }
}

// ── Historique produit (§43) — libellés français ────────────────────────

export interface HistoryMovement {
  /** Id du mouvement (retourné par l'API) — clé de liste UI. */
  id?: string
  movementType: string
  quantityBase: number
  unitCode?: string | null
  reason?: string | null
  createdAt: string
}

/** Libellé métier du mouvement (§43 : « Achat », « Perte »…) — JAMAIS le
 * code brut anglais devant la marchande. */
export const MOVEMENT_LABELS_FR: Record<string, string> = {
  OPENING_BALANCE: 'Stock initial',
  PURCHASE: 'Achat',
  RECEIPT: 'Réception',
  PRODUCTION: 'Production',
  CUSTOMER_RETURN: 'Retour client',
  ADJUSTMENT_IN: 'Ajout',
  ADJUSTMENT_OUT: 'Retrait',
  SALE: 'Vente',
  LOSS: 'Perte',
  DAMAGE: 'Dégât',
  DONATION: 'Don',
  SUPPLIER_RETURN: 'Retour fournisseur',
  TRANSFER_IN: 'Transfert reçu',
  TRANSFER_OUT: 'Transfert envoyé',
}

/** Entrées (+) et sorties (−) — l'ajustement prend le signe de la quantité. */
const ENTRY_MOVEMENTS = new Set(['OPENING_BALANCE', 'PURCHASE', 'RECEIPT', 'PRODUCTION', 'CUSTOMER_RETURN', 'TRANSFER_IN'])

export function movementSign(movementType: string, quantityBase: number): '+' | '-' {
  if (movementType === 'ADJUSTMENT_IN' || movementType === 'ADJUSTMENT_OUT') {
    return quantityBase >= 0 ? '+' : '-'
  }
  return ENTRY_MOVEMENTS.has(movementType) ? '+' : '-'
}

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const

/** Date courte française « 18 sept. 09:10 » — l'heure est locale, comme
 * la marchande la lit sur son téléphone. */
export function formatHistoryDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = MONTHS_FR[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${hh}:${mm}`
}

/** Ligne d'historique complète : « 18 sept. 09:10 — Achat +50 kilos ».
 * Le pluriel/nom parlé de l'unité passe par le catalogue units.ts
 * (kg → « kilos », jamais « kgs »). */
export function formatHistoryLabel(m: HistoryMovement, unitCodeFallback?: string | null): string {
  const label = MOVEMENT_LABELS_FR[m.movementType] ?? m.movementType
  const sign = movementSign(m.movementType, m.quantityBase)
  const qty = Math.abs(m.quantityBase)
  const unit = m.unitCode || unitCodeFallback || ''
  const unitPart = unit ? ` ${unitLabel(unit, qty)}` : ''
  const date = formatHistoryDate(m.createdAt)
  return `${date} — ${label} ${sign}${qty}${unitPart}`.replace(/\s+/g, ' ').trim()
}

/**
 * Raison affichable (la raison RPC métier « PERTE_VOCALE » n'est pas
 * montrée brute) — les raisons rapides françaises passent telles quelles.
 */
export function formatReasonNote(m: HistoryMovement): string | null {
  const reason = m.reason?.trim()
  if (!reason) return null
  const known: Record<string, string> = {
    PERTE_VOCALE: 'dictée à la voix',
    AJUSTEMENT_VOCALE: 'dicté à la voix',
    PRODUCTION_VOCALE: 'dicté à la voix',
    INVENTORY_COUNT: 'après comptage',
  }
  return known[reason] ?? reason
}
