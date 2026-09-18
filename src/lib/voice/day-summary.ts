// Résumé vocal des ventes du jour (VOCAL-607) — « Résumé du jour ».
//
// Mission : lorsque la marchande touche la tuile « Résumé du jour », Tata
// dicte TOUTES les ventes réellement enregistrées pendant la journée en
// cours (produit, quantité, montant) puis le total. JAMAIS de vente,
// quantité ou prix inventé : chaque ligne vient d'une source de données
// réelle, dans cet ordre de confiance :
//
//   1. Serveur (/api/marchand/sales, borné 6 s) — source de vérité ;
//   2. File offline (ventes en attente de synchronisation — elles SONT
//      enregistrées, l'argent est réel, elles doivent être dictées) ;
//   3. Repli agrégats du store caisse (totaux persistés du jour) si le
//      serveur est injoignable — dicté sans détail article, honnête.
//
// Le texte produit est Oral-first (« 25 000 francs ») : la couche voix
// (toSpeechText) verbalise les montants automatiquement.

import { fetchJsonWithTimeout } from '../http'
import { getPendingSyncEntries } from '../offline-db'
import { useCaisseStore } from '../stores/caisse-store'

/** Une ligne vendue (un article d'une vente) — uniquement des données réelles. */
export interface DaySaleLine {
  name: string
  quantity: number
  unitPrice: number
  /** Montant de la ligne (quantité × prix unitaire quand non fourni). */
  total: number
}

export type DaySummarySource = 'server' | 'server+queue' | 'queue' | 'aggregates'

export interface DaySummaryData {
  /** Lignes aplaties (une entrée par article vendu), ordre chronologique. */
  sales: DaySaleLine[]
  /** Nombre de VENTES (une vente peut contenir plusieurs lignes). */
  saleCount: number
  /** Montant total des ventes du jour. */
  total: number
  source: DaySummarySource
}

/** Plage « aujourd'hui » (00:00 local → maintenant), même définition que le
 * filtre « Aujourd'hui » de l'écran Ventes. */
export function todayIsoRange(): { startDate: string; endDate: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { startDate: start.toISOString(), endDate: now.toISOString() }
}

interface ServerSaleShape {
  id?: string
  clientId?: string
  items?: Array<{ productName?: string; quantity?: number; unitPrice?: number }>
  totalAmount?: number
}

interface QueueSalePayload {
  items?: Array<{ productName?: string; quantity?: number; unitPrice?: number }>
  totalAmount?: number
}

function linesFromItems(
  items: Array<{ productName?: string; quantity?: number; unitPrice?: number }> | undefined,
  saleTotal = 0,
): DaySaleLine[] {
  const lines = (items ?? []).map((i) => {
    const quantity = Math.max(1, Math.floor(i.quantity ?? 1))
    const unitPrice = Math.max(0, Math.floor(i.unitPrice ?? 0))
    return {
      name: i.productName || 'Article',
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    }
  })
  // Vente à un seul article : le total dicté/record (totalAmount) fait loi
  // (audit VOCAL-603) — quantité × prix unitaire arrondi peut diverger de
  // quelques francs (3 × 8 334 = 25 002 pour un dicté 25 000) et c'est le
  // montant RÉELLEMENT enregistré qui doit être dicté.
  if (lines.length === 1 && saleTotal > 0) lines[0].total = saleTotal
  return lines
}

async function fetchServerTodaySales(
  merchantId: string,
  range: { startDate: string; endDate: string },
): Promise<{ lines: DaySaleLine[]; count: number; total: number }> {
  const params = new URLSearchParams({ merchantId, ...range })
  const res = await fetchJsonWithTimeout(
    `/api/marchand/sales?${params}`,
    undefined,
    6_000,
  )
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = (await res.json()) as { sales?: ServerSaleShape[] }
  const sales = data.sales ?? []
  const lines = sales.flatMap((s) => linesFromItems(s.items, Math.max(0, Math.floor(s.totalAmount ?? 0))))
  return {
    lines,
    count: sales.length,
    total: sales.reduce((sum, s) => sum + Math.max(0, Math.floor(s.totalAmount ?? 0)), 0),
  }
}

function queueTodaySales(entries: Array<{ entity: string; payload: unknown }>): { lines: DaySaleLine[]; count: number; total: number } {
  const saleEntries = entries.filter((e) => e.entity === 'sale')
  const lines: DaySaleLine[] = []
  let total = 0
  for (const e of saleEntries) {
    const payload = e.payload as QueueSalePayload
    const saleTotal = Math.max(0, Math.floor(payload?.totalAmount ?? 0))
    lines.push(...linesFromItems(payload?.items, saleTotal))
    total += saleTotal
  }
  return { lines, count: saleEntries.length, total }
}

