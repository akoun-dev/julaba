/**
 * MODE-910 (§25) — « Ma journée en chiffres » : agrégats PURS de la carte
 * stats de l'écran Mode Marché (aucune dépendance store/réseau — les
 * appelants fournissent les données réelles).
 *
 * RÈGLE D'OR offline-first : les chiffres viennent des sources existantes
 * (collectTodaySales, route /api/marchand/sales, session marché clôturée
 * persistée), JAMAIS d'un fetch bloquant — l'absence de données = null /
 * zéro honnête, jamais une erreur. La définition du chiffre d'affaires et
 * de la variation est celle de l'agrégateur PARTAGÉ du backoffice
 * (src/lib/ventes-jour.ts) : elle ne peut pas diverger entre l'écran
 * Ventes BO et la carte Mode Marché.
 *
 * Montants ENTIERS (règle du dépôt) : toute valeur non entière est écrêtée
 * à l'entrée (Math.floor), jamais inventée ni arrondie à la hausse.
 */

import {
  buildVentesSummary,
  dayRangeUtc,
  percentChange,
  shiftDateStr,
  todayDateStr,
  type VenteLike,
} from '../ventes-jour'
import type { MarketSessionRecord } from './market-session'

export interface DayStats {
  /** Nombre de VENTES du jour (annulées exclues) — pas des lignes article. */
  saleCount: number
  /** Chiffre d'affaires du jour (FCFA entier, annulées exclues). */
  revenue: number
  /** Variation vs hier en % (entier) — null si hier est inconnu ou nul. */
  changeVsYesterday: number | null
}

function entierPositif(v: number | undefined | null): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.floor(v))
}

/**
 * Agrège le jour à partir des compteurs réels de collectTodaySales
 * (saleCount, total) : `previous` = CA d'hier quand il est DISPONIBLE
 * (route serveur joignable, ou session marché clôturée hier — voir
 * yesterdayRevenueFromServerSales / yesterdayRevenueFromSession) ;
 * undefined/null/inconnu → variation null (ligne simplement absente de la
 * carte, jamais un « erreur » ni un % du néant quand hier vaut zéro).
 */
export function buildDayStats(
  input: { saleCount: number; revenue: number },
  previous?: number | null,
): DayStats {
  const revenue = entierPositif(input.revenue)
  const yesterday = typeof previous === 'number' && Number.isFinite(previous)
    ? entierPositif(previous)
    : null
  return {
    saleCount: entierPositif(input.saleCount),
    revenue,
    changeVsYesterday: yesterday === null ? null : percentChange(revenue, yesterday),
  }
}

/** Vente minimale telle que renvoyée par GET /api/marchand/sales. */
export interface ServerSaleMinimal {
  totalAmount?: number
  annulee?: boolean
  createdAt?: string
  items?: Array<{ quantity?: number; unitPrice?: number }>
}

/**
 * CA d'hier à partir des ventes du serveur (route EXISTANTE
 * /api/marchand/sales, bornes yesterdayUtcRange) : les ventes annulées
 * (MODE-909) sont EXCLUES du revenu — même règle que le GET et que
 * l'écran Ventes. La somme passe par l'agrégateur PARTAGÉ
 * buildVentesSummary (chaque vente mappée en VenteLike). Réponse absente
 * ou vide → 0 honnête (journée sans vente), jamais une erreur.
 */
export function yesterdayRevenueFromServerSales(sales: ServerSaleMinimal[] | null | undefined): number {
  const rows: VenteLike[] = (sales ?? [])
    .filter((s) => !s.annulee)
    .map((s) => {
      const total = entierPositif(s.totalAmount)
      return {
        totalAmount: total,
        amountReceived: total,
        isVoiceSale: false,
        createdAt: s.createdAt ?? '',
        items: (s.items ?? []).map((i) => {
          const quantity = entierPositif(i.quantity)
          return { quantity, subtotal: quantity * entierPositif(i.unitPrice) }
        }),
      }
    })
  return buildVentesSummary(rows).revenue
}

/** Champs utiles d'une session marché clôturée (market-mode-store). */
export type ClosedSessionLike = Pick<
  MarketSessionRecord,
  'status' | 'closedAt' | 'salesTotal'
>

/**
 * Repli LOCAL pour l'hier : la dernière session marché PERSISTÉE, si elle
 * a été clôturée HIER (calendrier UTC = horloge d'Abidjan, même convention
 * que ventes-jour.ts), porte le salesTotal de cette journée. Sinon null —
 * la variation est simplement absente de la carte (jamais devinée).
 */
export function yesterdayRevenueFromSession(
  record: ClosedSessionLike | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!record || record.status !== 'closed') return null
  if (record.salesTotal == null || !record.closedAt) return null
  const yesterday = shiftDateStr(todayDateStr(now), -1)
  if (record.closedAt.slice(0, 10) !== yesterday) return null
  return entierPositif(record.salesTotal)
}

/**
 * Bornes UTC d'HIER [00:00, 00:00) pour interroger la route ventes —
 * réutilise dayRangeUtc/todayDateStr/shiftDateStr de ventes-jour.ts (la
 * définition du « jour » ne peut pas diverger du backoffice).
 */
export function yesterdayUtcRange(now: Date = new Date()): { start: string; end: string } {
  return dayRangeUtc(shiftDateStr(todayDateStr(now), -1))
}
