// Jùlaba — Identificateur voice intent parser.
//
// Same reasoning as prodIntent.ts: NOT a reuse of marchand's localIntent.ts
// parser. Its NAV_KEYWORDS point at marchand ScreenRoute values and its
// sale/expense/restock intents have no equivalent for a field agent
// enrolling actors. This is a small, separate parser scoped to
// identificateur's own ident-* routes — navigation only.

import type { ScreenRoute } from '@/lib/stores/app-store'

export interface IdentIntent {
  targetRoute: ScreenRoute | null
  responseText: string
}

const NAV_KEYWORDS: Record<string, ScreenRoute> = {
  'accueil': 'ident-home',
  'ma page': 'ident-home',

  'mes dossiers': 'ident-suivi',
  'dossier': 'ident-suivi',
  'dossiers': 'ident-suivi',
  'suivi': 'ident-suivi',

  'brouillon': 'ident-brouillons',
  'brouillons': 'ident-brouillons',
  'mes brouillons': 'ident-brouillons',

  'nouveau dossier': 'ident-identification',
  'nouvel enrôlement': 'ident-identification',
  'enrôler': 'ident-identification',
  'identifier': 'ident-identification',
  'identification': 'ident-identification',

  'profil': 'ident-profil',
  'mon profil': 'ident-profil',
  'moi': 'ident-profil',
  'paramètres': 'ident-profil',
  'parametres': 'ident-profil',
}

const RESPONSE_TEXT: Partial<Record<ScreenRoute, string>> = {
  'ident-home': "J'ouvre l'accueil.",
  'ident-suivi': "J'ouvre vos dossiers.",
  'ident-brouillons': "J'ouvre vos brouillons.",
  'ident-identification': "J'ouvre un nouveau dossier.",
  'ident-profil': "J'ouvre votre profil.",
}

export function parseIdentIntent(transcript: string): IdentIntent {
  const text = transcript.trim().toLowerCase()

  // Longest keyword first, so "mes dossiers" wins over the bare "dossiers".
  const keyword = Object.keys(NAV_KEYWORDS)
    .sort((a, b) => b.length - a.length)
    .find((k) => text.includes(k))

  if (keyword) {
    const targetRoute = NAV_KEYWORDS[keyword]
    return { targetRoute, responseText: RESPONSE_TEXT[targetRoute] ?? `J'ouvre ${keyword}.` }
  }

  return {
    targetRoute: null,
    responseText: "Je n'ai pas compris. Dites par exemple : dossiers, nouveau dossier, brouillons, ou profil.",
  }
}
