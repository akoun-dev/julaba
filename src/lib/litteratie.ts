/**
 * Littératie — étape d'onboarding « Savez-vous lire et écrire ? ».
 *
 * L'étape d'onboarding (litteratie-step.tsx) active le micro AUTOMATIQUEMENT
 * et recueille la réponse VOCALE du marchand parmi trois options : « Oui »,
 * « Non », « Un peu ». Ce module est PUR et testable : il normalise le
 * transcript, reconnaît la réponse et produit le guidage adapté.
 *
 * Reconnaissance — même discipline que confirmations.ts (B4-041) :
 *  - normalisation NFD (tons retirés), apostrophes unifiées, minuscules,
 *    ponctuation → espace, espaces compactés ;
 *  - « un peu » est testé AVANT oui/non : une réponse mixte (« oui, un peu »)
 *    doit offrir le guidage le PLUS aidant, pas le plus optimiste ;
 *  - oui/non se reconnaissent au DÉBUT de la réponse (premier token ou
 *    bigramme) — « oui oui » et « non, c'est bon » restent compris ;
 *  - JAMAIS de reconnaissance implicite au-delà des listes ci-dessous : une
 *    réponse inconnue retourne null et l'écran propose de réessayer ou de
 *    toucher la réponse (l'utilisateur n'est jamais bloqué).
 */

export type LitteratieNiveau = 'oui' | 'un_peu' | 'non'

/** Formes orales françaises + interjections baoulé attestées (cf. confirmations.ts). */
const OUI_FORMES = [
  'oui', 'ouais', 'oue', 'we', 'wi', 'yes',
  "d'accord", 'daccord', "c'est bon", 'cest bon', "c'est ça", 'cest ca',
  'exact', 'bien sûr', 'bien sur',
  // Baoulé (liste pilote B3-032 — mêmes formes que confirmations.ts)
  'ɛhɛ', 'ehe', 'ɔɔ', 'oo',
] as const

const NON_FORMES = [
  'non', 'no', 'nan', 'pas du tout', 'zero',
  // Baoulé (liste pilote B3-032)
  'ao', 'a o',
] as const

/**
 * Normalise un transcript candidat : tons retirés (U+0300–U+036F), apostrophes
 * unifiées (’ → '), minuscules, ponctuation terminale retirée, espaces
 * compactés. ɛ (U+025B) et ɔ (U+0254) sont des lettres à part entière
 * (non décomposables en NFD) — ils restent tels quels.
 */
export function normalizeLitteratieText(input: string): string {
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
 * Reconnaît la réponse de littératie dans un transcript vocal.
 * Retourne null si rien ne correspond — l'écran propose alors de répéter
 * ou de toucher une réponse (jamais de blocage).
 */
export function parseLitteratieReponse(input: string): LitteratieNiveau | null {
  const normalized = normalizeLitteratieText(input)
  if (!normalized) return null

  const tokens = normalized.split(' ')

  // 1) « un peu » (et variantes) AVANT oui/non — guidage le plus aidant.
  //    Le token « peu » couvre « un peu », « un petit peu », « juste un peu »,
  //    « un peu seulement » — toute réponse contenant « peu » est « un peu ».
  if (tokens.includes('peu')) return 'un_peu'

  const first = tokens[0] ?? ''
  const twoFirst = tokens.slice(0, 2).join(' ')
  const threeFirst = tokens.slice(0, 3).join(' ')

  // 2) Groupes français multi-mots (« pas du tout », « a o » épelé) avant les
  //    formes un-mot — l'ordre des vérifications est significatif.
  if ((NON_FORMES as readonly string[]).includes(threeFirst)) return 'non'
  if ((NON_FORMES as readonly string[]).includes(twoFirst)) return 'non'

  // 3) Début de réponse oui/non (premier token, ou bigramme français deux-mots).
  if ((OUI_FORMES as readonly string[]).includes(twoFirst)) return 'oui'
  if ((OUI_FORMES as readonly string[]).includes(first)) return 'oui'
  if ((NON_FORMES as readonly string[]).includes(first)) return 'non'

  return null
}

/** Guidage adapté produit après reconnaissance de la réponse. */
export type GuidanceLitteratie = {
  /** Phrase de guidage lue par Tata Nanti Lou ET affichée à l'écran. */
  message: string
  /** Activer le Mode Soleil (texte plus grand, contraste renforcé). */
  soleil: boolean
  /** Proposer le bouton « Activer la voix » si la voix est coupée. */
  proposerVoix: boolean
}

/**
 * Logique de guidage adaptée à la réponse — oriente l'utilisateur vers
 * l'étape suivante :
 *  - « Oui »    : parcours standard, aucun réglage modifié ;
 *  - « Un peu » : Mode Soleil activé (texte plus grand aide la lecture) +
 *                assurance que la voix guidera à chaque étape ;
 *  - « Non »    : Mode Soleil activé + guidage 100 % vocal assumé ; si la
 *                voix est coupée, l'écran proposera un bouton dédié pour la
 *                réactiver (jamais de bascule forcée derrière le dos de
 *                l'utilisateur).
 *
 * Chaque message se termine par l'orientation vers l'étape suivante
 * (« Appuyez sur Suivant ») — la suite du parcours reste la même pour tous,
 * seuls les réglages d'accompagnement changent.
 */
export function guidanceLitteratie(niveau: LitteratieNiveau): GuidanceLitteratie {
  switch (niveau) {
    case 'oui':
      return {
        message: 'Parfait ! Vous saurez lire les écrans de Jùlaba. Continuez normalement. Appuyez sur Suivant pour continuer.',
        soleil: false,
        proposerVoix: false,
      }
    case 'un_peu':
      return {
        message: "Très bien ! Pas de souci : moi, Tata Nanti Lou, je vous guiderai à la voix à chaque étape. J'agrandis aussi le texte pour vous aider. Appuyez sur Suivant pour continuer.",
        soleil: true,
        proposerVoix: false,
      }
    case 'non':
      return {
        message: "Aucun problème ! Tout se fera à la voix : moi, Tata Nanti Lou, je vous guiderai à chaque étape, et vous pourrez écouter vos chiffres au lieu de les lire. J'agrandis le texte pour plus de confort. Appuyez sur Suivant pour continuer.",
        soleil: true,
        proposerVoix: true,
      }
  }
}
