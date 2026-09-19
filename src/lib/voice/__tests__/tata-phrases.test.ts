import { describe, it, expect } from 'vitest'
import { formatSaleConfirmation, buildDayTotalText, formatStockRefusal } from '../tata-phrases'

// VOCAL-607 — formulations vocales de Tata : confirmation détaillée d'une
// vente (produit, quantité, montant) sans AUCUNE formule de fin, et total
// du jour parlé pour les consultations.
// STK-805 — refus strict stock insuffisant : formulations imposées par le
// cahier des charges (§18, vouvoiement VOCAL-612 : « Vous avez seulement 10
// kilos de tomates en stock. Je ne peux pas enregistrer une vente de 15 kilos. »).

describe('formatSaleConfirmation — confirmation détaillée, jamais de formule de fin', () => {
  it('produit + quantité > 1 : « Vente enregistrée : 2 sacs de riz pour 25 000 francs. »', () => {
    const text = formatSaleConfirmation({ name: 'sacs de riz', quantity: 2, total: 25000 })
    expect(text).toBe('Vente enregistrée : 2 sacs de riz pour 25 000 francs.')
  })

  it('produit + quantité 1 : pas de quantité plaquée devant', () => {
    const text = formatSaleConfirmation({ name: 'tomates', quantity: 1, total: 2000 })
    expect(text).toBe('Vente enregistrée : tomates pour 2 000 francs.')
  })

  it('produit inconnu (« Article ») : le montant seul fait foi', () => {
    const text = formatSaleConfirmation({ name: 'Article', quantity: 1, total: 3000 })
    expect(text).toBe('Vente enregistrée : 3 000 francs.')
  })

  it('vente non synchronisée : la note est explicite (audit VOCAL-604)', () => {
    const text = formatSaleConfirmation({ name: 'riz', quantity: 1, total: 5000, synced: false })
    expect(text).toContain('En attente de synchronisation.')
  })

  it('vente synchronisée : aucune note de synchronisation', () => {
    const text = formatSaleConfirmation({ name: 'riz', quantity: 1, total: 5000, synced: true })
    expect(text).not.toContain('synchronisation')
  })

  it('stock épuisé : avertissement signalé (audit VOCAL-605)', () => {
    const text = formatSaleConfirmation({ name: 'riz', quantity: 3, total: 15000, synced: true, stockShort: true })
    expect(text).toContain('Attention, stock épuisé.')
  })

  it('JAMAIS de « bonne journée » dans une confirmation de vente', () => {
    for (const sale of [
      { name: 'sacs de riz', quantity: 2, total: 25000, synced: true },
      { name: 'Article', quantity: 1, total: 1000, synced: false, stockShort: true },
    ]) {
      const text = formatSaleConfirmation(sale)
      expect(text.toLowerCase()).not.toContain('bonne journée')
      expect(text.toLowerCase()).not.toContain('au revoir')
      expect(text.toLowerCase()).not.toContain('à bientôt')
    }
  })
})

describe('buildDayTotalText — consultation du total du jour', () => {
  it('aucune vente : message dédié, jamais un total inventé', () => {
    expect(buildDayTotalText(0, 0)).toBe('Aucune vente enregistrée aujourd\'hui.')
  })

  it('une vente : singulier correct', () => {
    expect(buildDayTotalText(1, 5000)).toBe('Ventes du jour : 5 000 francs pour 1 vente.')
  })

  it('plusieurs ventes : pluriel + montant réel', () => {
    expect(buildDayTotalText(3, 41500)).toBe('Ventes du jour : 41 500 francs pour 3 ventes.')
  })
})

describe('formatStockRefusal — refus strict « impossible de vendre sans stock » (STK-805)', () => {
  it('phrase imposée §18 (vouvoiement) : « Vous avez seulement 10 kilos de tomates en stock. Je ne peux pas enregistrer une vente de 15 kilos. »', () => {
    const text = formatStockRefusal({ product: 'tomates', available: 10, requested: 15, unit: 'kg' })
    expect(text).toBe('Vous avez seulement 10 kilos de tomates en stock. Je ne peux pas enregistrer une vente de 15 kilos.')
  })

  it('stock nul : « Vous n\'avez plus de stock de tomates. … » (§18 : plus de stock pour ce produit)', () => {
    const text = formatStockRefusal({ product: 'tomates', available: 0, requested: 5, unit: 'kg' })
    expect(text).toBe('Vous n\'avez plus de stock de tomates. Je ne peux pas enregistrer une vente de 5 kilos.')
  })

  it('stock nul sans produit connu : « ce produit » générique', () => {
    const text = formatStockRefusal({ available: 0, requested: 2, unit: 'kg' })
    expect(text).toBe('Vous n\'avez plus de stock de ce produit. Je ne peux pas enregistrer une vente de 2 kilos.')
  })

  it('quantité 1 : unité au singulier (« 1 kilo »)', () => {
    const text = formatStockRefusal({ product: 'riz', available: 1, requested: 3, unit: 'kg' })
    expect(text).toBe('Vous avez seulement 1 kilo de riz en stock. Je ne peux pas enregistrer une vente de 3 kilos.')
  })

  it('unités commerciales : sacs, bassines, paniers…', () => {
    expect(
      formatStockRefusal({ product: 'oignons', available: 2, requested: 4, unit: 'sac' })
    ).toBe('Vous avez seulement 2 sacs de oignons en stock. Je ne peux pas enregistrer une vente de 4 sacs.')
    expect(
      formatStockRefusal({ product: 'piments', available: 3, requested: 6, unit: 'bassine' })
    ).toContain('3 bassines')
  })

  it('unité inconnue (ex. nouvelle unité STK-806) : rendue telle quelle, jamais inventée', () => {
    const text = formatStockRefusal({ product: 'attiéké', available: 4, requested: 9, unit: 'régime' })
    expect(text).toBe('Vous avez seulement 4 régime de attiéké en stock. Je ne peux pas enregistrer une vente de 9 régime.')
  })

  it('sans unité : la phrase ne l\'invente pas (jamais de donnée inventée)', () => {
    const text = formatStockRefusal({ product: 'tomates', available: 7, requested: 15 })
    expect(text).toBe('Vous avez seulement 7 tomates en stock. Je ne peux pas enregistrer une vente de 15.')
  })

  it('montants en chiffres lisibles (15 000 → verbalisé par la couche voix)', () => {
    const text = formatStockRefusal({ product: 'sacs de riz', available: 2, requested: 15000, unit: 'kg' })
    expect(text).toContain('15 000 kilos')
  })

  it('jamais de « vente enregistrée » ni de formule de fin dans un refus', () => {
    for (const r of [
      { product: 'tomates', available: 0, requested: 5, unit: 'kg' },
      { product: 'tomates', available: 3, requested: 15, unit: 'kg' },
      { available: 0, requested: 2 },
    ]) {
      const text = formatStockRefusal(r)
      expect(text).not.toContain('enregistrée')
      expect(text.toLowerCase()).not.toContain('bonne journée')
    }
  })
})
