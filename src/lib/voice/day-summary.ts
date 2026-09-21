// Résumé vocal du jour (VOCAL-607 ventes, VOCAL-608 dépenses, VOCAL-609
// solde de caisse, VOCAL-610 formulation orale, VOCAL-611 solde « Il te
// reste X francs en caisse ») — « Résumé du jour ».
//
// Mission : lorsque la marchande touche la tuile « Résumé du jour », Tata
// dicte TOUTES les ventes réellement enregistrées pendant la journée en
// cours (produit, quantité, montant) puis le total, PUIS les dépenses
// réelles du jour (libellé, montant) et leur total. JAMAIS de vente,
// quantité, prix ou dépense inventé : chaque ligne vient d'une source de
// données réelle, dans cet ordre de confiance :
//
//   1. Serveur (/api/marchand/sales, /api/marchand/expenses — borné 6 s)
//      — source de vérité ;
//   2. File offline (ventes et dépenses en attente de synchronisation —
//      elles SONT enregistrées, l'argent est réel, elles doivent être
//      dictées) ;
//   3. Repli agrégats du store caisse (totaux persistés du jour) si le
//      serveur est injoignable — dicté sans détail, honnête.
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

/** Une dépense du jour — uniquement des données réelles enregistrées. */
export interface DayExpenseLine {
  /** Description réelle, sinon libellé FR de la catégorie enregistrée. */
  label: string
  amount: number
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
  /** MODE-909 (§28) — nombre de ventes ANNULÉES du jour (opération inverse
   * append-only) : elles ne sont PAS comptées (ni dans saleCount ni dans
   * total) mais Tata le dit (« N vente(s) annulée(s) non comptée(s). »).
   * Absent/0 = aucune annulation à mentionner. */
  cancelledCount?: number
  /** Dépenses réelles du jour (VOCAL-608) — même ordre de confiance que
   * les ventes. Champs optionnels : les appelants VOCAL-607 qui ne
   * collectent pas les dépenses gardent le dicté d'origine. */
  expenses?: DayExpenseLine[]
  expenseCount?: number
  expenseTotal?: number
}

/**
 * MODE-910 (§23) — une alerte de stock du jour, construite par l'APPELANT à
 * partir du stock-store (getLowStockProducts) : la lib ne lit JAMAIS un
 * store (module pur et testé). level : 'out' = épuisé (stockQty <= 0),
 * 'low' = presque épuisé (sous le seuil du produit).
 */
export interface DayStockAlert {
  name: string
  level: 'low' | 'out'
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
  /** MODE-909 (§28) — vente annulée par une opération inverse append-only.
   * Elle reste dans l'historique mais n'est PLUS comptée. */
  annulee?: boolean
  items?: Array<{ productName?: string; quantity?: number; unitPrice?: number }>
  totalAmount?: number
}

interface QueueSalePayload {
  clientId?: string
  items?: Array<{ productName?: string; quantity?: number; unitPrice?: number }>
  totalAmount?: number
}

/** MODE-909 (§28) — entrée d'annulation en file offline : cible la vente
 * (saleClientId = clientId du payload de vente) pour l'exclure du dicté
 * (vente créée PUIS annulée offline — rejeu FIFO cohérent). */
interface QueueReversalPayload {
  saleClientId?: string
}

interface ServerExpenseShape {
  amount?: number
  category?: string
  description?: string | null
}

interface QueueExpensePayload {
  amount?: number
  category?: string
  description?: string
}

/** Libellés FR des catégories enregistrées (mêmes clés que l'écran
 * Dépenses) — utilisés quand la dépense n'a pas de description. */
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  aliment: 'Aliment',
  transport: 'Transport',
  loyer: 'Loyer',
  personnel: 'Personnel',
  eau: 'Eau',
  'électricité': 'Électricité',
  'matériel': 'Matériel',
  taxe: 'Taxe',
  autre: 'Autre',
}

/** Libellé dicté d'une dépense : la description RÉELLE enregistrée fait
 * loi ; sinon le libellé FR de la catégorie enregistrée ; sinon la
 * catégorie brute. Jamais de libellé fabriqué. */
