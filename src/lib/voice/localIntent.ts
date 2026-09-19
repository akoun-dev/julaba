// Jùlaba Voice Intent Parser - Terrain Language Support
// Supports français de marché, nouchi léger, oral abbreviations

import { findCatalogEntry, catalogSummaryText } from '../supplier-catalog'
import { STOCK_UNITS, resolveUnitCode, unitLabel, formatQuantity } from '@/lib/stock/units'
import { CONFIRM_ASK, formatMontantParle } from './tata-phrases'

export type IntentType =
  | 'sale'
  | 'expense'
  | 'restock'
  | 'order'
  | 'stock_check'
  | 'stock_loss'
  | 'stock_adjust'
  | 'stock_production'
  | 'margin_check'
  | 'purchase'
  | 'navigation'
  | 'back'
  | 'consultation'
  | 'credit_block'
  | 'auth_name'
  | 'auth_pin'
  | 'yes'
  | 'no'
  | 'cancel'
  | 'end'
  | 'unknown'

/**
 * Formule de fin de conversation (VOCAL-607) : Tata ne dit JAMAIS
 * « bonne journée » après une action réussie (vente, dépense, consultation…)
 * — la marchande peut enchaîner. Cette phrase n'est prononcée que lorsque
 * l'intent 'end' (ou une sortie explicite non/stop) clôt l'échange.
 */
export const TATA_GOODBYE = "D'accord, à bientôt et bonne journée !"

/**
 * Phrases de fin de conversation explicite (VOCAL-607). Détectées AVANT le
 * regex cancel : « plus rien » y figurait et Tata répondait « j'ai tout
 * annulé » alors que la marchande annonce qu'elle a terminé l'échange.
 * Testé sur la phrase ENTIRE (pas ancré) : « au revoir Tata » matche.
 */
const END_CONVERSATION_RE =
  /(c['’]est tout|j['’]ai fini|j['’]ai termin|au revoir|plus rien|bon pour aujourd['’]hui|fini pour aujourd['’]hui|[àa] demain|bonne soir[eé]e|j['’]arr[eê]te)/i

export interface ParsedIntent {
  type: IntentType
  confidence: number
  product?: string
  amount?: number
  quantity?: number
  /** Code canonique de l'unité orale (STK-807 : « 2 sacs » → 'sac',
   * « 1,5 kilo » → 'kg') — résolu via le catalogue units.ts. */
  unit?: string
  unitPrice?: number
  category?: string
  description?: string
  targetRoute?: string
  supplier?: string
  rawTranscript: string
  responseText: string
}

// Products vocabulary (25+ marché products)
const PRODUCT_VOCAB: Record<string, string[]> = {
  'tomates': ['tomate', 'tomates', 'tom'],
  'oignons': ['oignon', 'oignons', 'ognon', 'ognons'],
  'piments': ['piment', 'piments', 'pèment'],
  'aubergines': ['aubergine', 'aubergines', 'brin d\'aubergine'],
  'gombos': ['gombo', 'gombos'],
  'bananes': ['banane', 'bananes', 'plantain', 'plantains'],
  'ignames': ['igname', 'ignames'],
  'manioc': ['manioc', 'couscous'],
  'riz': ['riz'],
  'maïs': ['maïs', 'mais', 'blé'],
  'arachides': ['arachide', 'arachides', 'cacahuète', 'cachuetes', 'poix de terre'],
  'huile': ['huile', 'huile palme', 'huile de palme', 'huile végétale'],
  'sel': ['sel'],
  'poisson': ['poisson', 'poisson fumé', 'poisson sec', 'tilapia', 'maquereau'],
  'viande': ['viande', 'poulet', 'bœuf', 'boeuf', 'chèvre', 'mouton', 'porc'],
  'œufs': ['œuf', 'oeuf', 'œufs', 'oeufs'],
  'lait': ['lait', 'lait caillé', 'yaourt'],
  'avocats': ['avocat', 'avocats'],
  'oranges': ['orange', 'oranges', 'citron', 'citrons'],
  'mangues': ['mangue', 'mangues'],
  'ananas': ['ananas'],
  'papayes': ['papaye', 'papayes'],
  'carottes': ['carotte', 'carottes'],
  'concombres': ['concombre', 'concombres'],
  'salade': ['salade', 'laitue'],
  'ail': ['ail'],
  'gingembre': ['gingembre', 'gigembre'],
  'pomme de terre': ['pomme de terre', 'patate', 'patates'],
}

