// Quantités + unités orales (STK-807) — UNIT_ALTERNATION dérive du catalogue units.ts.
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import { STOCK_UNITS, resolveUnitCode } from '@/lib/stock/units'
import { NUMBER_WORDS } from '../lexique-ivoirien'

/**
 * Extract quantity (number of items) from text
 */
export function extractQuantity(text: string): number | null {
  const lower = text.toLowerCase()
  
  // "X unités", "X pièces", "X kilos", "X sacs" — chiffres OU mots
  // (« deux sacs de riz » doit marcher à la voix comme « 2 sacs »)
  const qtyMatch = lower.match(
    /(\d+|zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante)\s*(?:unit[ée]s?|pi[èe]ces?|kilos?|kg|sacs?|caisses?|tas?|lots?|cartons?|botte|bottes?)/,
  )
  if (qtyMatch) {
    const raw = qtyMatch[1]
    const n = /^\d+$/.test(raw) ? parseInt(raw) : NUMBER_WORDS[raw]
    if (n !== undefined && n > 0) return n
  }
  
  // "X à Y francs" format
  const atMatch = lower.match(/(\d+)\s*à\s*(\d+)/)
  if (atMatch) return parseInt(atMatch[1])
  
  return null
}

// ── Quantité + unité orales (STK-807, §2.7) ──────────────────────────────
//
// L'extracteur historique ci-dessus jette l'unité : « 2 sacs » → 2. Le
// stock a besoin de l'unité (« 5 kilos de tomates » ≠ « 5 sacs de
// tomates »). extractQuantityWithUnit renvoie {quantity, unit} où unit
// est le CODE canonique du catalogue units.ts (une seule source de
// vérité : la voix, l'API et l'affichage partagent le même vocabulaire).

export interface QuantityWithUnit {
  quantity: number
  /** Code canonique (units.ts) ou null si aucune unité parlée. */
  unit: string | null
}

/** Alternation regex de TOUS les alias du catalogue, du plus long au plus
 * court (« kilogrammes » avant « kilo » avant « kg » avant « g »), chacun
 * suivi d'une garde anti-préfixe : JS \b ignore é/â, on ferme donc
 * explicitement sur une lettre (ex. « 5 garçons » ne doit pas capter « g »). */
const UNIT_ALTERNATION = STOCK_UNITS.flatMap((u) => u.aliases)
  .sort((a, b) => b.length - a.length)
  .map((a) => `${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zà-öø-ÿ])`)
  .join('|')

const QTY_WITH_UNIT_RE = new RegExp(
  `(\\d+(?:[.,]\\d+)?|zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante)\\s*(?:${UNIT_ALTERNATION})`,
  'i',
)

/**
 * « 2 sacs de riz » → {quantity: 2, unit: 'sac'} ; « 1,5 kilo » →
 * {quantity: 1.5, unit: 'kg'} ; « deux régimes de plantain » →
 * {quantity: 2, unit: 'regime'} ; « 5 tomates » → {quantity: 5, unit: null}.
 * Renvoie null si aucune quantité parlée.
 */
export function extractQuantityWithUnit(text: string): QuantityWithUnit | null {
  const lower = text.toLowerCase()
  const match = lower.match(QTY_WITH_UNIT_RE)
  if (!match) {
    // Sans mot d'unité : nombre nu (« vendu 5 tomates ») — le premier
    // nombre parlé fait foi (chiffres OU mots, décimales acceptées).
    const bare = lower.match(BARE_NUMBER_RE)
    if (bare) {
      const n = /^\d/.test(bare[1])
        ? parseFloat(bare[1].replace(',', '.'))
        : NUMBER_WORDS[bare[1]] ?? NaN
      if (isFinite(n) && n > 0) return { quantity: n, unit: null }
    }
    return null
  }
  const raw = match[1]
  let n: number
  if (/^\d/.test(raw)) {
    n = parseFloat(raw.replace(',', '.'))
  } else {
    n = NUMBER_WORDS[raw] ?? NaN
  }
  if (!isFinite(n) || n <= 0) return null
  // Le mot d'unité est la fin de match[0] après le nombre parlé.
  const spokenUnit = match[0].slice(match[1].length).trim()
  return { quantity: n, unit: resolveUnitCode(spokenUnit) }
}

const BARE_NUMBER_RE = /(\d+(?:[.,]\d+)?|zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante)/i
