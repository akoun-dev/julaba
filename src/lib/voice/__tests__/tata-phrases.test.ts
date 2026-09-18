import { describe, it, expect } from 'vitest'
import { formatSaleConfirmation, buildDayTotalText } from '../tata-phrases'

// VOCAL-607 — formulations vocales de Tata : confirmation détaillée d'une
// vente (produit, quantité, montant) sans AUCUNE formule de fin, et total
// du jour parlé pour les consultations.

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
