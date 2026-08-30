import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockClassifier = vi.fn()

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(mockClassifier),
  env: { allowLocalModels: true },
}))

// nlu-ml.ts checks typeof window === 'undefined' and returns null early
// if window is not available (SSR guard). We need to provide a minimal window.
const originalWindow = globalThis.window

beforeEach(() => {
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {} as any)
  }
  mockClassifier.mockReset()
})

afterEach(() => {
  if (originalWindow === undefined) {
    vi.unstubAllGlobals()
  }
})

describe('nlu-ml', () => {
  describe('isConfidentGuess', () => {
    it('returns true when confidence >= 0.55', async () => {
      const { isConfidentGuess } = await import('../nlu-ml')
      expect(isConfidentGuess({ type: 'sale', confidence: 0.55 })).toBe(true)
      expect(isConfidentGuess({ type: 'sale', confidence: 0.9 })).toBe(true)
    })

    it('returns false when confidence < 0.55', async () => {
      const { isConfidentGuess } = await import('../nlu-ml')
      expect(isConfidentGuess({ type: 'sale', confidence: 0.54 })).toBe(false)
      expect(isConfidentGuess({ type: 'sale', confidence: 0.1 })).toBe(false)
    })
  })

  describe('classifyIntentFallback', () => {
    it('returns mapped intent type when classifier returns a top label', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      mockClassifier.mockResolvedValue({
        labels: ['vente d\'un produit', 'dépense ou achat'],
        scores: [0.82, 0.12],
      })

      const result = await classifyIntentFallback('j\'ai vendu 5 sacs de riz')
      expect(result).toEqual({ type: 'sale', confidence: 0.82 })
    })

    it('maps each CANDIDATE_LABELS to its IntentType', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      const cases: [string, string][] = [
        ['vente d\'un produit', 'sale'],
        ['dépense ou achat', 'expense'],
        ['réception de nouveau stock', 'restock'],
        ['navigation vers un écran de l\'application', 'navigation'],
        ['consultation d\'un résumé ou d\'un total', 'consultation'],
      ]

      for (const [label, expectedType] of cases) {
        mockClassifier.mockResolvedValueOnce({
          labels: [label],
          scores: [0.9],
        })
        const result = await classifyIntentFallback('test')
        expect(result?.type).toBe(expectedType)
      }
    })

    it('returns null when pipeline import fails', async () => {
      vi.resetModules()
      vi.doMock('@xenova/transformers', () => {
        throw new Error('WASM not supported')
      })
      const { classifyIntentFallback } = await import('../nlu-ml')

      const result = await classifyIntentFallback('test')
      expect(result).toBeNull()
    })

    it('returns null on timeout', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      mockClassifier.mockImplementation(() => new Promise(() => {}))

      const result = await classifyIntentFallback('test', 50)
      expect(result).toBeNull()
    })

    it('returns null when classifier throws', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      mockClassifier.mockRejectedValue(new Error('Model corrupted'))

      const result = await classifyIntentFallback('test')
      expect(result).toBeNull()
    })

    it('returns null when top label is not in CANDIDATE_LABELS', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      mockClassifier.mockResolvedValue({
        labels: ['unknown label xyz'],
        scores: [0.99],
      })

      const result = await classifyIntentFallback('test')
      expect(result).toBeNull()
    })

    it('uses default timeout of 4000ms', async () => {
      vi.resetModules()
      const { classifyIntentFallback } = await import('../nlu-ml')

      mockClassifier.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          labels: ['vente d\'un produit'],
          scores: [0.9],
        }), 5000))
      )

      const result = await classifyIntentFallback('test')
      expect(result).toBeNull()
    }, 10000)
  })
})
