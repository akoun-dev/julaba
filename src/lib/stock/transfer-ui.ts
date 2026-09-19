/**
 * UI Transferts inter-marchands (STK-815, §2.9/§28) — module PUR.
 *
 * Le backend est livré (STK-809 : RPC merchant_transfer_out/receive/cancel,
 * route /api/marchand/stock/transfers GET/POST/PATCH, handlers offline
 * stock-transfer / stock-transfer-action). Ce module porte ce qui doit être
 * IDENTIQUE partout et testé unitairement : libellés français des statuts,
 * droits d'action (recevoir / annuler), construction des payloads (camelCase
 * conforme aux schémas zod `stockTransferCreateSchema` /
 * `stockTransferActionSchema` de la route) et formatage des articles.
 *
 * Règles héritées du chantier stock (D1-D7, §36) :
 * - Le serveur est l'autorité : l'UI pré-vérifie le stock pour l'UX (phrase
 *   imposée formatStockRefusal) mais ne re-vérifie jamais à la place de la
 *   RPC — le refus 422 fait foi.
 * - JAMAIS de code brut anglais devant la marchande (statuts, erreurs).
 * - Rejeu offline : clientId lisible → operation_id déterministe côté route
 *   (operationUuid) — rejouer l'envoi ne crée JAMAIS un second transfert.
 */

import { formatQuantity, unitLabel } from '@/lib/stock/units'

export type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled'

export interface TransferItem {
  productId: string
  productName?: string | null
  /** Quantité ENVOYÉE, en unité de base (toujours positive — le signe vit
   * dans les mouvements TRANSFER_OUT/TRANSFER_IN, jamais ici). */
  quantityBase: number
  /** Quantité réellement reçue (renseignée à la réception par la RPC). */
  receivedQuantityBase?: number | null
  unitCode?: string | null
}

export interface TransferDoc {
  id: string
  merchantId: string
  toMerchantId: string
  /** 'out' = mon envoi, 'in' = envoi reçu d'un confrère. */
  direction: 'out' | 'in'
  status: TransferStatus
  note?: string | null
  createdAt?: string | null
  sentAt?: string | null
  receivedAt?: string | null
  /** Raison d'annulation (exposée par le GET depuis `note` quand
   * status='cancelled' — pas de colonne dédiée en base). */
  cancelReason?: string | null
  items: TransferItem[]
}

/** Libellés français des statuts — jamais le code brut devant la marchande. */
export const TRANSFER_STATUS_LABELS_FR: Record<TransferStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  received: 'Reçu',
  cancelled: 'Annulé',
}

/** Badges cohérents avec les statuts de commandes fournisseur
 * (ORDER_STATUS_BADGE de secondary-screens). */
export const TRANSFER_STATUS_BADGE_CLASS: Record<TransferStatus, string> = {
  draft: 'bg-slate-100 text-slate-500 border-0',
  sent: 'bg-amber-100 text-amber-700 border-0',
  received: 'bg-green-100 text-green-700 border-0',
  cancelled: 'bg-slate-100 text-slate-500 border-0',
}

/** SEUL le destinataire peut recevoir, et uniquement un envoi en cours
 * (la RPC refuse TRANSFER_NOT_ADDRESSED / TRANSFER_ALREADY_PROCESSED). */
export function canReceive(t: Pick<TransferDoc, 'direction' | 'status'>): boolean {
  return t.direction === 'in' && t.status === 'sent'
}

/** SEUL l'expéditeur peut annuler, et uniquement un envoi non reçu
 * (la RPC refuse TRANSFER_NOT_ADDRESSED / TRANSFER_ALREADY_PROCESSED). */
export function canCancel(t: Pick<TransferDoc, 'direction' | 'status'>): boolean {
  return t.direction === 'out' && t.status === 'sent'
}

/** ClientId lisible → la route le convertit en UUID déterministe
 * (operationUuid) : rejeu offline = un seul transfert (STK-808). */
export function transferClientId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `transfer-${Date.now()}-${rand}`
}

