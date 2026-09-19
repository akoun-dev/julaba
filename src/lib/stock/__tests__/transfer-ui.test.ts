import { describe, expect, it } from 'vitest'
import {
  buildTransferActionPayload,
  buildTransferPayload,
  canCancel,
  canReceive,
  formatReceptionGap,
  formatTransferItemLabel,
  formatTransferItemsLabel,
  transferClientId,
  TRANSFER_STATUS_BADGE_CLASS,
  TRANSFER_STATUS_LABELS_FR,
  type TransferDoc,
} from '../transfer-ui'

// STK-815 — UI transferts inter-marchands (module PUR) : libellés français
// des statuts, droits d'action (les mêmes que la RPC vérifie côté serveur),
// payloads conformes aux schémas zod de la route, formatage des articles
// (jamais de code brut, jamais d'unité inventée).

function doc(overrides: Partial<TransferDoc> = {}): TransferDoc {
  return {
    id: 't1',
    merchantId: 'm1',
    toMerchantId: 'm2',
    direction: 'out',
    status: 'sent',
    items: [{ productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac' }],
    ...overrides,
  }
}

describe('transfer-ui — libellés des statuts (STK-815, §28)', () => {
  it('les 4 statuts du CHECK DB ont un libellé français (jamais de code brut)', () => {
    // CHECK status in ('draft','sent','received','cancelled') — 20260919090800.
    expect(Object.keys(TRANSFER_STATUS_LABELS_FR).sort()).toEqual(['cancelled', 'draft', 'received', 'sent'].sort())
    expect(TRANSFER_STATUS_LABELS_FR.sent).toBe('Envoyé')
    expect(TRANSFER_STATUS_LABELS_FR.received).toBe('Reçu')
    expect(TRANSFER_STATUS_LABELS_FR.cancelled).toBe('Annulé')
    expect(TRANSFER_STATUS_LABELS_FR.draft).toBe('Brouillon')
  })

  it('chaque statut a une classe de badge (pas de statut sans style)', () => {
    for (const status of Object.keys(TRANSFER_STATUS_LABELS_FR) as Array<keyof typeof TRANSFER_STATUS_LABELS_FR>) {
      expect(TRANSFER_STATUS_BADGE_CLASS[status]).toMatch(/bg-/)
    }
  })
})

describe('transfer-ui — droits d\'action (miroir des gardes RPC)', () => {
  it('SEUL un envoi entrant en cours peut être reçu', () => {
    expect(canReceive(doc({ direction: 'in', status: 'sent' }))).toBe(true)
    expect(canReceive(doc({ direction: 'in', status: 'received' }))).toBe(false)
    expect(canReceive(doc({ direction: 'in', status: 'cancelled' }))).toBe(false)
    // Un envoi sortant ne se « reçoit » pas — c'est l'autre qui reçoit.
    expect(canReceive(doc({ direction: 'out', status: 'sent' }))).toBe(false)
  })

  it('SEUL un envoi sortant en cours peut être annulé', () => {
    expect(canCancel(doc({ direction: 'out', status: 'sent' }))).toBe(true)
    expect(canCancel(doc({ direction: 'out', status: 'received' }))).toBe(false)
    expect(canCancel(doc({ direction: 'out', status: 'cancelled' }))).toBe(false)
    // Un transfert entrant ne s'annule pas depuis ici (refus RPC
    // TRANSFER_NOT_ADDRESSED — l'annulation appartient à l'expéditeur).
    expect(canCancel(doc({ direction: 'in', status: 'sent' }))).toBe(false)
  })
})

describe('transfer-ui — clientId idempotent (STK-808)', () => {
  it('clientId lisible préfixé transfer- (→ operation_id déterministe côté route)', () => {
    const id = transferClientId()
    expect(id).toMatch(/^transfer-\d+-[a-z0-9]+$/)
  })

  it('deux appels donnent deux clientId différents (deux envois distincts)', () => {
    expect(transferClientId()).not.toBe(transferClientId())
  })
})

describe('transfer-ui — payload d\'envoi (contrat stockTransferCreateSchema)', () => {
  it('payload camelCase exact, unitCode seulement si présent, note tronquée d\'espaces', () => {
    const payload = buildTransferPayload({
      merchantId: 'm1',
      toMerchantId: 'm2',
      note: '  Pour la boutique du marché  ',
      items: [
        { productId: 'p1', quantityBase: 50, unitCode: 'kg' },
        { productId: 'p2', quantityBase: 2 },
      ],
    })
    expect(payload).toEqual({
      merchantId: 'm1',
      toMerchantId: 'm2',
      items: [
        { productId: 'p1', quantityBase: 50, unitCode: 'kg' },
        { productId: 'p2', quantityBase: 2 },
      ],
      note: 'Pour la boutique du marché',
      clientId: expect.stringMatching(/^transfer-/),
    })
  })

  it('refuse un destinataire absent ou soi-même (TRANSFER_SELF serait rejeté par la RPC)', () => {
    expect(() => buildTransferPayload({ merchantId: 'm1', toMerchantId: '', items: [{ productId: 'p1', quantityBase: 1 }] }))
      .toThrow('Choisis le marchand à qui envoyer le stock.')
    expect(() => buildTransferPayload({ merchantId: 'm1', toMerchantId: 'm1', items: [{ productId: 'p1', quantityBase: 1 }] }))
      .toThrow('Choisis le marchand à qui envoyer le stock.')
  })

  it('refuse un envoi sans ligne valide (au moins un produit + quantité > 0)', () => {
    expect(() => buildTransferPayload({ merchantId: 'm1', toMerchantId: 'm2', items: [] }))
      .toThrow('Ajoute au moins un produit avec une quantité.')
    expect(() => buildTransferPayload({ merchantId: 'm1', toMerchantId: 'm2', items: [{ productId: '', quantityBase: 5 }] }))
      .toThrow('Ajoute au moins un produit avec une quantité.')
    expect(() => buildTransferPayload({ merchantId: 'm1', toMerchantId: 'm2', items: [{ productId: 'p1', quantityBase: 0 }] }))
      .toThrow('Ajoute au moins un produit avec une quantité.')
  })
})

describe('transfer-ui — payload d\'action (contrat stockTransferActionSchema)', () => {
  it('recevoir : pas de champ reason', () => {
    expect(buildTransferActionPayload({ merchantId: 'm2', transferId: 't1', action: 'recevoir' })).toEqual({
      merchantId: 'm2',
      transferId: 't1',
      action: 'recevoir',
    })
  })

  it('annuler : la raison est OBLIGATOIRE (même message que le superRefine zod)', () => {
    expect(() => buildTransferActionPayload({ merchantId: 'm1', transferId: 't1', action: 'annuler', reason: '  ' }))
      .toThrow('Une raison est obligatoire pour annuler un transfert.')
    expect(() => buildTransferActionPayload({ merchantId: 'm1', transferId: 't1', action: 'annuler' }))
      .toThrow('Une raison est obligatoire pour annuler un transfert.')
    expect(buildTransferActionPayload({ merchantId: 'm1', transferId: 't1', action: 'annuler', reason: ' Erreur de produit ' }))
      .toEqual({ merchantId: 'm1', transferId: 't1', action: 'annuler', reason: 'Erreur de produit' })
  })
})

describe('transfer-ui — formatage des articles (unités parlées)', () => {
  it('« 2 sacs de riz » — pluriel géré par unitLabel, quantité formatée', () => {
    expect(formatTransferItemLabel({ productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac' }))
      .toBe('2 sacs de riz')
    expect(formatTransferItemLabel({ productId: 'p1', productName: 'riz', quantityBase: 1, unitCode: 'sac' }))
      .toBe('1 sac de riz')
  })

  it('quantité décimale à la française « 1,5 kilo de tomates »', () => {
    expect(formatTransferItemLabel({ productId: 'p2', productName: 'tomates', quantityBase: 1.5, unitCode: 'kg' }))
      .toBe('1,5 kilos de tomates')
  })

  it('sans unitCode : quantité nue, JAMAIS d\'unité inventée', () => {
    expect(formatTransferItemLabel({ productId: 'p3', productName: 'œufs', quantityBase: 30 }))
      .toBe('30 de œufs')
  })

  it('résumé multi-articles joint avec « + »', () => {
    expect(formatTransferItemsLabel([
      { productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac' },
      { productId: 'p2', productName: 'tomates', quantityBase: 5, unitCode: 'kg' },
    ])).toBe('2 sacs de riz + 5 kilos de tomates')
  })

  it('écart de réception : « Reçu : 1,5 sac sur 2 sacs envoyés », null si identique ou non reçu', () => {
    expect(formatReceptionGap({ productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac' })).toBeNull()
    expect(formatReceptionGap({ productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac', receivedQuantityBase: 2 })).toBeNull()
    expect(formatReceptionGap({ productId: 'p1', productName: 'riz', quantityBase: 2, unitCode: 'sac', receivedQuantityBase: 1.5 }))
      .toBe('Reçu : 1,5 sacs sur 2 sacs envoyés')
  })
})
