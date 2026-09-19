/**
 * Prix multi-niveaux + marge (STK-810, §29-§30). Module PUR : aucune
 * dépendance réseau ni store.
 *
 * Règles honnêtes :
 *  • le prix COURANT = ligne ouverte (valid_to null) à la valid_from la
 *    plus récente — l'historique n'est JAMAIS écrasé (§29) ;
 *  • computeMargin renvoie null quand le coût d'achat est inconnu —
 *    « je ne sais pas » dit la vérité, une marge inventée serait un mensonge ;
 *  • une marge NÉGATIVE est affichée telle quelle (perte = information,
 *    jamais cachée).
 */

export type PriceLevel = 'PURCHASE' | 'RETAIL' | 'WHOLESALE' | 'SEMI_WHOLESALE'

export const PRICE_LEVELS: readonly PriceLevel[] = ['PURCHASE', 'RETAIL', 'SEMI_WHOLESALE', 'WHOLESALE'] as const

/** Libellé parlé/affiché des niveaux (Tata + UI). */
export const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  PURCHASE: "prix d'achat",
  RETAIL: 'prix de détail',
  SEMI_WHOLESALE: 'prix demi-gros',
  WHOLESALE: 'prix de gros',
}

export interface PriceEntry {
  priceType: string
  amountCfa: number
  validFrom: string
  validTo: string | null
}

/** La ligne ouverte (valid_to null) la plus récente pour un niveau —
 * null s'il n'y en a pas (pas de prix courant inventé). */
export function resolveCurrentPrice(
  entries: PriceEntry[],
  level: PriceLevel,
): PriceEntry | null {
  const open = entries
    .filter((e) => e.priceType === level && e.validTo === null)
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))
  return open[0] ?? null
}

/**
 * Le prix applicable à un instant donné (validité temporelle §29) :
 * validFrom ≤ at < validTo (valid_to null = ouvert), la plus récente
 * validFrom gagne. Renvoie null si aucun prix ne couvre l'instant.
 */
export function resolvePriceAt(
  entries: PriceEntry[],
  level: PriceLevel,
  at: Date = new Date(),
): PriceEntry | null {
  const t = at.getTime()
  const hit = entries
    .filter((e) => {
      if (e.priceType !== level) return false
      const from = Date.parse(e.validFrom)
      if (Number.isNaN(from) || from > t) return false
      if (e.validTo !== null) {
        const to = Date.parse(e.validTo)
        if (!Number.isNaN(to) && t >= to) return false
      }
      return true
    })
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))
  return hit[0] ?? null
}

export interface MarginResult {
  /** FCFA gagnés (ou perdus) par unité de vente. */
  marginCfa: number
  /** Marge en % du prix de vente — négative = perte. */
  marginPct: number
  /** true si la marge est négative (perte — information à montrer). */
  isLoss: boolean
}

/**
 * Marge unitaire = prix de vente − coût d'achat. Cost inconnu (null /
 * undefined / ≤ 0 : aucun achat enregistré) → null — HONNÊTETÉ : on ne
 * fabrique pas une marge avec un coût inventé. Une perte (coût > prix)
 * est renvoyée telle quelle, avec isLoss=true.
 */
export function computeMargin(salePriceCfa: number, unitCostCfa: number | null | undefined): MarginResult | null {
  if (unitCostCfa === null || unitCostCfa === undefined || unitCostCfa <= 0) return null
  if (!isFinite(salePriceCfa) || salePriceCfa < 0) return null
  const marginCfa = salePriceCfa - unitCostCfa
  const marginPct = salePriceCfa > 0 ? (marginCfa / salePriceCfa) * 100 : null
  return {
    marginCfa,
    marginPct: marginPct === null ? 0 : Math.round(marginPct * 10) / 10,
    isLoss: marginCfa < 0,
  }
}
