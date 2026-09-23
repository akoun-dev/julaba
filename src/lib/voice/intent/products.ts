// Extraction et recherche produits (lexique-ivoirien, source de vérité unique).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import { PRODUCT_VOCAB } from '../lexique-ivoirien'

/**
 * Extract product name from text
 */
export function extractProduct(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [canonical, aliases] of Object.entries(PRODUCT_VOCAB)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) return canonical
    }
  }
  return null
}

/**
 * Get product name matching a search term
 */
export function searchProducts(term: string): string[] {
  const lower = term.toLowerCase()
  const results: string[] = []
  for (const [canonical, aliases] of Object.entries(PRODUCT_VOCAB)) {
    if (canonical.includes(lower) || aliases.some(a => a.includes(lower))) {
      results.push(canonical)
    }
  }
  return results
}

/**
 * Get all known product names
 */
export function getAllProducts(): string[] {
  return Object.keys(PRODUCT_VOCAB)
}