// Number word mapping (French)
const NUMBER_WORDS: Record<string, number> = {
  'zéro': 0, 'zero': 0,
  'un': 1, 'une': 1,
  'deux': 2, 'trois': 3, 'quatre': 4,
  'cinq': 5, 'six': 6, 'sept': 7,
  'huit': 8, 'neuf': 9,
  'dix': 10, 'onze': 11, 'douze': 12,
  'treize': 13, 'quatorze': 14, 'quinze': 15,
  'seize': 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
  'vingt': 20, 'trente': 30, 'quarante': 40,
  'cinquante': 50, 'soixante': 60, 'cent': 100,
  'mille': 1000, 'million': 1000000,
}

// Amount abbreviations common in marché French — OBSOLÈTE et supprimé
// (audit VOCAL-605, code mort : jamais référencé).

// Navigation keywords. Values are bare ScreenRoute literals (app-store.ts) —
// no leading slash. navigate() sets currentScreen directly, it doesn't
// parse a URL path.
const NAV_KEYWORDS: Record<string, string> = {
  // --- Stock ---
  'stock': 'stock',
  'stok': 'stock',
  'mes produits': 'stock',
  'mesproduit': 'stock',
  'korè': 'stock',

  // --- Dépenses ---
  'mes dépenses': 'depenses',
  'dépenses': 'depenses',
  'depenses': 'depenses',
  'mesregister': 'depenses',
  'mes regist': 'depenses',
  'mes registres': 'depenses',
  'le cahier': 'depenses',
  'cahier': 'depenses',
  'kaïe': 'depenses',
  'kaie': 'depenses',
  'kaé': 'depenses',

  // --- Ventes ---
  'mes ventes': 'ventes',
  'ventes': 'ventes',
  'ventes passées': 'ventes',
  'van': 'ventes',
  'vante': 'ventes',
  'vant': 'ventes',
  'mesvan': 'ventes',
  'pralé van': 'ventes',
  'prale van': 'ventes',

  // --- Keiwa (portefeuille) ---
  'mon argent': 'keiwa',
  'lajan': 'keiwa',
  "l'argent": 'keiwa',
  'mon kont': 'keiwa',
  'mon compte': 'keiwa',
  'keiwa': 'keiwa',

  // --- Caisse ---
  'ma caisse': 'caisse',
  'caisse': 'caisse',
  'cais': 'caisse',
  'ouvre ma journée': 'caisse',
  'ouvre ma journé': 'caisse',
  'ferme ma journée': 'caisse',
  'ferme ma journé': 'caisse',
  'ouvrila': 'caisse',
  'fermela': 'caisse',

  // --- Marché ---
  'marché': 'marche',
  'marche': 'marche',
  'marcha': 'marche',

  // --- Tontines ---
  'tontines': 'tontines',
  'ton tin': 'tontines',
  'tantin': 'tontines',

  // --- Profil ---
  'profil': 'profil',
  // Settings and support both live inside the profile screen now (no
  // standalone 'parametres'/'support' route).
  'paramètres': 'profil',
  'parametres': 'profil',
  'support': 'profil',
  'sapò': 'profil',
  'sapo': 'profil',

  // --- Académie ---
  'academy': 'academy',
  'académie': 'academy',
  'akadémi': 'academy',
  'akademi': 'academy',
  'prodiksyon': 'academy',
  'prodiksiyon': 'academy',

  // --- Accueil ---
  'accueil': 'home',
  'akèy': 'home',
  'akey': 'home',

  // --- Commandes ---
  'commandes': 'commandes',
  'komand': 'commandes',
  'kòmand': 'commandes',
  'mes commandes': 'commandes',
  'meskomand': 'commandes',

  // --- Protection sociale ---
  'protection sociale': 'protection-sociale',
  'proteksyon': 'protection-sociale',
  'proteksyon sosyal': 'protection-sociale',

  // --- Fidélité ---
  'fidélité': 'fidelite',
  'fidelite': 'fidelite',
  'fidelita': 'fidelite',
}

