import { describe, expect, it } from 'vitest'
import {
  PRODUCTEUR_NAVIGATION_ROUTES,
  isProducteurNavigationCandidate,
  parseProducteurNavigationOutput,
} from '../producteur-navigation-intent'

describe('producteur navigation intent contract', () => {
  it('accepts only producer routes', () => {
    for (const targetRoute of PRODUCTEUR_NAVIGATION_ROUTES) {
      expect(parseProducteurNavigationOutput(JSON.stringify({ intent: 'navigation', targetRoute, confidence: 0.75 }))).toEqual({
        intent: 'navigation', targetRoute, confidence: 0.75,
      })
    }
    expect(parseProducteurNavigationOutput('{"intent":"navigation","targetRoute":"stock","confidence":0.9}').intent).toBe('unknown')
  })

  it('rejects harvest mutations before AI classification', () => {
    expect(isProducteurNavigationCandidate("J'ai récolté 100 kilos de manioc")).toBe(false)
    expect(isProducteurNavigationCandidate('Déclare une récolte de 50 kg')).toBe(false)
    expect(isProducteurNavigationCandidate('Ouvre mes récoltes')).toBe(true)
    expect(isProducteurNavigationCandidate('Montre-moi mon stock')).toBe(true)
    expect(isProducteurNavigationCandidate('Va dans mes commandes')).toBe(true)
  })

  it('supports the same fenced JSON contract', () => {
    expect(parseProducteurNavigationOutput('```json\n{"intent":"navigation","targetRoute":"prod-cycles","confidence":0.9}\n```')).toEqual({
      intent: 'navigation', targetRoute: 'prod-cycles', confidence: 0.9,
    })
  })
})
