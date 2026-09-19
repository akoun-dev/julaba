import { describe, expect, it } from 'vitest'
import {
  QUICK_CANCEL_REASONS,
  annuleVenteConfirmPhrase,
  annuleVenteProduitLabel,
  saleAlreadyCancelledPhrase,
  saleReversedPhrase,
  saleToCancelNotFoundPhrase,
  voiceReversalDeclinedPhrase,
} from '../reversal-phrases'

// MODE-909 (§28) — phrases pures de l'annulation de vente. Comme
// credit-phrases.ts, ce module est volontairement PUR : aucun store, aucun
// réseau — l'appelant (ventes-screen, voice-modal) fournit les données
// réelles et la phrase ne devine rien. La voix marchande TUTOIE, zéro emoji.

describe('saleReversedPhrase — annulation enregistrée (§28)', () => {
  it('phrase imposée : « Vente annulée. Le stock est revenu. »', () => {
    expect(saleReversedPhrase()).toBe('Vente annulée. Le stock est revenu.')
  })

  it('ne contient jamais « supprim » ni d’emoji', () => {
    const phrase = saleReversedPhrase()
    expect(phrase).not.toMatch(/supprim/i)
    expect(phrase).toMatch(/^[\p{L}\p{N}'’ .,-]+$/u)
  })
})

describe('annuleVenteConfirmPhrase — confirmation orale obligatoire (§28)', () => {
  it('reprend le montant et le produit de la dernière vente locale', () => {
    expect(annuleVenteConfirmPhrase(2000, 'tomates')).toBe(
      'Tu veux annuler la vente de 2 000 francs de tomates ? Je confirme ?',
    )
  })

  it('formatMontantParle pour les milliers (cohérence écran + voix)', () => {
    expect(annuleVenteConfirmPhrase(25000, 'sacs de riz')).toBe(
      'Tu veux annuler la vente de 25 000 francs de sacs de riz ? Je confirme ?',
    )
  })
})

describe('annuleVenteProduitLabel — libellé du produit de la vente', () => {
  it('un seul article : le nom du produit', () => {
    expect(annuleVenteProduitLabel([{ productName: 'tomates' }])).toBe('tomates')
  })

  it('plusieurs articles : le nombre d’articles (jamais de liste invented à l’oral)', () => {
    expect(
      annuleVenteProduitLabel([{ productName: 'tomates' }, { productName: 'riz' }]),
    ).toBe('2 articles')
  })

  it('journal sans item : libellé neutre « Article »', () => {
    expect(annuleVenteProduitLabel([])).toBe('Article')
  })
})

describe('phrases honnêtes des cas particuliers', () => {
  it('aucune vente à annuler : « Je ne trouve pas de vente à annuler aujourd\'hui. »', () => {
    expect(saleToCancelNotFoundPhrase()).toBe(
      "Je ne trouve pas de vente à annuler aujourd'hui.",
    )
  })

  it('vente déjà annulée : « Cette vente est déjà annulée. »', () => {
    expect(saleAlreadyCancelledPhrase()).toBe('Cette vente est déjà annulée.')
  })

  it('refus oral (« non ») : « Je n\'ai rien annulé. »', () => {
    expect(voiceReversalDeclinedPhrase()).toBe("Je n'ai rien annulé.")
  })
})

describe('QUICK_CANCEL_REASONS — raisons rapides de la modale (§28)', () => {
  it('propose exactement les trois raisons du parcours de caisse', () => {
    expect(QUICK_CANCEL_REASONS).toEqual([
      'Erreur de prix',
      'Erreur de produit',
      'Client parti',
    ])
  })

  it('chaque raison satisfait la règle 3-200 (zod + CHECK base)', () => {
    for (const reason of QUICK_CANCEL_REASONS) {
      expect(reason.trim().length).toBeGreaterThanOrEqual(3)
      expect(reason.trim().length).toBeLessThanOrEqual(200)
    }
  })
})
