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
  /** Dépenses réelles du jour (VOCAL-608) — même ordre de confiance que
   * les ventes. Champs optionnels : les appelants VOCAL-607 qui ne
   * collectent pas les dépenses gardent le dicté d'origine. */
  expenses?: DayExpenseLine[]
  expenseCount?: number
  expenseTotal?: number
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

  // — Ventes (logique VOCAL-607 inchangée) —
  let sales: DaySaleLine[]
  let saleCount: number
  let total: number
  let source: DaySummarySource
  if (serverRes.status === 'fulfilled') {
    sales = [...serverRes.value.lines, ...queueSales.lines]
    saleCount = serverRes.value.count + queueSales.count
    total = serverRes.value.total + queueSales.total
    source = queueSales.count > 0 ? 'server+queue' : 'server'
  } else if (queueSales.count > 0) {
    sales = queueSales.lines
    saleCount = queueSales.count
    total = queueSales.total
    source = 'queue'
  } else {
    // Dernier recours : agrégats du jour du store caisse (persistés,
    // réels). Pas de détail article disponible — le dicté le dit sans
    // inventer.
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

  return { sales, saleCount, total, source, expenses, expenseCount, expenseTotal }
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
 */
function ventesPart(data: DaySummaryData): string {
  if (data.saleCount <= 0 || (data.sales.length === 0 && data.total <= 0)) {
    return 'Tu n\'as encore enregistré aucune vente aujourd\'hui.'
  }

  const totalPhrase = `En tout, ça fait ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour ${montantParle(data.total)} francs.`

  // Repli agrégats : pas de détail article — dicté du total réel uniquement.
  if (data.sales.length === 0) {
    return `Aujourd'hui, tu as fait ${data.saleCount} vente${data.saleCount > 1 ? 's' : ''} pour ${montantParle(data.total)} francs.`
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
 */
export function buildDaySummarySpeech(data: DaySummaryData): string {
  const salesEmpty = data.saleCount <= 0 || (data.sales.length === 0 && data.total <= 0)
  // La transition « Tu as aussi dépensé » n'a de sens qu'après des ventes
  // (VOCAL-610) : sans vente, Tata dit « Tu as dépensé … » sans « aussi ».
  const depenses = depensesPart(data, !salesEmpty)
  const solde = soldePart(data)
  const hasExpenses = (data.expenses?.length ?? 0) > 0 || (data.expenseTotal ?? 0) > 0

  // Rien vendu et rien dépensé (champs dépenses fournis) : bilan vide
  // honnête couvrant les deux — le solde « 0 francs » serait du bruit.
  if (salesEmpty && !hasExpenses) {
    return depenses === null
      ? 'Tu n\'as encore enregistré aucune vente aujourd\'hui.'
      : 'Tu n\'as encore enregistré aucune vente ni dépense aujourd\'hui.'
  }

  // Rien vendu mais des dépenses réelles : le dicté le dit franchement
  // puis enchaîne sur les dépenses — jamais une vente de consolation.
  if (salesEmpty) {
    const parts = ['Tu n\'as encore enregistré aucune vente aujourd\'hui.']
    if (depenses) parts.push(depenses)
    if (solde) parts.push(solde)
    return parts.join(' ')
  }

  const parts = [ventesPart(data)]
  if (depenses) parts.push(depenses)
  if (solde) parts.push(solde)
  return parts.join(' ')
}
