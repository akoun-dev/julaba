// Confirmations oui/non bilingues français + baoulé (B4-041).
//
// REQ-B4b : le parseur de confirmation historique des modales vocales était
// 100 % français (`/^(oui|…)/`, `/^non/i`) — en session baoulé, une réponse
// « ɛhɛ » (oui) ou « ao » (non) n'était PAS reconnue et retombait dans le
// parseur d'intents : cas critique identifié par AGENT 2.
//
// ⚠️ LISTE PILOTE — à confirmer par locuteur natif (B3-032 / smoke appareil) :
// les formes baoulé retenues sont les interjections d'accord/négation les
// plus attestées dans les lexiques baoulé (ɛhɛ = oui ; ao = non). Le module
// est VOLONTAIREMENT extensible : ajouter une forme = une entrée dans les
// tableaux ci-dessous + un cas de test. JAMAIS de reconnaissance implicite
// au-delà de cette liste (une réponse non comprise est ré-analysée comme
// nouvelle commande par les modales — comportement historique conservé).
//
// Normalisation : NFD + retrait des diacritiques de tons (U+0300–U+036F),
// apostrophes unifiées (’ → '), minuscules. ɛ (U+025B) et ɔ (U+0254) sont
// des lettres à part entière (non décomposables) — ils restent tels quels.

import { parseIntent, type ParsedIntent } from './localIntent'

/** Réponse de confirmation reconnue, ou null si rien ne matche. */
export type Confirmation = 'yes' | 'no'

/** Formes de confirmation français (superset des regex historiques). */
const YES_FR = ['oui', 'ouais', "c'est ca", 'exact', "c'est bon", "d'accord", 'daccord', 'ok'] as const
const NO_FR = ['non', 'annule', 'annuler'] as const

/**
 * Formes de confirmation baoulé — PILOTE (validation natif B3-032).
 * Après normalisation des tons : « ɛhɛ́ » → « ɛhɛ », « àó » → « ao », etc.
 * « o » latin couvre les transcriptions ASR sans ɛ/ɔ (« o » = oui).
 */
const YES_BCI = ['ɛhɛ', 'ehe', 'ɔ', 'ɔɔ', 'o', 'oo'] as const
const NO_BCI = ['ao', 'a o'] as const

/**
 * Normalise une réponse candidat : tons retirés, apostrophes unifiées,
 * minuscules, ponctuation terminale retirée, espaces compactés.
 */
export function normalizeConfirmationText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/[.!?,;:]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Reconnaît une réponse oui/non bilingue. Retourne null si la réponse n'est
 * ni une confirmation ni une négation connue — l'appelant (modale) la
 * ré-analyse alors comme une nouvelle commande (comportement historique).
 *
 * Règle de reconnaissance : la réponse doit COMMENCER par une forme connue
 * (premier token, ou deux tokens pour « a o ») — « oui oui » et « ɛhɛ,
 * d'accord » matchent ; « ouvre la caisse » ne matche pas.
 */
export function parseConfirmation(input: string): Confirmation | null {
  const normalized = normalizeConfirmationText(input)
  if (!normalized) return null

  const first = normalized.split(' ')[0] ?? ''
  const twoFirst = normalized.split(' ').slice(0, 2).join(' ')

  // « a o » (non, forme épelée) se teste sur deux tokens AVANT « o » (oui) :
  // l'ordre des vérifications est significatif.
  if ((NO_BCI as readonly string[]).includes(twoFirst)) return 'no'

  // Phrases françaises deux-mots (« c'est ça », « c'est bon ») avant les
  // formes un-mot : « c'est » seul n'est PAS une confirmation.
  if ((YES_FR as readonly string[]).includes(twoFirst)) return 'yes'
  if ((YES_FR as readonly string[]).includes(first)) return 'yes'
  if ((NO_FR as readonly string[]).includes(first)) return 'no'
  if ((YES_BCI as readonly string[]).includes(first)) return 'yes'
  if ((NO_BCI as readonly string[]).includes(first)) return 'no'

  return null
}

/** Vocabulaire reconnu — pour documentation UI/tests (liste pilote). */
export const CONFIRMATION_VOCABULARY = {
  fr: { yes: [...YES_FR], no: [...NO_FR] },
  bci: { yes: [...YES_BCI], no: [...NO_BCI] },
} as const

// ── Routage de réponse en phase de confirmation (audit VOCAL-605) ──────────
//
// La vente rapide posait « Voulez-vous autre chose ? » et fermait sur
// TOUTE réponse qui n'était pas « oui… » — y compris « encore tomates
// 2000 » (vente suivante perdue) et « mes ventes » (navigation ignorée).
// Le routage ci-dessous applique le même contrat que les modales vocales
// générales (B4-041) : oui/non bilingues, sinon la réponse est ré-analysée
// comme une nouvelle commande.

export type ConfirmRoute =
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'intent'; intent: ParsedIntent }

/**
 * Classe la réponse donnée en phase de confirmation :
 *  - « yes » / « no » : confirmation bilingue (liste pilote ɛhɛ/ao incluse) ;
 *  - « intent » : toute autre réponse — la modale décide (vente reconnue →
 *    enchaîner, navigation → fermer et naviguer, consultation → totals,
 *    unknown → reposer la question).
 */
export function routeConfirmResponse(text: string): ConfirmRoute {
  const confirmed = parseConfirmation(text)
  if (confirmed === 'yes') return { kind: 'yes' }
  if (confirmed === 'no') return { kind: 'no' }
  return { kind: 'intent', intent: parseIntent(text) }
}