// Expense categories
const EXPENSE_CATEGORIES = ['aliment', 'transport', 'loyer', 'personnel', 'eau', 'électricité', 'matériel', 'taxe', 'autre']

// Expense keywords
const EXPENSE_KEYWORDS = ['dépensé', 'depense', 'dépense', 'acheté', 'acheter', 'payé', 'payer', 'donné', 'déboursé', 'crédit fournisseur']

// Restock keywords
const RESTOCK_KEYWORDS = ['reçu', 'recevoir', 'réappro', 'réapprovisionner', 'approvisionné', 'livré', 'livraison', 'stock reçu']

// Consultation keywords
const CONSULTATION_KEYWORDS = ['combien', 'total', 'résumé', 'bilan', 'chiffre d\'affaire', 'combien j\'ai vendu', 'combien j\'ai gagné']

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

// Déclencheurs stock (STK-807) — garde anti-préfixe (?![a-zà-öø-ÿ]) au
// lieu de \b : JS \b considère « tomatesé » comme une frontière de mot
// et capterait des mots collés oraux (« perdues » via « perdu » est OK
// — même famille — mais « ajouterait » ne doit pas être un ajustement).

const BARE_NUMBER_RE = /(\d+(?:[.,]\d+)?|zéro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante)/i

const STOCK_LOSS_RE =
  /(?:j['’]ai\s+)?(?:perdu(?:e)?s?|g[aâ]t[eé]s?(?:e)?s?|ab[iî]m[eé]s?(?:e)?s?|cass[eé]s?(?:e)?s?|pourri(?:e)?s?|vol[eé]s?(?:e)?s?|jet[eé]s?(?:e)?s?)(?![a-zà-öø-ÿ])/i

const STOCK_ADJUST_RE = /(?:ajout(?:e|er|ez|ons)|enl[eè]v(?:e|er|ez)?|retir(?:e|er|ez))(?![a-zà-öø-ÿ])/i

const PURCHASE_RE = /(?:j['’]ai\s+)?(?:achet[eé]s?(?:e)?s?|acheter|achetez|achats?)(?![a-zà-öø-ÿ])/i

/** Production propre du marchand (STK-809, §2.7) : œufs, attiéké,
 * transformation… « j'ai produit 50 oeufs », « production de 20 kilos ».
 * Mouvement PRODUCTION (entrée, PAS un achat fournisseur). */
const STOCK_PRODUCTION_RE = /(?:j['’]ai\s+)?(?:produit|production|fabriqu[eé]s?)(?![a-zà-öø-ÿ])/i

/** Consultation de marge (STK-810, §29-§30) : « marge du riz ? », « combien
 * je gagne sur les tomates ? », « bénéfice d'oignons ». Exige un produit. */
const MARGIN_CHECK_RE = /(?:marge|b[ée]n[ée]fic[eé]s?|combien (?:je|tu) gagne|je gagne combien)/i

/** Consultation de stock : « il reste combien de tomates ? », « combien de
 * tomates il me reste ? », « stock de tomates », « combien j'ai de riz ».
 * JAMAIS « ouvre mon stock » (pas de produit → navigation) ni « combien
 * pour X ? » (prix → vente/clarification) : « combien » doit être suivi
 * de « de / d' / j'ai » — jamais nu. */
const STOCK_CHECK_RE =
  /(?:il\s+(?:me\s+|m['’]e?\s+)?rest(?:e|ent)|combien\s+(?:de\s|d['’]|j['’]ai\s)|stock\s+(?:de\s|d['’]|actuel))/i

/**
 * Parse voice PIN (exactly 4 digits)
 */
export function parseVoicePin(transcription: string): number[] | null {
  const mapping: Record<string, number> = {
    'zéro': 0, 'zero': 0, 'un': 1, 'une': 1,
    'deux': 2, 'trois': 3, 'quatre': 4,
    'cinq': 5, 'six': 6, 'sept': 7,
    'huit': 8, 'neuf': 9
  }
  
  const chiffres: number[] = []
  const words = transcription.toLowerCase().split(/\s+/)
  
  for (const word of words) {
    if (mapping[word] !== undefined) {
      chiffres.push(mapping[word])
    }
    const num = parseInt(word)
    if (!isNaN(num) && num >= 0 && num <= 9) chiffres.push(num)
  }
  
  return chiffres.length === 4 ? chiffres : null
}

/**
 * Main intent parser - analyzes voice transcript and returns structured intent
 */
export function parseIntent(transcript: string): ParsedIntent {
  const lower = transcript.toLowerCase().trim()
  
  // Check for yes/no/cancel first
  if (/^(oui|c\'?est (?:ça|ca)|exact|c\'?est bon|oui c\'?est ça|d\'?accord|affirmatif)$/i.test(lower)) {
    return {
      type: 'yes',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: ''
    }
  }
  
  if (/^(non|non c\'?est pas|annule|n\'?annule pas|faux|pas ça|cancel)$/i.test(lower)) {
    return {
      type: 'no',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: 'D\'accord, j\'annule.'
    }
  }

  // ── Intents stock (STK-807, §2.7) — AVANT le détecteur de fin ──────────
  // « Il me reste plus rien de tomates » contient « plus rien » (fin de
  // conversation) : les intentions stock DOIVENT passer avant, sinon Tata
  // dit au revoir au lieu de répondre. Ordre : actions (perte, ajustement,
  // achat) > consultation (stock_check).
  const stockProduct = extractProduct(lower)
  const stockQtyUnit = extractQuantityWithUnit(lower)

  // Perte (§41) : « j'ai perdu 5 kilos de tomates », « tomates gâtées »,
  // « 3 sacs abîmés », « volés »… JAMAIS une vente ni une dépense.
  if (STOCK_LOSS_RE.test(lower) && (stockProduct || stockQtyUnit)) {
    return {
      type: 'stock_loss',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit?.quantity,
      unit: stockQtyUnit?.unit || undefined,
      rawTranscript: transcript,
      responseText: !stockQtyUnit
        ? `Qu'avez-vous perdu, et combien ?`
        : stockProduct
          ? `Perte de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ${stockProduct}, c'est bien ça ?`
          : `Perte de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''}, c'est bien ça ?`
    }
  }

  // Ajustement manuel : « ajoute 20 kilos de riz », « enlève 3 sachets ».
  // (Le « reçu / réappro / livré » reste au restock historique.)
  if (STOCK_ADJUST_RE.test(lower) && stockQtyUnit) {
    const direction = /(?:enl[eè]v|retir)/i.test(lower) ? -1 : 1
    const qtyParle = `${stockQtyUnit.quantity} ${stockQtyUnit.unit ? unitLabel(stockQtyUnit.unit, stockQtyUnit.quantity) : ''}`.trim()
    return {
      type: 'stock_adjust',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit.quantity,
      unit: stockQtyUnit.unit || undefined,
      rawTranscript: transcript,
      responseText: stockProduct
        ? `${direction < 0 ? 'Retrait' : 'Ajout'} ${stockProduct} : ${qtyParle}, c'est bien ça ?`
        : `${direction < 0 ? 'Retrait' : 'Ajout'} de ${qtyParle}, sur quel produit ?`
    }
  }

  // Achat de marchandises (§10/§30) : « j'ai acheté 2 sacs d'oignons à
  // 12 000 le sac », « acheté du riz 500 ». CAPTE le « acheté » AVANT
  // l'expense : « acheté du riz » est un ACHAT de stock (« riz » est un
  // produit), « dépensé 2000 transport » reste une dépense (pas un produit).
  if (PURCHASE_RE.test(lower) && stockProduct) {
    const priceMatch = lower.match(/à\s*(\d[\d\s]*)\s*(?:francs?|fcfa|f)?\s*(?:le\s+\w+|l['’]\w+)?(?:$|\s)/i)
    const tailAmount = lower.match(/(?:^|\s)(\d{3,7})\s*(?:francs?|fcfa|f)?\s*$/i)
    const unitPrice = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : undefined
    const total = tailAmount ? parseInt(tailAmount[1]) : unitPrice && stockQtyUnit ? Math.round(unitPrice * stockQtyUnit.quantity) : unitPrice
    return {
      type: 'purchase',
      confidence: 0.9,
      product: stockProduct,
      quantity: stockQtyUnit?.quantity,
      unit: stockQtyUnit?.unit || undefined,
      amount: total,
      unitPrice,
      rawTranscript: transcript,
      responseText: `Achat de ${stockQtyUnit ? `${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ` : ''}${stockProduct}${total ? ` pour ${formatFCFA(total)}` : ''}, c'est bien ça ?`
    }
  }

  // Production propre (STK-809) : « j'ai produit 50 oeufs » — entrée
  // PRODUCTION, avant l'arbitrage achat (produire ≠ acheter).
  if (STOCK_PRODUCTION_RE.test(lower) && stockQtyUnit) {
    return {
      type: 'stock_production',
      confidence: 0.9,
      product: stockProduct || undefined,
      quantity: stockQtyUnit.quantity,
      unit: stockQtyUnit.unit || undefined,
      rawTranscript: transcript,
      responseText: stockProduct
        ? `Production de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''} ${stockProduct}, c'est bien ça ?`
        : `Production de ${stockQtyUnit.quantity}${stockQtyUnit.unit ? ` ${stockQtyUnit.unit}` : ''}, sur quel produit ?`
    }
  }

  // Consultation de stock (§38) : « il reste combien de tomates ? », «
  // combien de sacs d'oignons il me reste ? », « stock de riz ».
  // Exige un produit : « ouvre mon stock » reste une navigation.
  if (STOCK_CHECK_RE.test(lower) && stockProduct) {
    return {
      type: 'stock_check',
      confidence: 0.85,
      product: stockProduct,
      rawTranscript: transcript,
      responseText: `Je regarde ton stock de ${stockProduct}...`
    }
  }

  // Consultation de marge (STK-810) : coût réel (achats) vs prix dicté
  // ou enregistré — marge inconnue = « je ne sais pas », perte dite telle
  // quelle. Après stock_check (arbitrage actions>consultation, « marge »
  // ne doit jamais retomber dans « combien de »).
  if (MARGIN_CHECK_RE.test(lower) && stockProduct) {
    return {
      type: 'margin_check',
      confidence: 0.85,
      product: stockProduct,
      rawTranscript: transcript,
      responseText: `Je calcule ta marge sur ${stockProduct}...`
    }
  }

  // Fin de conversation explicite (VOCAL-607) — AVANT le cancel :
  // « plus rien » / « c'est tout » clôturent l'échange avec le goodbye,
  // ils ne sont plus des annulations génériques.
  if (END_CONVERSATION_RE.test(lower)) {
    return {
      type: 'end',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: TATA_GOODBYE
    }
  }
  
  if (/(?:annule tout|stop|arrête|ferme)/i.test(lower)) {
    return {
      type: 'cancel',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: 'D\'accord, j\'ai tout annulé.'
    }
  }
  
  // Check for credit (blocked)
  if (/(?:crédit|credit|à crédit|a credit)/i.test(lower) && !/(?:reçu|reception|reception)/i.test(lower)) {
    return {
      type: 'credit_block',
      confidence: 0.9,
      rawTranscript: transcript,
      responseText: 'Le crédit n\'est pas encore activé. Vous pouvez seulement vendre en espèces.'
    }
  }
  
  // Check back (go to previous screen)
  if (/^(?:retour|rétour|revenir|reveni|pralé en arrière|va en arrière)$/i.test(lower)) {
    return {
      type: 'back',
      confidence: 0.95,
      rawTranscript: transcript,
      responseText: 'Retour à l\'écran précédent.'
    }
  }

  // Check supplier order ("commander") — MUST run before the navigation
  // keywords because "commandes" is also a screen name. Rules:
  //   • verb + produit/quantité reconnus  → intention 'order' complète
  //   • "commander"/"commandez" seul      → question de clarification
  //   • "mes commandes" / "commandes" (nom) → tombe jusqu'à la navigation
  if (/command(?:er|ez|ons|e)\b/i.test(lower)) {
    const catalogEntry = findCatalogEntry(lower)
    const qty = extractQuantity(lower)
    if (catalogEntry) {
      const q = qty || 1
      return {
        type: 'order',
        confidence: 0.9,
        product: catalogEntry.name,
        supplier: catalogEntry.supplier,
        quantity: q,
        rawTranscript: transcript,
        responseText: `Commande de ${q} × ${catalogEntry.name} chez ${catalogEntry.supplier}, c'est bien ça ?`
      }
    }
    const spokenProduct = extractProduct(lower)
    if (spokenProduct || qty) {
      return {
        type: 'order',
        confidence: 0.75,
        product: spokenProduct || undefined,
        quantity: qty || undefined,
        rawTranscript: transcript,
        responseText: `Je ne trouve pas « ${spokenProduct ?? 'ce produit'} » au marché. Produits disponibles : ${catalogSummaryText()}.`
      }
    }
    if (/command(?:er|ez)\b/i.test(lower)) {
      return {
        type: 'order',
        confidence: 0.7,
        rawTranscript: transcript,
        responseText: 'Que voulez-vous commander ? Dites par exemple « commander deux sacs de riz ».'
      }
    }
    // "commande"/"commandons" sans produit ni quantité : ce n'est probablement
    // pas une commande fournisseur — laisser le reste du parseur décider
    // (ex. « mes commandes » navigue vers l'écran Commandes).
  }

  // Check navigation
  for (const [keyword, route] of Object.entries(NAV_KEYWORDS)) {
    if (lower.includes(keyword)) {
      const navPhrases: Record<string, string> = {
        'stock': 'J\'ouvre ton stock.',
        'depenses': 'J\'ouvre tes dépenses.',
        'ventes': 'J\'ouvre tes ventes passées.',
        'keiwa': 'J\'ouvre ton portefeuille Keiwa.',
        'caisse': 'J\'ouvre ta caisse.',
        'marche': 'J\'ouvre le marché.',
        'tontines': 'J\'ouvre tes tontines.',
        'home': 'Retour à l\'accueil.',
        'commandes': 'J\'ouvre tes commandes.',
        'profil': 'J\'ouvre ton profil.',
        'academy': 'J\'ouvre l\'académie.',
        'fidelite': 'J\'ouvre ta fidélité.',
        'protection-sociale': 'J\'ouvre la protection sociale.',
      }
      return {
        type: 'navigation',
        confidence: 0.85,
        targetRoute: route,
        rawTranscript: transcript,
        responseText: navPhrases[route] || `J'ouvre ${keyword}.`
      }
    }
  }
  
  // Check consultation
  for (const kw of CONSULTATION_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        type: 'consultation',
        confidence: 0.85,
        rawTranscript: transcript,
        responseText: 'Consultation en cours...'
      }
    }
  }
  
  // Check restock
  for (const kw of RESTOCK_KEYWORDS) {
    if (lower.includes(kw)) {
      const product = extractProduct(lower)
      const qty = extractQuantity(lower)
      if (product || qty) {
        return {
          type: 'restock',
          confidence: 0.85,
          product: product || undefined,
          quantity: qty || undefined,
          rawTranscript: transcript,
          responseText: product
            ? `Stock reçu : ${qty || 'nouveau stock'} ${product}, c'est bien ça ?`
            : 'Stock reçu, c\'est bien ça ?'
        }
      }
    }
  }
  
  // Check expense
  for (const kw of EXPENSE_KEYWORDS) {
    if (lower.includes(kw)) {
      const amount = extractAmount(lower)
      const product = extractProduct(lower)
      let category = 'autre'
      for (const cat of EXPENSE_CATEGORIES) {
        if (lower.includes(cat)) { category = cat; break }
      }
      if (amount) {
        return {
          type: 'expense',
          confidence: 0.85,
          amount,
          product: product || undefined,
          category,
          rawTranscript: transcript,
          responseText: product
            ? `Dépense de ${formatFCFA(amount)} pour ${product}, c'est bien ça ?`
            : `Dépense de ${formatFCFA(amount)}, c'est bien ça ?`
        }
      }
    }
  }
  
  // Check for sale (default intent when amount + product found)
  const product = extractProduct(lower)
  let amount = extractAmount(lower)
  let quantity = extractQuantity(lower)

  // "J'ai vendu X à Y francs" format (VOCAL-603 — deux lectures) :
  //  • « à Y francs / Y FCFA / Yf » → le TOTAL est explicité, il fait foi
  //    (« vendu 5 kilos de tomates à 2000 francs » = 2000) ;
  //  • « à Y » NU → prix UNITAIRE : total = quantité × prix unitaire
  //    (« j'ai vendu 3 tomates à 500 » = 1500, pas 500 — l'extracteur de
  //    montant prenait le dernier nombre comme total). La quantité vient
  //    du X de « X à Y » quand aucun mot d'unité (« sacs », « kilos »…)
  //    n'a été reconnu devant.
  const atPriceMatch = lower.match(/(\d+)\s*(?:[\w'-]+\s+){0,2}?à\s*(\d+)\s*(francs?|fcfa|f)?\b/i)
  let unitPrice: number | undefined
  if (atPriceMatch) {
    unitPrice = parseInt(atPriceMatch[2])
    const atQty = parseInt(atPriceMatch[1])
    if (!atPriceMatch[3] && unitPrice > 0 && atQty > 0 && atQty <= 999) {
      amount = atQty * unitPrice
      if (!quantity) quantity = atQty
    }
  }
  
  if (amount && amount > 0 && product) {
    const saleAmount = amount
    const displayProduct = product
    // VOCAL-612 — confirmation principale PARLÉE : « Je vais enregistrer la
    // vente de 5 kilos de tomates pour 2 000 francs. Dites oui pour
    // confirmer ou non pour annuler. » L'unité naturelle vient du transcript
    // (extractQuantityWithUnit) ; le parenthésé technique « (2 unités à
    // 1 000 F) » disparaît (illisible à l'oral). Garde : une quantité égale
    // au montant (« tomates 5000f ») n'est PAS une quantité de marchandise.
    // CONFIRM_ASK est intégrée : cette phrase n'est prononcée que lorsque
    // la confirmation est demandée (shouldConfirm dans voice-modal).
    const qtyUnit = extractQuantityWithUnit(lower)
    const qtyPart = qtyUnit && qtyUnit.quantity !== saleAmount
      ? qtyUnit.unit
        ? `${formatQuantity(qtyUnit.quantity)} ${unitLabel(qtyUnit.unit, qtyUnit.quantity)} de `
        : `${formatQuantity(qtyUnit.quantity)} `
      : ''
    return {
      type: 'sale',
      confidence: 0.85,
      product: product || undefined,
      amount: saleAmount,
      quantity: quantity || undefined,
      unitPrice,
      rawTranscript: transcript,
      responseText: `Je vais enregistrer la vente de ${qtyPart}${displayProduct} pour ${formatMontantParle(saleAmount)} francs. ${CONFIRM_ASK}`
    }
  }

  // Product without amount: ask for price
  if (product && !amount) {
    return {
      type: 'unknown',
      confidence: 0.5,
      product,
      rawTranscript: transcript,
      responseText: `Combien pour ${product} ?`
    }
  }
  
  // Unknown intent
  return {
    type: 'unknown',
    confidence: 0.3,
    rawTranscript: transcript,
    responseText: 'Je n\'ai pas bien compris. Pouvez-vous répéter ?'
  }
}

/**
 * Build a clarifying-question intent from a coarse ML type guess (see
 * nlu-ml.ts) when the regex parser found no entities at all. The ML
 * fallback only classifies *which kind* of utterance this is — it can't
 * extract amount/product/quantity — so instead of guessing further we ask
 * a targeted follow-up instead of the generic "je n'ai pas compris".
 */
export function buildClarifyingIntent(type: IntentType, transcript: string, confidence: number): ParsedIntent {
  const prompts: Partial<Record<IntentType, string>> = {
    sale: 'Vous voulez enregistrer une vente ? Dites le produit et le prix, par exemple "tomates 2000 francs".',
    expense: 'Vous voulez enregistrer une dépense ? Dites le montant, par exemple "dépensé 1000 francs transport".',
    restock: 'Vous voulez signaler un stock reçu ? Dites le produit et la quantité.',
    order: 'Que voulez-vous commander ? Dites par exemple « commander deux sacs de riz ».',
    navigation: 'Où voulez-vous aller ? Par exemple "ma caisse" ou "mes ventes".',
    consultation: 'Quel total voulez-vous consulter ?',
  }
  const responseText = prompts[type] ?? 'Je n\'ai pas bien compris. Pouvez-vous répéter ?'
  return {
    type: 'unknown',
    confidence,
    rawTranscript: transcript,
    responseText,
  }
}

/**
 * Format amount as FCFA string — SOURCE UNIQUE déplacée vers
 * src/lib/utils.ts (NORM-304) ; ce ré-export préserve tous les imports
 * existants des écrans marchands (le comportement est identique).
 */
import { formatFCFA } from '@/lib/utils'
export { formatFCFA }

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
