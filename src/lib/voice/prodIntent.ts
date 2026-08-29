// Jùlaba — Producteur voice intent parser.
//
// Deliberately NOT a reuse of localIntent.ts's parseIntent(): that parser's
// NAV_KEYWORDS point at marchand ScreenRoute values ('stock', 'caisse',
// 'marche'...) and its sale/expense/restock intents push into
// caisse-store/stock-store — none of which apply to the producteur role.
// Reusing it as-is would silently mis-navigate a producteur to marchand
// screens they can't use (no bottom bar for that role there). This is a
// small, separate parser scoped to producteur's own prod-* routes —
// navigation only for now; voice récolte declaration is a larger, separate
// vocabulary/NLU effort left for later.

import type { ScreenRoute } from '@/lib/stores/app-store'

export interface ProdIntent {
  targetRoute: ScreenRoute | null
  responseText: string
}

const NAV_KEYWORDS: Record<string, ScreenRoute> = {
  'accueil': 'prod-home',
  'ma page': 'prod-home',

  'récolte': 'prod-recoltes',
  'récoltes': 'prod-recoltes',
  'recolte': 'prod-recoltes',
  'recoltes': 'prod-recoltes',
  'mes récoltes': 'prod-recoltes',
  'déclarer une récolte': 'prod-recoltes',
  'nouvelle récolte': 'prod-recoltes',

  'commande': 'prod-commandes',
  'commandes': 'prod-commandes',
  'mes commandes': 'prod-commandes',

  'stock': 'prod-stock',
  'mon stock': 'prod-stock',

  'cycle': 'prod-cycles',
  'cycles': 'prod-cycles',
  'mes cycles': 'prod-cycles',
  'carnet de champ': 'prod-cycles',
  'calendrier cultural': 'prod-cycles',

  'profil': 'prod-profil',
  'mon profil': 'prod-profil',
  'moi': 'prod-profil',
}

const RESPONSE_TEXT: Partial<Record<ScreenRoute, string>> = {
  'prod-home': "J'ouvre l'accueil.",
  'prod-recoltes': "J'ouvre vos récoltes.",
  'prod-commandes': "J'ouvre vos commandes.",
  'prod-stock': "J'ouvre votre stock.",
  'prod-cycles': "J'ouvre vos cycles de production.",
  'prod-profil': "J'ouvre votre profil.",
}

export function parseProdIntent(transcript: string): ProdIntent {
  const text = transcript.trim().toLowerCase()

  // Longest keyword first, so "mes récoltes" wins over the bare "récoltes".
  const keyword = Object.keys(NAV_KEYWORDS)
    .sort((a, b) => b.length - a.length)
    .find((k) => text.includes(k))

  if (keyword) {
    const targetRoute = NAV_KEYWORDS[keyword]
    return { targetRoute, responseText: RESPONSE_TEXT[targetRoute] ?? `J'ouvre ${keyword}.` }
  }

  return {
    targetRoute: null,
    responseText: "Je n'ai pas compris. Dites par exemple : récoltes, commandes, stock, ou profil.",
  }
}
