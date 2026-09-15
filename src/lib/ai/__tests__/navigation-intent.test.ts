import { describe, expect, it } from 'vitest'
import {
  NAVIGATION_CONFIDENCE_THRESHOLD,
  NAVIGATION_ROUTES,
  isNavigationCandidate,
  parseNavigationOutput,
} from '../navigation-intent'

describe('navigation intent contract', () => {
  it('accepts every whitelisted marchand route', () => {
    for (const targetRoute of NAVIGATION_ROUTES) {
      expect(parseNavigationOutput(JSON.stringify({ intent: 'navigation', targetRoute, confidence: 0.9 }))).toEqual({
        intent: 'navigation', targetRoute, confidence: 0.9,
      })
    }
  })

  it('rejects unknown routes, URLs and invalid confidence', () => {
    expect(parseNavigationOutput('{"intent":"navigation","targetRoute":"/stock","confidence":0.9}').intent).toBe('unknown')
    expect(parseNavigationOutput('{"intent":"navigation","targetRoute":"https://example.com","confidence":0.9}').intent).toBe('unknown')
    expect(parseNavigationOutput('{"intent":"navigation","targetRoute":"stock","confidence":1.1}').intent).toBe('unknown')
    expect(parseNavigationOutput('{"intent":"navigation","confidence":0.9}').intent).toBe('unknown')
  })

  it('decodes a JSON code fence but not arbitrary Markdown', () => {
    expect(parseNavigationOutput('```json\n{"intent":"navigation","targetRoute":"stock","confidence":0.9}\n```')).toEqual({
      intent: 'navigation', targetRoute: 'stock', confidence: 0.9,
    })
    expect(parseNavigationOutput('Voici: {"intent":"navigation","targetRoute":"stock","confidence":0.9}').intent).toBe('unknown')
  })

  it('uses the inclusive confidence threshold', () => {
    expect(0.74 >= NAVIGATION_CONFIDENCE_THRESHOLD).toBe(false)
    expect(0.75 >= NAVIGATION_CONFIDENCE_THRESHOLD).toBe(true)
    expect(0.9 >= NAVIGATION_CONFIDENCE_THRESHOLD).toBe(true)
  })

  it('keeps financial and stock mutations out of the AI candidate path', () => {
    expect(isNavigationCandidate('Vends trois tomates')).toBe(false)
    expect(isNavigationCandidate('Note une dépense de transport')).toBe(false)
    expect(isNavigationCandidate('Ajoute du stock')).toBe(false)
    expect(isNavigationCandidate('Montre-moi mes ventes de la semaine')).toBe(true)
    expect(isNavigationCandidate('Ouvre l’endroit où je note mes dépenses')).toBe(true)
    expect(isNavigationCandidate('Je veux voir mon argent')).toBe(true)
    expect(isNavigationCandidate('Où est-ce que je vois ce qu’il me reste ?')).toBe(true)
  })
})