/**
 * Collecte les ventes réelles du jour : serveur + file offline (fusion),
 * repli agrégats caisse si tout le reste échoue. Ne lève JAMAIS — en cas
 * d'échec total, les agrégats locaux (données réelles persistées) servent
 * de dernier recours.
 */
export async function collectTodaySales(merchantId?: string | null): Promise<DaySummaryData> {
  const range = todayIsoRange()
  const [serverRes, queueRes] = await Promise.allSettled([
    merchantId
      ? fetchServerTodaySales(merchantId, range)
      : Promise.reject(new Error('Compte non identifié')),
    getPendingSyncEntries(),
  ])

  const queueSales = queueRes.status === 'fulfilled'
    ? queueTodaySales(queueRes.value)
    : { lines: [] as DaySaleLine[], count: 0, total: 0 }

  if (serverRes.status === 'fulfilled') {
    const sales = [...serverRes.value.lines, ...queueSales.lines]
    return {
      sales,
      saleCount: serverRes.value.count + queueSales.count,
      total: serverRes.value.total + queueSales.total,
      source: queueSales.count > 0 ? 'server+queue' : 'server',
    }
  }

  if (queueSales.count > 0) {
    return {
      sales: queueSales.lines,
      saleCount: queueSales.count,
      total: queueSales.total,
      source: 'queue',
    }
  }

  // Dernier recours : agrégats du jour du store caisse (persistés, réels).
  // Pas de détail article disponible — le dicté le dit sans inventer.
  const { todaySales, todaySalesCount } = useCaisseStore.getState()
  return { sales: [], saleCount: todaySalesCount, total: todaySales, source: 'aggregates' }
}

/**
 * Au-delà de ce nombre de lignes dictées, Tata groupe le reste : un marché
 * à 40 ventes ne doit pas faire 4 minutes de synthèse vocale (risque de
 * coupure moteur TTS = plus rien d'entendu). Le total reste TOUJOURS le
 * total réel complet — grouper n'est pas inventer.
 */
const MAX_SPOKEN_LINES = 12

function montantParle(amount: number): string {
  // Espace ordinaire : l'ICU produit une espace insécable étroite (U+202F)
  // selon la version — normalisée pour un dicté déterministe.
  return new Intl.NumberFormat('fr-FR')
    .format(Math.max(0, Math.floor(amount)))
    .replace(/[\u202F\u00A0\u2009]/g, ' ')
}

function ligneParlee(s: DaySaleLine): string {
  const label = s.quantity > 1 ? `${s.quantity} ${s.name}` : s.name
  return `${label} à ${montantParle(s.total)} francs`
}

/**
 * Construit le texte dicté du résumé du jour — PUR et testé.
 *
 * Attendu terrain (VOCAL-607) :
 *  « Aujourd'hui, tu as vendu 3 sacs de riz à 25 000 francs, 5 bouteilles
 *   d'huile à 1 500 francs et 2 cartons de tomate à 8 000 francs. Au total,
 *   tu as réalisé 3 ventes pour un montant de 41 500 francs. »
 *  Aucune vente : « Tu n'as encore enregistré aucune vente aujourd'hui. »
 */
export function buildDaySummarySpeech(data: DaySummaryData): string {
  if (data.saleCount <= 0 || (data.sales.length === 0 && data.total <= 0)) {
    return 'Tu n\'as encore enregistré aucune vente aujourd\'hui.'
  }

  const totalPhrase = `Au total, tu as réalisé ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour un montant de ${montantParle(data.total)} francs.`

  // Repli agrégats : pas de détail article — dicté du total réel uniquement.
  if (data.sales.length === 0) {
    return `Aujourd'hui, tu as réalisé ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour un montant de ${montantParle(data.total)} francs.`
  }

  const lines = data.sales.map(ligneParlee)
  if (lines.length <= MAX_SPOKEN_LINES) {
    const list = lines.length === 1
      ? lines[0]
      : `${lines.slice(0, -1).join(', ')} et ${lines[lines.length - 1]}`
    return `Aujourd'hui, tu as vendu ${list}. ${totalPhrase}`
  }

  const spoken = lines.slice(0, MAX_SPOKEN_LINES).join(', ')
  const remaining = data.sales.length - MAX_SPOKEN_LINES
  return `Aujourd'hui, tu as vendu ${spoken}, et ${remaining} autres ventes. ${totalPhrase}`
}
