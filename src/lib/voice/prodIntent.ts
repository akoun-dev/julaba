// Jùlaba — Producteur voice intent parser.
//
// Deliberately NOT a reuse of localIntent.ts's parseIntent(): that parser's
// NAV_KEYWORDS point at marchand ScreenRoute values ('stock', 'caisse',
// 'marche'...) and its sale/expense/restock intents push into
// caisse-store/stock-store — none of which apply to the producteur role.
// This is a small, separate parser scoped to producteur's own prod-* routes.
//
// Two intent families: pure navigation ("récoltes", "mon stock"...), and
// récolte declaration by voice ("j'ai récolté 100 kg de manioc") — the
// latter exists so a producteur never has to read or fill in the
// (produit/quantité/qualité/parcelle/prix) form to log a harvest, which
// matters for anyone who can't read: declaring by voice is Tata asking a
// couple of short spoken questions instead of a wall of labelled fields.
// Quality/parcelle/price are optional by voice — sensible defaults, editable
// later from the form — so a bare "j'ai récolté du manioc, 100 kilos" is
// enough on its own.

import type { ScreenRoute } from '@/lib/stores/app-store'
import { extractQuantity } from '@/lib/voice/localIntent'

export type RecolteQualite = 'premium' | 'standard' | 'secondaire'

export interface ProdIntent {
  type: 'navigation' | 'declare-recolte' | 'unknown'
  targetRoute: ScreenRoute | null
  responseText: string
  recolte?: {
    produit: string
    quantiteKg: number
    qualite: RecolteQualite
  }
}

const NAV_KEYWORDS: Record<string, ScreenRoute> = {
  'accueil': 'prod-home',
  'ma page': 'prod-home',
  'akèy': 'prod-home',
  'akey': 'prod-home',
  'retour': 'prod-home',
  'revenir': 'prod-home',

  'récolte': 'prod-recoltes',
  'récoltes': 'prod-recoltes',
  'recolte': 'prod-recoltes',
  'recoltes': 'prod-recoltes',
  'mes récoltes': 'prod-recoltes',
  'rekòlt': 'prod-recoltes',
  'rekolt': 'prod-recoltes',
  'trava': 'prod-recoltes',
  'pralé trava': 'prod-recoltes',

  'commande': 'prod-commandes',
  'commandes': 'prod-commandes',
  'mes commandes': 'prod-commandes',
  'komand': 'prod-commandes',
  'kòmand': 'prod-commandes',

  'stock': 'prod-stock',
  'mon stock': 'prod-stock',
  'stok': 'prod-stock',
  'korè': 'prod-stock',

  'cycle': 'prod-cycles',
  'cycles': 'prod-cycles',
  'mes cycles': 'prod-cycles',
  'carnet de champ': 'prod-cycles',
  'calendrier cultural': 'prod-cycles',
  'kanp': 'prod-cycles',
  'tan': 'prod-cycles',

  'profil': 'prod-profil',
  'mon profil': 'prod-profil',
  'moi': 'prod-profil',
  'fèm': 'prod-profil',
  'ferm': 'prod-profil',
}

const RESPONSE_TEXT: Partial<Record<ScreenRoute, string>> = {
  'prod-home': "J'ouvre l'accueil.",
  'prod-recoltes': "J'ouvre vos récoltes.",
  'prod-commandes': "J'ouvre vos commandes.",
  'prod-stock': "J'ouvre votre stock.",
  'prod-cycles': "J'ouvre vos cycles de production.",
  'prod-profil': "J'ouvre votre profil.",
}

// A subset of PRIX_MARCHE_REFERENCE's keys (producteur-store.ts) — the
// crops a producteur actually declares. Kept separate from localIntent.ts's
// marchand-facing PRODUCT_VOCAB (aimed at what a marchand buys/sells, wider
// and phrased differently) even where a crop name is shared.
const CROP_VOCAB: Record<string, string[]> = {
  'Manioc': ['manioc', 'couscous'],
  'Igname': ['igname', 'ignames'],
  'Piment': ['piment', 'piments', 'pèment'],
  'Oignon': ['oignon', 'oignons', 'ognon'],
}

const QUALITE_KEYWORDS: Record<string, RecolteQualite> = {
  'premium': 'premium',
  'première qualité': 'premium',
  'excellent': 'premium',
  'secondaire': 'secondaire',
  'deuxième qualité': 'secondaire',
  'moyenne': 'secondaire',
}

// Words that signal "I harvested/have a harvest", not just "take me to the
// récoltes screen" — deliberately requires a verb, so a bare "récoltes"
// (pure navigation) never gets mis-read as a declaration.
const DECLARE_KEYWORDS = ['récolté', 'recolte', 'j\'ai récolté', 'récolte de', 'récolte d\'']

function extractCrop(text: string): string | null {
  for (const [canonical, aliases] of Object.entries(CROP_VOCAB)) {
    for (const alias of aliases) {
      if (text.includes(alias)) return canonical
    }
  }
  return null
}

function extractQualite(text: string): RecolteQualite {
  for (const [kw, qualite] of Object.entries(QUALITE_KEYWORDS)) {
    if (text.includes(kw)) return qualite
  }
  return 'standard'
}

export function parseProdIntent(transcript: string): ProdIntent {
  const text = transcript.trim().toLowerCase()

  const looksLikeDeclaration = DECLARE_KEYWORDS.some((kw) => text.includes(kw))
  if (looksLikeDeclaration) {
    const produit = extractCrop(text)
    const quantiteKg = extractQuantity(text)
    if (produit && quantiteKg) {
      const qualite = extractQualite(text)
      return {
        type: 'declare-recolte',
        targetRoute: 'prod-recoltes',
        // Spoken back in lowercase (reads more naturally), stored capitalized
        // (matches PRIX_MARCHE_REFERENCE and the rest of the app's crop names).
        responseText: `Récolte de ${quantiteKg} kilos de ${produit.toLowerCase()}, qualité ${qualite}. C'est bien ça ?`,
        recolte: { produit, quantiteKg, qualite },
      }
    }
    // Verb heard, but couldn't get both a crop and a quantity — ask for
    // exactly what's missing instead of a generic "je n'ai pas compris".
    return {
      type: 'unknown',
      targetRoute: null,
      responseText: !produit
        ? 'Quel produit avez-vous récolté ? Par exemple : manioc, igname, piment, ou oignon.'
        : 'Quelle quantité, en kilos ?',
    }
  }

  // Longest keyword first, so "mes récoltes" wins over the bare "récoltes".
  const keyword = Object.keys(NAV_KEYWORDS)
    .sort((a, b) => b.length - a.length)
    .find((k) => text.includes(k))

  if (keyword) {
    const targetRoute = NAV_KEYWORDS[keyword]
    return { type: 'navigation', targetRoute, responseText: RESPONSE_TEXT[targetRoute] ?? `J'ouvre ${keyword}.` }
  }

  return {
    type: 'unknown',
    targetRoute: null,
    responseText: "Je n'ai pas compris. Dites par exemple : récoltes, commandes, stock, profil, ou « j'ai récolté 100 kilos de manioc ».",
  }
}
