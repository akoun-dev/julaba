// Nombres et montants en toutes lettres (lexique-ivoirien, MODE-955).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import { NUMBER_WORDS } from '../lexique-ivoirien'

/**
 * Parse French number words to numeric value
 * Supports: "deux mille cinq cents" → 2500, "mille cinq" → 1500
 */
export function parseFrenchNumber(text: string): number | null {
  const lower = text.toLowerCase().trim()
  
  // Direct digit parsing
  const directMatch = lower.match(/^(\d+)$/)
  if (directMatch) return parseInt(directMatch[1])
  
  // Amount with 'f' suffix: "2000f", "100 f", "2millef"
  const amountF = lower.match(/(\d+(?:\s*\d+)*)\s*f(?:rancs?)?$/)
  if (amountF) {
    return parseInt(amountF[1].replace(/\s/g, ''))
  }
  
  // "X mille Y" patterns (e.g., "deux mille cinq cents", "mille cinq")
  const millePattern = lower.match(/([\w\s-]*?)\s*mille\s*([\w\s-]*)/)
  if (millePattern) {
    let thousands = 1
    if (millePattern[1]) {
      const n = parseSimpleNumber(millePattern[1].trim())
      if (n !== null && n >= 1 && n <= 999) thousands = n
    }
    let remainder = 0
    if (millePattern[2]) {
      const r = parseSimpleNumber(millePattern[2].trim())
      if (r !== null) remainder = r
    }
    return thousands * 1000 + remainder
  }
  
  // Simple word number ("cinq cents", "deux mille")
  return parseSimpleNumber(lower)
}

function parseSimpleNumber(text: string): number | null {
  const words = text.replace(/-/g, ' ').split(/\s+/)
  let total = 0
  let current = 0
  let hasMultiplier = false
  
  for (const word of words) {
    const n = NUMBER_WORDS[word]
    if (n !== undefined) {
      if (n === 100) {
        if (current === 0) current = 1
        current *= 100
        hasMultiplier = true
      } else if (n === 1000) {
        if (current === 0) current = 1
        current *= 1000
        hasMultiplier = true
      } else if (n === 1000000) {
        if (current === 0) current = 1
        current *= 1000000
        hasMultiplier = true
      } else {
        current += n
      }
    }
  }
  
  return current > 0 ? current : null
}

/**
 * Extract amount from text
 * Handles: "deux mille francs", "2000f", "mille cinq", "500 FCFA"
 */
export function extractAmount(text: string): number | null {
  const lower = text.toLowerCase()

  // « vendu du bissap à deux mille cinq cents francs » : parse the amount
  // phrase separately so quantity/product words cannot be summed into it.
  const spokenFrMatch = lower.match(/(?:\bà|\ba|\bpour)\s+(.+?)\s+(?:francs?|fcfa)\b/)
  if (spokenFrMatch) {
    const spokenAmount = parseFrenchNumber(spokenFrMatch[1].trim())
    if (spokenAmount !== null && spokenAmount > 0) return spokenAmount
  }
  
  // "X francs" / "X FCFA"
  const frMatch = lower.match(/([\d\s]+)\s*(?:francs?|fcfa)/)
  if (frMatch) {
    const n = parseInt(frMatch[1].replace(/\s/g, ''))
    if (!isNaN(n)) return n
  }
  
  // "Xf" / "X f" (abbreviation)
  const fMatch = lower.match(/(\d+)\s*f(?:rancs?)?/)
  if (fMatch) {
    const n = parseInt(fMatch[1])
    if (!isNaN(n)) return n
  }
  
  // Standalone digits at end: "tomates 2000", « trois sacs de riz 2000 ».
  // AVANT la lecture en mots (audit VOCAL-603) : parseSimpleNumber remontait
  // la quantité en lettres (« trois ») comme montant et ignorait les
  // chiffres finaux — « trois sacs de riz 2000 » donnait 3.
  const endDigits = lower.match(/(\d{3,7})$/)
  if (endDigits) return parseInt(endDigits[1])
  
  // "X mille" or "mille X" (word-based)
  const wordResult = parseFrenchNumber(lower)
  if (wordResult !== null && wordResult > 0) return wordResult
  
  return null
}
