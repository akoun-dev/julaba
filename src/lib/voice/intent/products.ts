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

/**
 * Extract a spoken product that is not yet in the controlled lexicon.
 * This is intentionally limited to an explicit sale utterance. The result is
 * stored as a free-text sale line without a productId, so it never invents a
 * stock item or silently decrements inventory.
 */
export function extractFreeSaleProduct(text: string): string | null {
  const candidate = text
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/^(?:j['’]ai\s+)?vendu\s+|^(?:je\s+)?vends?\s+|^vente\s+(?:de\s+)?/i, '')
    .replace(/\b(?:à|a|pour)\s+\d[\d\s]*(?:f|fcfa|francs?)?\s*$/i, '')
    .replace(/\b\d[\d\s]*(?:f|fcfa|francs?)?\s*$/i, '')
    .replace(/\s+(?:à|a|pour)\s*$/i, '')
    .replace(/^\d+(?:[.,]\d+)?\s+(?:kilo(?:s)?|kg|sac(?:s)?|carton(?:s)?|bidon(?:s)?|bouteille(?:s)?|pi[eè]ce(?:s)?|unit[eé](?:s)?)\s+(?:de\s+)?/i, '')
    .replace(/^(?:de|du|des|la|le|un|une)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!candidate || candidate.length < 2 || candidate.length > 80) return null
  if (/^(?:combien|francs?|fcfa|f|à|a|pour)$/i.test(candidate)) return null
  return candidate
}
