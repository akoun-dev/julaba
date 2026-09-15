// Jùlaba Voice Intent Parser - Terrain Language Support
// Supports français de marché, nouchi léger, oral abbreviations

export type IntentType =
  | 'sale'
  | 'expense'
  | 'restock'
  | 'navigation'
  | 'back'
  | 'consultation'
  | 'credit_block'
  | 'auth_name'
  | 'auth_pin'
  | 'yes'
  | 'no'
  | 'cancel'
  | 'unknown'

export interface ParsedIntent {
  type: IntentType
  confidence: number
  product?: string
  amount?: number
  quantity?: number
  unitPrice?: number
  category?: string
  description?: string
  targetRoute?: string
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

// Amount abbreviations common in marché French
const AMOUNT_PATTERNS = [
  /((?:\d+\s*(?:mille|mil|m)\s*)?\d{1,3}(?:\s*f)?)/gi,
  /((?:mille\s*(?:cinq|six|sept|huit|neuf|\d{1,2})))/gi,
]

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
  
  // "X mille" or "mille X" (word-based)
  const wordResult = parseFrenchNumber(lower)
  if (wordResult !== null && wordResult > 0) return wordResult
  
  // Standalone digits at end: "tomates 2000"
  const endDigits = lower.match(/(\d{3,7})$/)
  if (endDigits) return parseInt(endDigits[1])
  
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
  
  // "X unités", "X pièces", "X kilos"
  const qtyMatch = lower.match(/(\d+)\s*(?:unit[ée]s?|pi[èe]ces?|kilos?|kg|sacs?|caisses?|tas?|botte|bottes?)/)
  if (qtyMatch) return parseInt(qtyMatch[1])
  
  // "X à Y francs" format
  const atMatch = lower.match(/(\d+)\s*à\s*(\d+)/)
  if (atMatch) return parseInt(atMatch[1])
  
  return null
}

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
  
  if (/(?:annule tout|stop|arrête|ferme|plus rien)/i.test(lower)) {
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
  const amount = extractAmount(lower)
  const quantity = extractQuantity(lower)
  
  // "J'ai vendu X à Y francs" format
  const atPriceMatch = lower.match(/(\d+)\s*à\s*(\d+)/)
  let unitPrice: number | undefined
  if (atPriceMatch) {
    unitPrice = parseInt(atPriceMatch[2])
  }
  
  if (amount && amount > 0 && product) {
    const saleAmount = amount
    const displayProduct = product
    const qtyText = quantity ? ` (${quantity} unités à ${formatFCFA(unitPrice || saleAmount / Math.max(quantity || 1, 1))})` : ''
    return {
      type: 'sale',
      confidence: 0.85,
      product: product || undefined,
      amount: saleAmount,
      quantity: quantity || undefined,
      unitPrice,
      rawTranscript: transcript,
      responseText: `Vente de ${displayProduct} pour ${formatFCFA(saleAmount)}${qtyText}, c'est bien ça ?`
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
 * Format amount as FCFA string
 */
export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

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
