// Helpers purs pour le module BO « Ventes marchands » — détail des ventes
// de la journée. Importés à la fois par la route API
// (/api/backoffice/ventes) et par les tests unitaires, afin que la
// définition de « la journée » et des agrégats ne puisse jamais diverger
// entre le serveur et l'affichage.
//
// Fuseau : la plateforme opère en Côte d'Ivoire (Africa/Abidjan, UTC+0
// toute l'année, pas d'heure d'été). Une « journée » est donc bornée par
// minuit UTC — les bornes calculées ici sont explicitement ISO UTC pour
// rester utilisables telles quelles dans des requêtes Supabase.

// ============== JOURNÉE ==============

export interface DayRange {
  start: string
  end: string
}

/**
 * Bornes [start, end) d'une journée au format ISO UTC.
 * `dateStr` doit être au format YYYY-MM-DD (la date « locale Abidjan »).
 * end est exclusif : `gte(created_at, start) + lt(created_at, end)`.
 */
export function dayRangeUtc(dateStr: string): DayRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Date invalide (attendu YYYY-MM-DD) : ${dateStr}`)
  }
  const start = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Date invalide : ${dateStr}`)
  }
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Date du jour au format YYYY-MM-DD (horloge UTC = horloge d'Abidjan). */
export function todayDateStr(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Décale une date YYYY-MM-DD de `days` jours (négatif = passé). */
export function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Date invalide : ${dateStr}`)
  }
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ============== AGRÉGATS ==============

/** Vente détaillée telle que renvoyée par l'API BO (forme minimale utile). */
export interface VenteLike {
  totalAmount: number
  amountReceived: number
  isVoiceSale: boolean
  createdAt: string
  items: { quantity: number; subtotal: number }[]
}

export interface VentesSummary {
  count: number
  revenue: number
  amountReceived: number
  changeGiven: number
  voiceCount: number
  itemsSold: number
  avgBasket: number
}

export function buildVentesSummary(sales: VenteLike[]): VentesSummary {
  const summary: VentesSummary = {
    count: sales.length,
    revenue: 0,
    amountReceived: 0,
    changeGiven: 0,
    voiceCount: 0,
    itemsSold: 0,
    avgBasket: 0,
  }
  for (const s of sales) {
    summary.revenue += s.totalAmount || 0
    summary.amountReceived += s.amountReceived || 0
    summary.changeGiven += Math.max(0, (s.amountReceived || 0) - (s.totalAmount || 0))
    if (s.isVoiceSale) summary.voiceCount += 1
    for (const item of s.items ?? []) summary.itemsSold += item.quantity || 0
  }
  summary.avgBasket = summary.count > 0 ? Math.round(summary.revenue / summary.count) : 0
  return summary
}

/** Variation en % entre deux valeurs — null si non calculable (hier = 0). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ============== REGROUPEMENTS ==============

export interface MerchantAgg {
  merchantId: string
  merchantName: string
  zone: string | null
  salesCount: number
  revenue: number
  itemsSold: number
}

export function groupSalesByMerchant<
  T extends VenteLike & { merchantId: string; merchantName: string; zone?: string | null },
>(sales: T[]): MerchantAgg[] {
  const map = new Map<string, MerchantAgg>()
  for (const s of sales) {
    let agg = map.get(s.merchantId)
    if (!agg) {
      agg = {
        merchantId: s.merchantId,
        merchantName: s.merchantName,
        zone: s.zone ?? null,
        salesCount: 0,
        revenue: 0,
        itemsSold: 0,
      }
      map.set(s.merchantId, agg)
    }
    agg.salesCount += 1
    agg.revenue += s.totalAmount || 0
    for (const item of s.items ?? []) agg.itemsSold += item.quantity || 0
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.merchantName.localeCompare(b.merchantName))
}

/** CA par heure (0–23) pour le graphique de la journée. */
export function revenueByHour(sales: VenteLike[]): { hour: number; revenue: number; count: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, count: 0 }))
  for (const s of sales) {
    const h = new Date(s.createdAt).getUTCHours()
    if (h >= 0 && h < 24) {
      buckets[h].revenue += s.totalAmount || 0
      buckets[h].count += 1
    }
  }
  return buckets
}