function expenseLabel(description?: string | null, category?: string): string {
  const desc = (description ?? '').trim()
  if (desc.length > 0) return desc
  const cat = (category ?? '').trim()
  if (cat.length === 0) return 'Dépense'
  return EXPENSE_CATEGORY_LABELS[cat] ?? cat
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

/** Résultat d'une collecte de ventes : lignes + compteurs, les ventes
 * annulées (MODE-909) EXCLUES du comptage et du total mais COMPÉTÉES à part
 * (cancelled) pour que Tata puisse le dire honnêtement. */
interface CollectedSales {
  lines: DaySaleLine[]
  count: number
  total: number
  cancelled: number
}

async function fetchServerTodaySales(
  merchantId: string,
  range: { startDate: string; endDate: string },
): Promise<CollectedSales> {
  const params = new URLSearchParams({ merchantId, ...range })
  // MODE-939 (AUDIT-003 PF-03) — GET /sales est borné (défaut 200) :
  // le résumé du jour demande explicitement la borne haute pour que la
  // journée d'un marché très animé reste complète (le plafond serveur
  // est 500 — au-delà, la phrase du jour dit ce qu'elle a compté).
  params.set('limit', '500')
  const res = await fetchJsonWithTimeout(
    `/api/marchand/sales?${params}`,
    undefined,
    6_000,
  )
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = (await res.json()) as { sales?: ServerSaleShape[] }
  // MODE-909 — les ventes annulées restent dans l'historique du serveur :
  // elles sont EXCLUES du dicté (jamais comptées, jamais inventées) et
  // comptées à part pour que la phrase du jour le dise.
  const all = data.sales ?? []
  const sales = all.filter((s) => !s.annulee)
  const lines = sales.flatMap((s) => linesFromItems(s.items, Math.max(0, Math.floor(s.totalAmount ?? 0))))
  return {
    lines,
    count: sales.length,
    total: sales.reduce((sum, s) => sum + Math.max(0, Math.floor(s.totalAmount ?? 0)), 0),
    cancelled: all.filter((s) => s.annulee).length,
  }
}

function queueTodaySales(entries: Array<{ entity: string; payload: unknown }>): CollectedSales {
  const saleEntries = entries.filter((e) => e.entity === 'sale')
  // MODE-909 — annulations en file : une vente de la file ciblée par une
  // 'sale-reversal' (mise en file APRÈS elle, FIFO) est créée PUIS annulée
  // offline → exclue du dicté, comptée à part.
  const reversedIds = new Set(
    entries
      .filter((e) => e.entity === 'sale-reversal')
      .map((e) => (e.payload as QueueReversalPayload | null)?.saleClientId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  const lines: DaySaleLine[] = []
  let total = 0
  let cancelled = 0
  for (const e of saleEntries) {
    const payload = e.payload as QueueSalePayload
    if (payload?.clientId && reversedIds.has(payload.clientId)) {
      cancelled += 1
      continue
    }
    const saleTotal = Math.max(0, Math.floor(payload?.totalAmount ?? 0))
    lines.push(...linesFromItems(payload?.items, saleTotal))
    total += saleTotal
  }
  return { lines, count: saleEntries.length - cancelled, total, cancelled }
}

async function fetchServerTodayExpenses(
  merchantId: string,
  range: { startDate: string; endDate: string },
): Promise<{ lines: DayExpenseLine[]; count: number; total: number }> {
  const params = new URLSearchParams({ merchantId, ...range })
  const res = await fetchJsonWithTimeout(
    `/api/marchand/expenses?${params}`,
    undefined,
    6_000,
  )
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = (await res.json()) as { expenses?: ServerExpenseShape[] }
  const rows = data.expenses ?? []
  const lines = rows.map((e) => ({
    label: expenseLabel(e.description, e.category),
    amount: Math.max(0, Math.floor(e.amount ?? 0)),
  }))
  return {
    lines,
    count: lines.length,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  }
}

function queueTodayExpenses(entries: Array<{ entity: string; payload: unknown }>): { lines: DayExpenseLine[]; count: number; total: number } {
  const expenseEntries = entries.filter((e) => e.entity === 'expense')
  const lines = expenseEntries.map((e) => {
    const payload = e.payload as QueueExpensePayload
    return {
      label: expenseLabel(payload?.description, payload?.category),
      amount: Math.max(0, Math.floor(payload?.amount ?? 0)),
    }
  })
  return {
    lines,
    count: lines.length,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  }
}

/**
 * Collecte les ventes ET les dépenses réelles du jour : serveur + file
 * offline (fusion), repli agrégats caisse si tout le reste échoue. Ne lève
 * JAMAIS — en cas d'échec total, les agrégats locaux (données réelles
 * persistées) servent de dernier recours, indépendamment pour les ventes
 * et pour les dépenses.
 */
export async function collectTodaySales(merchantId?: string | null): Promise<DaySummaryData> {
  const range = todayIsoRange()
  const [serverRes, serverExpensesRes, queueRes] = await Promise.allSettled([
    merchantId
      ? fetchServerTodaySales(merchantId, range)
      : Promise.reject(new Error('Compte non identifié')),
    merchantId
      ? fetchServerTodayExpenses(merchantId, range)
      : Promise.reject(new Error('Compte non identifié')),
    getPendingSyncEntries(),
  ])

  const entries = queueRes.status === 'fulfilled' ? queueRes.value : []
  const queueSales = queueTodaySales(entries)
  const queueExpenses = queueTodayExpenses(entries)

  // — Ventes (logique VOCAL-607 inchangée, MODE-909 : annulées exclues et
  // comptées à part) —
  let sales: DaySaleLine[]
  let saleCount: number
  let total: number
  let source: DaySummarySource
  let cancelledCount = 0
  if (serverRes.status === 'fulfilled') {
    sales = [...serverRes.value.lines, ...queueSales.lines]
    saleCount = serverRes.value.count + queueSales.count
    total = serverRes.value.total + queueSales.total
    cancelledCount = serverRes.value.cancelled + queueSales.cancelled
    source = queueSales.count > 0 ? 'server+queue' : 'server'
  } else if (queueSales.count > 0 || queueSales.cancelled > 0) {
    sales = queueSales.lines
    saleCount = queueSales.count
    total = queueSales.total
    cancelledCount = queueSales.cancelled
    source = 'queue'
  } else {
    // Dernier recours : agrégats du jour du store caisse (persistés,
    // réels). Pas de détail article disponible — le dicté le dit sans
    // inventer. MODE-909 : reverseSale décrémente déjà les agrégats — les
    // ventes annulées n'y figurent plus, cancelledCount reste 0.
    const { todaySales, todaySalesCount } = useCaisseStore.getState()
    sales = []
    saleCount = todaySalesCount
    total = todaySales
    source = 'aggregates'
  }

  // — Dépenses (VOCAL-608) : même ordre de confiance, repli INDÉPENDANT —
  // (une dépense mise en file n'a jamais atteint le serveur : pas de
  // doublon serveur + file ; l'agrégat todayExpenses compte déjà les
  // dépenses en file, donc jamais cumulé avec la file — symétrique aux
  // ventes VOCAL-607).
  let expenses: DayExpenseLine[]
  let expenseCount: number
  let expenseTotal: number
  if (serverExpensesRes.status === 'fulfilled') {
    expenses = [...serverExpensesRes.value.lines, ...queueExpenses.lines]
    expenseCount = serverExpensesRes.value.count + queueExpenses.count
    expenseTotal = serverExpensesRes.value.total + queueExpenses.total
  } else if (queueExpenses.lines.length > 0) {
    expenses = queueExpenses.lines
    expenseCount = queueExpenses.count
    expenseTotal = queueExpenses.total
  } else {
    const { todayExpenses } = useCaisseStore.getState()
    expenses = []
    expenseCount = 0
    expenseTotal = todayExpenses
  }

  return { sales, saleCount, total, source, cancelledCount, expenses, expenseCount, expenseTotal }
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

function ligneDepenseParlee(e: DayExpenseLine): string {
  return `${montantParle(e.amount)} francs pour ${e.label}`
}

/**
 * Solde de caisse dicté EN FIN de résumé (VOCAL-609) — formule demandée
 * par l'utilisateur : VENTES − DÉPENSES. Le fond de caisse n'entre PAS
 * dans ce dicté (le bouton « balance » de l'accueil reste la référence
 * caisse complète avec fond). Renvoie null quand les champs dépenses ne
 * sont pas fournis (rétrocompatibilité VOCAL-607) — jamais de solde
 * inventé. Formulation orale (VOCAL-610 puis VOCAL-611, formulation
 * choisie par l'utilisatrice ; vouvoiement VOCAL-612) : « Il vous reste
 * X francs en caisse. » — plus proche de la parole qu'un « solde »
 * administratif ; solde nul : « Il ne vous reste plus rien en caisse. » ;
 * solde négatif : « Il vous reste » n'a pas de sens en dessous de zéro,
 * l'écart est dit honnêtement (« vos dépenses dépassent vos ventes de X
 * francs ») au lieu d'un « moins X francs » que le moteur TTS lirait mal.
 */
function soldePart(data: DaySummaryData): string | null {
  if (data.expenses === undefined && data.expenseTotal === undefined) return null
  const solde = data.total - Math.max(0, Math.floor(data.expenseTotal ?? 0))
  if (solde < 0) {
    return `Attention, vos dépenses dépassent vos ventes de ${montantParle(-solde)} francs.`
  }
  if (solde === 0) return 'Il ne vous reste plus rien en caisse.'
  return `Il vous reste ${montantParle(solde)} francs en caisse.`
}

/**
 * Dicté des dépenses réelles du jour (VOCAL-608). Renvoie null quand les
 * champs dépenses ne sont pas fournis (appelants VOCAL-607 / anciens
 * tests) : le dicté reste alors strictement celui des ventes.
 *
 * Formulation orale (VOCAL-610) : la transition « Tu as AUSSI dépensé »
 * n'a de sens qu'après des ventes — une journée sans vente dicte
 * « Tu as dépensé … » (transition jamais orpheline). Total simple :
 * « Tes dépenses font X francs. » (fini « Au total, tes dépenses
 * s'élèvent à » — registre écrit et répétitif à l'oreille).
 */
function depensesPart(data: DaySummaryData, afterSales: boolean): string | null {
  if (data.expenses === undefined && data.expenseTotal === undefined) return null
  const lines = data.expenses ?? []
  const total = Math.max(0, Math.floor(data.expenseTotal ?? 0))
  if (lines.length === 0) {
    // Repli agrégats : total réel persisté, SANS détail inventé.
    return total > 0
      ? `Tes dépenses font ${montantParle(total)} francs.`
      : 'Tu n\'as enregistré aucune dépense aujourd\'hui.'
  }
  const spoken = lines.slice(0, MAX_SPOKEN_LINES).map(ligneDepenseParlee)
  const list = spoken.length === 1
    ? spoken[0]
    : `${spoken.slice(0, -1).join(', ')} et ${spoken[spoken.length - 1]}`
  const remaining = lines.length - MAX_SPOKEN_LINES
  const detail = remaining > 0 ? `${list}, et ${remaining} autres dépenses` : list
  return `Tu as ${afterSales ? 'aussi ' : ''}dépensé ${detail}. Tes dépenses font ${montantParle(total)} francs.`
}

/**
 * Dicté des ventes réelles du jour (VOCAL-607). Formulation orale
 * (VOCAL-610) : « En tout, ça fait 3 ventes pour 34 500 francs. »
 * remplace « Au total, tu as réalisé 3 ventes pour un montant de
 * 34 500 francs. » — mêmes données réelles, français parlé.
 *
 * MODE-910 (§23) : `budget` est le nombre maximal de lignes article dictées
 * (12 par défaut) — les alertes stock consomment ce budget (arbitrage
 * documenté dans buildDaySummarySpeech) ; le total reste TOUJOURS le total
 * réel complet.
 */
function ventesPart(data: DaySummaryData, budget: number = MAX_SPOKEN_LINES): string {
  if (data.saleCount <= 0 || (data.sales.length === 0 && data.total <= 0)) {
    return 'Tu n\'as encore enregistré aucune vente aujourd\'hui.'
  }

  const totalPhrase = `En tout, ça fait ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour ${montantParle(data.total)} francs.`

  // Repli agrégats : pas de détail article — dicté du total réel uniquement.
  if (data.sales.length === 0) {
    return `Aujourd'hui, tu as fait ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour ${montantParle(data.total)} francs.`
  }

  const lines = data.sales.map(ligneParlee)
  if (lines.length <= budget) {
    const list = lines.length === 1
      ? lines[0]
      : `${lines.slice(0, -1).join(', ')} et ${lines[lines.length - 1]}`
    return `Aujourd'hui, tu as vendu ${list}. ${totalPhrase}`
  }

  const spoken = lines.slice(0, budget).join(', ')
  const remaining = data.sales.length - budget
  return `Aujourd'hui, tu as vendu ${spoken}, et ${remaining} autres ventes. ${totalPhrase}`
}

/**
 * MODE-909 (§28) — phrase des ventes annulées du jour : « 1 vente annulée
 * non comptée. » / « N ventes annulées non comptées. » — renvoie null quand
 * aucune annulation (dicté STRICTEMENT inchangé, non-régression testée).
 */
function ventesAnnuleesPart(cancelledCount: number | undefined): string | null {
  const n = Math.max(0, Math.floor(cancelledCount ?? 0))
  if (n <= 0) return null
  return `${montantParle(n)} vente${n > 1 ? 's' : ''} annulée${n > 1 ? 's' : ''} non comptée${n > 1 ? 's' : ''}.`
}

/**
 * MODE-910 (§23) — phrases d'alerte stock du résumé (pur : les alertes
 * sont fournies par l'appelant, jamais lues dans un store).
 *
 * Épuisés D'ABORD, une seule ligne par catégorie (épuisé / presque
 * épuisé) : un produit épuisé — « Attention : tomates est épuisé. » —,
 * plusieurs — « Attention : 2 produits sont épuisés : tomates et huile. »
 * (compte réel, liste max 3 avec « et » final) ; presque épuisés —
 * « Attention : 1 produit est presque épuisé : riz. » / « Attention : 3
 * produits sont presque épuisés : savon, sucre et sel. ». Renvoie null
 * sans alerte exploitable : le dicté reste STRICTEMENT inchangé.
 */
function cleanAlertNames(alerts: DayStockAlert[], level: DayStockAlert['level']): string[] {
  return alerts
    .filter((a) => a.level === level)
    .map((a) => (a.name ?? '').trim())
    .filter(Boolean)
}

/** Liste FR : max 3 noms, « et » final. */
function listeAlerteNoms(names: string[]): string {
  const kept = names.slice(0, 3)
  if (kept.length === 1) return kept[0]
  return `${kept.slice(0, -1).join(', ')} et ${kept[kept.length - 1]}`
}

export function stockAlertsPart(alerts: DayStockAlert[] | undefined): string | null {
  if (!alerts || alerts.length === 0) return null
  const out = cleanAlertNames(alerts, 'out')
  const low = cleanAlertNames(alerts, 'low')
  const parts: string[] = []
  if (out.length === 1) {
    parts.push(`Attention : ${out[0]} est épuisé.`)
  } else if (out.length > 1) {
    parts.push(`Attention : ${out.length} produits sont épuisés : ${listeAlerteNoms(out)}.`)
  }
  if (low.length === 1) {
    parts.push(`Attention : 1 produit est presque épuisé : ${listeAlerteNoms(low)}.`)
  } else if (low.length > 1) {
    parts.push(`Attention : ${low.length} produits sont presque épuisés : ${listeAlerteNoms(low)}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** Nombre de lignes stock dictées (≤ 2, une par catégorie) — sert à
 * réduire le budget du détail VENTES (limite globale respectée). */
function stockAlertLineCount(alerts: DayStockAlert[] | undefined): number {
  if (!alerts || alerts.length === 0) return 0
  return (cleanAlertNames(alerts, 'out').length > 0 ? 1 : 0)
    + (cleanAlertNames(alerts, 'low').length > 0 ? 1 : 0)
}

/**
 * Construit le texte dicté du résumé du jour — PUR et testé.
 *
 * Attendu terrain (VOCAL-607 ventes + VOCAL-608 dépenses + VOCAL-609 solde,
 * formulation orale VOCAL-610) :
 *  « Aujourd'hui, tu as vendu 3 sacs de riz à 25 000 francs, 5 bouteilles
 *   d'huile à 1 500 francs et 2 cartons de tomate à 8 000 francs. En tout,
 *   ça fait 3 ventes pour 34 500 francs. Tu as aussi dépensé 1 000 francs
 *   pour Transport et 500 francs pour Aliment. Tes dépenses font 1 500
 *   francs. Il te reste 33 000 francs en caisse. »
 *  Aucune vente : « Tu n'as encore enregistré aucune vente aujourd'hui. »
 *  (ou « …aucune vente ni dépense aujourd'hui. » quand les dépenses ont
 *  été consultées et sont vides elles aussi) — PAS de solde dicté sur un
 *  jour totalement vide.
 *
 * MODE-910 (§23) — `stockAlerts` (construit par l'appelant via
 * getLowStockProducts du stock-store) ajoute en FIN de dicté les alertes de
 * stock réelles : épuisés d'abord, puis presque épuisés (une ligne max par
 * catégorie — stockAlertsPart). ARBITRAGE DOCUMENTÉ : la limite globale de
 * 12 lignes dictées du détail reste respectée — les lignes stock (≤ 2) sont
 * PRIORITAIRES (sécurité du commerce) et consomment le budget du détail
 * VENTES (les dernières lignes optionnelles de la liste, couvertes par le
 * total réel « et N autres ventes ») ; le détail des DÉPENSES (plus court
 * et plus instructif) et les totaux ne sont JAMAIS amputés. Sans alertes
 * (paramètre absent, vide ou noms vides) : dicté STRICTEMENT inchangé.
 */
export function buildDaySummarySpeech(data: DaySummaryData, stockAlerts?: DayStockAlert[]): string {
  const salesEmpty = data.saleCount <= 0 || (data.sales.length === 0 && data.total <= 0)
  // La transition « Tu as aussi dépensé » n'a de sens qu'après des ventes
  // (VOCAL-610) : sans vente, Tata dit « Tu as dépensé … » sans « aussi ».
  const depenses = depensesPart(data, !salesEmpty)
  const solde = soldePart(data)
  const hasExpenses = (data.expenses?.length ?? 0) > 0 || (data.expenseTotal ?? 0) > 0
  // MODE-909 (§28) — les ventes annulées sont exclues du comptage : Tata
  // le dit (phrase insérée après la partie ventes, avant les dépenses).
  const annulees = ventesAnnuleesPart(data.cancelledCount)
  // MODE-910 (§23) — alertes stock réelles (fournies par l'appelant) + le
  // budget du détail VENTES réduit d'autant (arbitrage ci-dessus).
  const stock = stockAlertsPart(stockAlerts)
  const budget = Math.max(1, MAX_SPOKEN_LINES - stockAlertLineCount(stockAlerts))

  // Rien vendu et rien dépensé (champs dépenses fournis) : bilan vide
  // honnête couvrant les deux — le solde « 0 francs » serait du bruit.
  // Les alertes stock restent dites (données réelles du stock du jour).
  if (salesEmpty && !hasExpenses) {
    if (depenses === null) {
      const base = annulees
        ? `Tu n\'as encore enregistré aucune vente aujourd\'hui. ${annulees}`
        : 'Tu n\'as encore enregistré aucune vente aujourd\'hui.'
      return stock ? `${base} ${stock}` : base
    }
    const base = annulees
      ? `Tu n\'as encore enregistré aucune vente ni dépense aujourd\'hui. ${annulees}`
      : 'Tu n\'as encore enregistré aucune vente ni dépense aujourd\'hui.'
    return stock ? `${base} ${stock}` : base
  }

  // Rien vendu mais des dépenses réelles : le dicté le dit franchement
  // puis enchaîne sur les dépenses — jamais une vente de consolation.
  if (salesEmpty) {
    const parts = ['Tu n\'as encore enregistré aucune vente aujourd\'hui.']
    if (annulees) parts.push(annulees)
    if (depenses) parts.push(depenses)
    if (solde) parts.push(solde)
    if (stock) parts.push(stock)
    return parts.join(' ')
  }

  const parts = [ventesPart(data, budget)]
  if (annulees) parts.push(annulees)
  if (depenses) parts.push(depenses)
  if (solde) parts.push(solde)
  if (stock) parts.push(stock)
  return parts.join(' ')
}
