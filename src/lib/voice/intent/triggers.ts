// Déclencheurs regex + tables de mots-clés + helpers crédit (consommés par parse-intent.ts).
// Blocs VERBATIM de src/lib/voice/localIntent.ts (DET-001 tranche 8, MODE-994)
// — preuves P1/P2/P3 : scripts/mode994_intent_split.py. Aucun comportement changé.

import { extractAmount } from './numbers'

/**
 * Phrases de fin de conversation explicite (VOCAL-607). Détectées AVANT le
 * regex cancel : « plus rien » y figurait et Tata répondait « j'ai tout
 * annulé » alors que la marchande annonce qu'elle a terminé l'échange.
 * Testé sur la phrase ENTIRE (pas ancré) : « au revoir Tata » matche.
 */
export const END_CONVERSATION_RE =
  /(c['’]est tout|j['’]ai fini|j['’]ai termin|au revoir|plus rien|bon pour aujourd['’]hui|fini pour aujourd['’]hui|[àa] demain|bonne soir[eé]e|j['’]arr[eê]te)/i

// Navigation keywords. Values are bare ScreenRoute literals (app-store.ts) —
// no leading slash. navigate() sets currentScreen directly, it doesn't
// parse a URL path.
export const NAV_KEYWORDS: Record<string, string> = {
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
export const EXPENSE_CATEGORIES = ['aliment', 'transport', 'loyer', 'personnel', 'eau', 'électricité', 'matériel', 'taxe', 'autre']

// Expense keywords
export const EXPENSE_KEYWORDS = ['dépensé', 'depense', 'dépense', 'acheté', 'acheter', 'payé', 'payer', 'donné', 'déboursé', 'crédit fournisseur']

// Restock keywords
export const RESTOCK_KEYWORDS = ['reçu', 'recevoir', 'réappro', 'réapprovisionner', 'approvisionné', 'livré', 'livraison', 'stock reçu']

// Consultation keywords
export const CONSULTATION_KEYWORDS = ['combien', 'total', 'résumé', 'bilan', 'chiffre d\'affaire', 'combien j\'ai vendu', 'combien j\'ai gagné']

// Déclencheurs stock (STK-807) — garde anti-préfixe (?![a-zà-öø-ÿ]) au
// lieu de \b : JS \b considère « tomatesé » comme une frontière de mot
// et capterait des mots collés oraux (« perdues » via « perdu » est OK
// — même famille — mais « ajouterait » ne doit pas être un ajustement).

export const STOCK_LOSS_RE =
  /(?:j['’]ai\s+)?(?:perdu(?:e)?s?|g[aâ]t[eé]s?(?:e)?s?|ab[iî]m[eé]s?(?:e)?s?|cass[eé]s?(?:e)?s?|pourri(?:e)?s?|vol[eé]s?(?:e)?s?|jet[eé]s?(?:e)?s?)(?![a-zà-öø-ÿ])/i

export const STOCK_ADJUST_RE = /(?:ajout(?:e|er|ez|ons)|enl[eè]v(?:e|er|ez)?|retir(?:e|er|ez))(?![a-zà-öø-ÿ])/i

export const PURCHASE_RE = /(?:j['’]ai\s+)?(?:achet[eé]s?(?:e)?s?|acheter|achetez|achats?)(?![a-zà-öø-ÿ])/i

// MODE-907 (§15) — fournisseur dicté en fin d'achat : « … chez Koné »,
// « … chez Adjoua Koné » (1 à 3 mots, fin de phrase, casse libre, accents
// et apostrophes acceptés). Ancre $ : un « chez » en milieu de phrase ne
// capte jamais (on ne devine pas où s'arrêterait le nom).
export const PURCHASE_SUPPLIER_RE =
  /\s+chez\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’-]+){0,2})\s*[.!?…]*\s*$/i

/** Production propre du marchand (STK-809, §2.7) : œufs, attiéké,
 * transformation… « j'ai produit 50 oeufs », « production de 20 kilos ».
 * Mouvement PRODUCTION (entrée, PAS un achat fournisseur). */
export const STOCK_PRODUCTION_RE = /(?:j['’]ai\s+)?(?:produit|production|fabriqu[eé]s?)(?![a-zà-öø-ÿ])/i

/** Consultation de marge (STK-810, §29-§30) : « marge du riz ? », « combien
 * je gagne sur les tomates ? », « bénéfice d'oignons ». Exige un produit. */
export const MARGIN_CHECK_RE = /(?:marge|b[ée]n[ée]fic[eé]s?|combien (?:je|tu) gagne|je gagne combien)/i

// ── Crédits clients (MODE-906, §21-22) ───────────────────────────────────
//
// « Adjoua me doit 5 000 francs » (credit_doit) et « Adjoua m'a payé les
// 3 000 francs » / « Adjoua a payé 3 000 » (credit_paye). Nom = 1 à 3 mots,
// montant via le parseur de nombres existant (lettres + chiffres, espace
// des milliers normalisée). Les phrases de VENTE et de STOCK ne sont JAMAIS
// captées (garde en amont) ; les « j'ai payé » (dépense) sont écartés par
// la liste de pronoms — jamais un crédit sur une dépense.

export const CREDIT_SALE_GUARD_RE = /(?:vente|vend[ue]?s?|vendre|stock|achet)/i

// MODE-909 (§28) — déclencheur d'annulation de vente : « annule la
// dernière vente », « annule la vente », « annuler la vente », « annulé la
// vente » (participe passé parlé), possessif « ma » accepté, accents et
// casse libres. NB : \p{L} (et non \w) après « annul » — \w ignore les
// accents (é n'est pas un caractère de mot) et « annulé la vente » serait
// raté. « annule tout » / « annule » SEUL ne matchent PAS (le cancel
// générique et le refus court restent inchangés — tests).
export const ANNULE_VENTE_RE = /annul\p{L}*\s+(?:la\s+|ma\s+|cette\s+)?(?:derni[eè]re\s+)?vente/iu

export const CREDIT_DOIT_RE = /^(.*?)(?:\s+me\s+doit)(?:\s+(.*))?$/i
// NB : jamais de \b après « payé » — JS ignore les accents dans \b (é n'est
// pas un caractère de mot) et la frontière échoue ; garde anti-préfixe
// (?![a-zà-öø-ÿ]) à la place (même motif que les déclencheurs stock).
export const CREDIT_PAYE_MOI_RE = /^(.*?)(?:\s+m['’]a\s+pay[eéè]s?(?![a-zà-öø-ÿ]))(?:\s+(.*))?$/i
export const CREDIT_PAYE_RE = /^(.*?)(?:\s+a\s+pay[eéè]s?(?![a-zà-öø-ÿ]))(?:\s+(.*))?$/i

/** Mots qui ne sont JAMAIS un nom de client (pronoms, déterminants…). */
const CREDIT_NAME_STOPWORDS = new Set([
  'j', 'je', "j'", 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'ce', 'ca', 'ça', 'qui', 'que', 'quoi', 'tout', 'rien',
  'le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'au', 'aux', 'et', 'ou',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'pour', 'avec',
])

const CREDIT_NAME_WORD_RE = /^[a-zà-öø-ÿ'’-]+$/i

/** Extrait le nom (1 à 3 mots) d'un préfixe de phrase ; null si invalide. */
export function creditClientName(prefix: string): string | null {
  const words = prefix.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 3) return null
  for (const word of words) {
    const w = word.toLowerCase().replace(/^(?:l['’]|d['’])/, '')
    if (!CREDIT_NAME_WORD_RE.test(w)) return null
    if (CREDIT_NAME_STOPWORDS.has(w)) return null
  }
  return words.join(' ')
}

/** Montant d'une queue d'intent crédit : espace des milliers normalisée
 * (« 3 000 » → « 3000 ») puis extractAmount existant (chiffres + lettres). */
export function creditTailAmount(tail: string | undefined): number | null {
  if (!tail) return null
  const normalized = tail.replace(/(\d)[ \u00A0\u202F](\d{3})(?!\d)/g, '$1$2')
  const amount = extractAmount(normalized)
  return amount && amount > 0 ? amount : null
}

/** Consultation de stock : « il reste combien de tomates ? », « combien de
 * tomates il me reste ? », « stock de tomates », « combien j'ai de riz ».
 * JAMAIS « ouvre mon stock » (pas de produit → navigation) ni « combien
 * pour X ? » (prix → vente/clarification) : « combien » doit être suivi
 * de « de / d' / j'ai » — jamais nu. */
export const STOCK_CHECK_RE =
  /(?:il\s+(?:me\s+|m['’]e?\s+)?rest(?:e|ent)|combien\s+(?:de\s|d['’]|j['’]ai\s)|stock\s+(?:de\s|d['’]|actuel))/i
