import { describe, it, expect } from 'vitest'
import {
  buildQuickMovementPayload,
  buildQuickCountPayload,
  formatHistoryLabel,
  formatHistoryDate,
  formatReasonNote,
  movementSign,
  MOVEMENT_LABELS_FR,
  QUICK_ACTION_REASON,
} from '../quick-actions'

describe('quick-actions — payloads des actions rapides (STK-811, §2.9)', () => {
  it('AJOUTER → ADJUSTMENT_IN, raison « Ajout manuel »', () => {
    const p = buildQuickMovementPayload('AJOUTER', {
      merchantId: 'm1', productId: 'p1', quantityBase: 50, unitCode: 'kg',
    })
    expect(p.movementType).toBe('ADJUSTMENT_IN')
    expect(p.reason).toBe('Ajout manuel')
    expect(p.quantityBase).toBe(50)
    expect(p.clientId).toMatch(/^qa-\d+-[a-z0-9]+$/)
  })

  it('PERTE → LOSS, raison « Perte déclarée »', () => {
    const p = buildQuickMovementPayload('PERTE', { merchantId: 'm1', productId: 'p1', quantityBase: 3 })
    expect(p.movementType).toBe('LOSS')
    expect(p.reason).toBe('Perte déclarée')
  })

  it('COMPTER → payload de comptage (countedQuantityBase)', () => {
    const p = buildQuickCountPayload({ merchantId: 'm1', productId: 'p1', countedQuantityBase: 30 })
    expect(p.countedQuantityBase).toBe(30)
    expect(p.clientId).toMatch(/^qa-/)
  })

  it('clientId lisible unique (rejeu offline = un seul mouvement, STK-808)', () => {
    const a = buildQuickMovementPayload('AJOUTER', { merchantId: 'm1', productId: 'p1', quantityBase: 1 })
    const b = buildQuickMovementPayload('AJOUTER', { merchantId: 'm1', productId: 'p1', quantityBase: 1 })
    expect(a.clientId).not.toBe(b.clientId)
  })

  it('les raisons rapides sont en FRANÇAIS lisible (jamais un code brut)', () => {
    expect(Object.values(QUICK_ACTION_REASON)).toEqual(['Ajout manuel', 'Perte déclarée'])
  })
})

describe('formatHistoryLabel — historique produit (§43, libellés FR)', () => {
  const mk = (movementType: string, quantityBase: number, createdAt = '2026-09-18T09:10:00Z', unitCode?: string) => ({
    movementType, quantityBase, createdAt, unitCode: unitCode ?? null, reason: null,
  })

  it('« 18 sept. 09:10 — Achat +50 kilos »', () => {
    const label = formatHistoryLabel(
      { movementType: 'PURCHASE', quantityBase: 50, unitCode: 'kg', createdAt: '2026-09-18T09:10:00Z', reason: null },
    )
    expect(label).toContain('Achat +50 kilos')
    expect(label).toContain('18 sept. 09:10')
    expect(label).toContain('—')
  })

  it('perte : signe −, libellé Perte', () => {
    const label = formatHistoryLabel(
      { movementType: 'LOSS', quantityBase: 5, unitCode: 'kg', createdAt: '2026-09-18T09:10:00Z', reason: null },
    )
    expect(label).toContain('Perte -5')
  })

  it('vente : signe −, libellé Vente', () => {
    const label = formatHistoryLabel(
      { movementType: 'SALE', quantityBase: 2, unitCode: 'sac', createdAt: '2026-09-18T09:10:00Z', reason: null },
    )
    expect(label).toContain('Vente -2')
  })

  it('tous les types de mouvement ont un libellé FR (jamais de code brut)', () => {
    for (const code of ['OPENING_BALANCE', 'PURCHASE', 'RECEIPT', 'PRODUCTION', 'CUSTOMER_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SALE', 'LOSS', 'DAMAGE', 'DONATION', 'SUPPLIER_RETURN', 'TRANSFER_IN', 'TRANSFER_OUT']) {
      expect(MOVEMENT_LABELS_FR[code]).toBeTruthy()
      expect(MOVEMENT_LABELS_FR[code]).not.toMatch(/^[A-Z_]+$/)
    }
  })

  it('type inconnu : le code est rendu tel quel (honnête, pas un crash)', () => {
    const label = formatHistoryLabel(
      { movementType: 'MYSTÈRE', quantityBase: 1, createdAt: '2026-09-18T09:10:00Z', reason: null },
    )
    expect(label).toContain('MYSTÈRE')
  })

  it('date invalide → chaîne vide (jamais « Invalid Date »)', () => {
    expect(formatHistoryDate('pas-une-date')).toBe('')
  })
})

describe('formatHistoryDate — « 18 sept. 09:10 »', () => {
  it('format court français', () => {
    const d = new Date(2026, 8, 18, 9, 10) // locale : 18 sept. 09:10
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
    expect(formatHistoryDate(iso)).toBe('18 sept. 09:10')
  })
})

describe('movementSign — entrées + / sorties −', () => {
  it('achats et réceptions = +', () => {
    expect(movementSign('PURCHASE', 50)).toBe('+')
    expect(movementSign('RECEIPT', 50)).toBe('+')
    expect(movementSign('PRODUCTION', 50)).toBe('+')
    expect(movementSign('TRANSFER_IN', 50)).toBe('+')
  })

  it('ventes, pertes, dons, dégâts = −', () => {
    expect(movementSign('SALE', 20)).toBe('-')
    expect(movementSign('LOSS', 5)).toBe('-')
    expect(movementSign('DONATION', 3)).toBe('-')
    expect(movementSign('TRANSFER_OUT', 10)).toBe('-')
  })

  it('ajustements : le signe suit la quantité', () => {
    expect(movementSign('ADJUSTMENT_IN', 20)).toBe('+')
    expect(movementSign('ADJUSTMENT_OUT', -3)).toBe('-')
  })
})

describe('formatReasonNote — raisons métier traduites pour l\'affichage', () => {
  it('PERTE_VOCALE → « dictée à la voix »', () => {
    expect(formatReasonNote({ movementType: 'LOSS', quantityBase: 5, createdAt: '', reason: 'PERTE_VOCALE' })).toBe('dictée à la voix')
  })

  it('INVENTORY_COUNT → « après comptage »', () => {
    expect(formatReasonNote({ movementType: 'ADJUSTMENT_IN', quantityBase: 5, createdAt: '', reason: 'INVENTORY_COUNT' })).toBe('après comptage')
  })

  it('raison libre affichée telle quelle ; absente → null', () => {
    expect(formatReasonNote({ movementType: 'LOSS', quantityBase: 1, createdAt: '', reason: 'casse au transport' })).toBe('casse au transport')
    expect(formatReasonNote({ movementType: 'SALE', quantityBase: 1, createdAt: '', reason: null })).toBeNull()
  })
})