export interface TransferLineInput {
  productId: string
  /** Quantité DÉJÀ convertie en unité de base (l'écran convertit via
   * toBaseQuantity — ce module ne convertit pas, comme quick-actions). */
  quantityBase: number
  unitCode?: string
}

export interface TransferCreatePayload {
  merchantId: string
  toMerchantId: string
  items: Array<{ productId: string; quantityBase: number; unitCode?: string }>
  note?: string
  clientId: string
}

/** Payload POST /api/marchand/stock/transfers. Garde-fous client avec des
 * messages français parlables : destinataire obligatoire (≠ soi), au moins
 * une ligne valide. La zod de la route reste l'autorité. */
export function buildTransferPayload(input: {
  merchantId: string
  toMerchantId: string
  items: TransferLineInput[]
  note?: string
}): TransferCreatePayload {
  if (!input.toMerchantId || input.toMerchantId === input.merchantId) {
    throw new Error('Choisis le marchand à qui envoyer le stock.')
  }
  const items = input.items
    .filter((it) => it.productId && it.quantityBase > 0)
    .map((it) => ({
      productId: it.productId,
      quantityBase: it.quantityBase,
      ...(it.unitCode ? { unitCode: it.unitCode } : {}),
    }))
  if (items.length === 0) {
    throw new Error('Ajoute au moins un produit avec une quantité.')
  }
  return {
    merchantId: input.merchantId,
    toMerchantId: input.toMerchantId,
    items,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    clientId: transferClientId(),
  }
}

export type TransferAction = 'recevoir' | 'annuler'

export interface TransferActionPayload {
  merchantId: string
  transferId: string
  action: TransferAction
  reason?: string
}

/** Payload PATCH — la raison est OBLIGATOIRE pour annuler (superRefine zod
 * + RPC) : garantie client avec le même message que le serveur. */
export function buildTransferActionPayload(input: {
  merchantId: string
  transferId: string
  action: TransferAction
  reason?: string
}): TransferActionPayload {
  const payload: TransferActionPayload = {
    merchantId: input.merchantId,
    transferId: input.transferId,
    action: input.action,
  }
  if (input.action === 'annuler') {
    const reason = input.reason?.trim()
    if (!reason) throw new Error('Une raison est obligatoire pour annuler un transfert.')
    payload.reason = reason
  }
  return payload
}

/** Ligne d'article lisible « 2 sacs de riz » (unité parlée, pluriel géré
 * par unitLabel). Sans unitCode : quantité nue, JAMAIS d'unité inventée. */
export function formatTransferItemLabel(item: TransferItem): string {
  const unit = item.unitCode ? unitLabel(item.unitCode, item.quantityBase) : null
  const qtyPart = unit ? `${formatQuantity(item.quantityBase)} ${unit}` : formatQuantity(item.quantityBase)
  const name = item.productName?.trim()
  return name ? `${qtyPart} de ${name}` : qtyPart
}

/** Résumé multi-articles « 2 sacs de riz + 5 kilos de tomates ». */
export function formatTransferItemsLabel(items: TransferItem[]): string {
  return items.map(formatTransferItemLabel).join(' + ')
}

/** Écart de réception éventuel : « Reçu : 1,5 sac sur 2 sacs envoyés ».
 * Retourne null si pas encore reçu ou si reçu = envoyé. */
export function formatReceptionGap(item: TransferItem): string | null {
  if (item.receivedQuantityBase == null) return null
  if (Math.abs(item.receivedQuantityBase - item.quantityBase) < 0.0005) return null
  const unitSent = item.unitCode ? unitLabel(item.unitCode, item.quantityBase) : null
  const unitReceived = item.unitCode ? unitLabel(item.unitCode, item.receivedQuantityBase) : null
  const sentPart = unitSent ? `${formatQuantity(item.quantityBase)} ${unitSent}` : formatQuantity(item.quantityBase)
  const receivedPart = unitReceived
    ? `${formatQuantity(item.receivedQuantityBase)} ${unitReceived}`
    : formatQuantity(item.receivedQuantityBase)
  return `Reçu : ${receivedPart} sur ${sentPart} envoyés`
}
