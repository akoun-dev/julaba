import { describe, it, expect } from 'vitest'
import { createStockMovementSchema, stockCountSchema, createPurchaseSchema } from '@/lib/validation/marchand'
import { buildQuickMovementPayload, buildQuickCountPayload } from '../quick-actions'
import { STOCK_UNITS, resolveUnitCode } from '../units'
import { PRICE_LEVELS } from '../prices'
import { STOCK_ERROR_CODES } from '../stock-service'

/**
 * Tests TRANSVERSES (STK-812, §2.10) : les contrats entre modules PUR et
 * les schémas zod des routes doivent rester ALIGNÉS — un payload généré
 * par une action rapide (ou par la voix) doit TOUJOURS passer la validation
 * serveur sans adaptation. S'ils divergent, c'est une vente/perte perdue
 * en production : ce fichier est le garde-fou.
 */

describe('transverse — contrats quick-actions ⊆ zod routes (STK-812)', () => {
  it('payload AJOUTER passe createStockMovementSchema tel quel', () => {
    const payload = buildQuickMovementPayload('AJOUTER', {
      merchantId: 'm1', productId: 'p1', quantityBase: 50, unitCode: 'kg',
    })
    const parsed = createStockMovementSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
  })

  it('payload PERTE passe createStockMovementSchema (raison présente, 400 refusé)', () => {
    const payload = buildQuickMovementPayload('PERTE', {
      merchantId: 'm1', productId: 'p1', quantityBase: 3,
    })
    const parsed = createStockMovementSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    // Sortie anormale ⇒ raison obligatoire — le payload l'embarque déjà.
    if (parsed.success) expect(parsed.data.reason?.trim().length).toBeGreaterThan(0)
  })

  it('payload COMPTER passe stockCountSchema tel quel', () => {
    const payload = buildQuickCountPayload({
      merchantId: 'm1', productId: 'p1', countedQuantityBase: 30,
    })
    expect(stockCountSchema.safeParse(payload).success).toBe(true)
  })

  it('payload voix (perte dicte) passe createStockMovementSchema (clientId STK-808)', () => {
    const payload = {
      merchantId: 'm1',
      productId: 'p1',
      movementType: 'LOSS',
      quantityBase: 5,
      unitCode: 'kg',
      reason: 'PERTE_VOCALE',
      clientId: 'perte-1737-abc123',
    }
    expect(createStockMovementSchema.safeParse(payload).success).toBe(true)
  })

  it('payload achat vocal passe createPurchaseSchema (items mono + clientId)', () => {
    const payload = {
      merchantId: 'm1',
      items: [{ productName: 'Oignons', quantity: 2, unitCostCfa: 12000, unitCode: 'sac', quantityBase: 50 }],
      amountPaid: 24000,
      clientId: 'achat-1737-xyz',
    }
    expect(createPurchaseSchema.safeParse(payload).success).toBe(true)
  })

  it('un payload SANS raison sur une sortie est refusé 400 (cohérence zod/RPC CHECK)', () => {
    const bad = { merchantId: 'm1', productId: 'p1', movementType: 'LOSS', quantityBase: 5, clientId: 'qa-x' }
    expect(createStockMovementSchema.safeParse(bad).success).toBe(false)
  })
})

describe('transverse — codes métier normalisés (STK-812, §36)', () => {
  it('codes stock-service verrouillés : 5 stock + 5 transferts (contrat routes 400/422)', () => {
    // Vérification du VRAI littéral exporté (STK-815) : les codes sont
    // consommés par parseStockRpcError et mappés HTTP 422
    // (INSUFFICIENT_STOCK/UNKNOWN_STOCK) vs 400 (reste). Ce test verrouille
    // la LISTE pour qu'aucun code n'apparaisse ou ne disparaisse en silence.
    expect([...STOCK_ERROR_CODES]).toEqual([
      'INSUFFICIENT_STOCK', 'PRODUCT_NOT_FOUND', 'PRODUCT_INACTIVE', 'INVALID_QUANTITY', 'UNKNOWN_STOCK',
      'TRANSFER_SELF', 'TRANSFER_NOT_FOUND', 'TRANSFER_NOT_ADDRESSED', 'TRANSFER_NOT_OWNER', 'TRANSFER_ALREADY_PROCESSED',
    ])
  })

  it('labels métier des transferts couvrent les codes TRANSFER_* réels des RPC (STK-809/812)', async () => {
    // La route transferts mappe chaque code RAISÉ par les RPC (dumps
    // pg_proc : TRANSFER_SELF / NOT_FOUND / NOT_ADDRESSED / NOT_OWNER /
    // ALREADY_PROCESSED) vers un message français lisible.
    const { readFile } = await import('node:fs/promises')
    const src = await readFile('src/app/api/marchand/stock/transfers/route.ts', 'utf8')
    for (const code of ['TRANSFER_SELF', 'TRANSFER_NOT_FOUND', 'TRANSFER_NOT_ADDRESSED', 'TRANSFER_NOT_OWNER', 'TRANSFER_ALREADY_PROCESSED']) {
      expect(src).toContain(code)
    }
  })

  it('catalogue unités : la voix, l API et l affichage partagent la même source', () => {
    expect(STOCK_UNITS).toHaveLength(21)
    // Chaque code d'unité doit se résoudre depuis ses alias (la voix ne
    // doit jamais produire un code que l'API refuserait).
    for (const u of STOCK_UNITS) {
      for (const alias of u.aliases) {
        expect(resolveUnitCode(alias)).toBe(u.code)
      }
    }
  })

  it('4 niveaux de prix stables (STK-810, §29) — la DB CHECK exige exactement ces valeurs', () => {
    expect(PRICE_LEVELS).toEqual(['PURCHASE', 'RETAIL', 'SEMI_WHOLESALE', 'WHOLESALE'])
  })
})
