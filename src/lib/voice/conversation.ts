// Orchestrateur de conversation bci→fr→IA→fr→bci (B4-040).
//
// Architecture cible validée (roadmap « Baoulé phase pilote ») :
//   ENTRÉE ASR bci → [NLLB bci→fra] → IA Tata Nanti Lou (fr) → [NLLB fra→bci] → TTS bci.
//
// Ce module est le nœud central de la chaîne : il transforme un transcript
// brut en entrée de parseur (lien montant) et une réponse française en
// narration (lien descendant), pour que les modales vocales
// (voice-modal.tsx, prod-voice-modal.tsx) n'aient JAMAIS à connaître la
// langue de session. Il ne remplace ni le parseur (localIntent/prodIntent),
// ni Tata (tata-tts.ts) : il les branche l'un à l'autre à travers NLLB.
//
// ── Lien montant — resolveConversationInput ───────────────────────────────
// • Passe par resolveParserInput (nllb-translation.ts), la GARDE
//   d'architecture B2-022 : en session baoulé, la traduction bci→fr est
//   OBLIGATOIRE — si le traducteur est indisponible, la fonction LÈVE
//   (NllbError typée) et la modale arrête la chaîne avant parseIntent.
//   Il est INTERDIT de renvoyer du baoulé brut au parseur français.
// • En session française : pass-through strict (aucun appel traducteur,
//   comportement historique inchangé — zéro régression).
//
// ── Lien descendant — narrateResponse ────────────────────────────────────
// • Session française : tataSpeak direct (dispatch synchrone préservé —
//   contrat tata-tts : des appels chaînés et des tests dépendent du
//   déclenchement dans le même tick).
// • Session baoulé : la réponse française est TRADUITE fra→bci (NLLB)
//   puis tataSpeak reçoit le texte baoulé BRUT (contrat B3-031 : le chemin
//   bci de tata-tts passe le texte tel quel au moteur MMS, sans
//   toSpeechText — les montants français n'ont pas de sens en baoulé).
// • Échec de traduction : JAMAIS de repli silencieux — la réponse est
//   narrée en français via tataSpeakWeb (court-circuite le chemin bci de
//   tata-tts : du texte français ne doit JAMAIS atteindre la voix MMS
//  akan, qui le lirait avec des phonèmes akan), tata-tts signale la
//   limite une fois par session, et la promesse résout avec
//   translationError (message français explicite, à afficher en UI).
//   narrateResponse ne lève JAMAIS : une conversation ne meurt pas sur
//   un maillon de narration.
//
// ── Limites honnêtes (documentées, pas cachées) ───────────────────────────
// • Les confirmations oui/non en baoulé passent par la traduction (le
//   « oui » baoulé traduit par NLLB correspond généralement) — les
//   patterns natifs dédiés (ɛhɛ, …) sont B4-041.
// • L'affichage des modales reste français (langue de l'UI) : en session
//   baoulé, l'étape « traitement » montre la traduction française — ce
//   que Tata a compris — jamais le brut non vérifié.
// • Le texte métier (intent.rawTranscript) porte la traduction française :
//   les correspondances catalogue/produits (findCatalogEntry) et les
//   descriptions synchronisées sont françaises côté données.

import {
  describeNllbError,
  NllbError,
  resolveParserInput,
  translateText,
  type SessionVoiceLanguage,
} from './nllb-translation'
import { tataSpeak, tataSpeakWeb } from './tata-tts'
import { getSelectedTtsLanguage, getSelectedVoiceLanguage } from '../stores/voice-language-store'

/** Callback de fin de narration, mêmes conventions que tata-tts. */
export type SpeakCallback = (state: 'done' | 'error') => void

/** Résultat du lien montant : le texte À DONNER au parseur (toujours fr). */
export type ConversationInput = {
  /** Texte parseur — français en session bci (traduit), transcript brut en fr. */
  text: string
  /** Transcript brut tel que sorti du STT (diagnostics/affichage). */
  sourceText: string
  /** true si une traduction bci→fr a eu lieu. */
  translated: boolean
}

/** Résultat du lien descendant : ce qui a été narré, et pourquoi. */
export type SpokenReply = {
  /** Langue réellement narrée. */
  spokenIn: 'bci' | 'fr'
  /** Traduction baoulé effectivement narrée (session bci, succès). */
  bciText?: string
  /** Message français explicite si la traduction a échoué (repli français). */
  translationError?: string
}

// ── Seams de test (pattern nllb-translation setNllbPipelineLoaderForTests) ──

type ParserInputResolver = (
  transcript: string,
  language: SessionVoiceLanguage,
) => Promise<{ text: string; translated: boolean }>

type BciTranslator = (frenchText: string) => Promise<string>

let parserInputResolver: ParserInputResolver = (transcript, language) =>
  resolveParserInput(transcript, language)

let translateToBci: BciTranslator = (frenchText) =>
  translateText(frenchText, { src: 'fra_Latn', tgt: 'bci_Latn' })

/** Injecte les maillons NLLB pour isoler les tests du modèle réel. */
export function setConversationNllbForTests(seams: {
  parserInputResolver?: ParserInputResolver
  translateToBci?: BciTranslator
}): void {
  if (seams.parserInputResolver) parserInputResolver = seams.parserInputResolver
  if (seams.translateToBci) translateToBci = seams.translateToBci
}

/** Remet les maillons NLLB réels. Isolation des tests. */
export function resetConversationForTests(): void {
  parserInputResolver = (transcript, language) => resolveParserInput(transcript, language)
  translateToBci = (frenchText) => translateText(frenchText, { src: 'fra_Latn', tgt: 'bci_Latn' })
}

/** Message français explicite pour l'UI (pattern Task 41 — erreurs affichées). */
export function describeConversationError(error: unknown): string {
  return describeNllbError(error)
}

// ── Lien montant ────────────────────────────────────────────────────────────

/**
 * Transforme un transcript STT en entrée de parseur, selon la langue de
 * dictée (voice-language-store sttLanguage) :
 *  - 'fr'  → pass-through strict (aucune traduction, zéro régression) ;
 *  - 'bci' → traduction bci→fr OBLIGATOIRE (garde B2-022). Si le
 *    traducteur est indisponible, LÈVE une NllbError typée — l'appelant
 *    (modale) doit arrêter la chaîne AVANT parseIntent, afficher le
 *    message (describeConversationError) et narrer l'explication.
 */
export async function resolveConversationInput(transcript: string): Promise<ConversationInput> {
  const language = getSelectedVoiceLanguage()
  if (language === 'fr') {
    return { text: transcript, sourceText: transcript, translated: false }
  }
  if (language !== 'bci') {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      `Langue de dictée inconnue : ${String(language)}. Phase pilote : français ou baoulé.`,
    )
  }
  // Garde B2-022 : lève NLLB_NOT_READY / NLLB_TIMEOUT / NLLB_ENGINE_ERROR…
  // plutôt que de laisser passer du baoulé brut vers le parseur français.
  const resolved = await parserInputResolver(transcript, 'bci')
  return { text: resolved.text, sourceText: transcript, translated: resolved.translated }
}

// ── Lien descendant ────────────────────────────────────────────────────────

/**
 * Narration d'une réponse Tata, selon la langue de narration
 * (voice-language-store ttsLanguage) :
 *  - 'fr'  → tataSpeak direct (chaîne historique, dispatch synchrone) ;
 *  - 'bci' → traduction fra→bci (NLLB) puis tataSpeak avec le texte
 *    baoulé BRUT (chemin MMS). Traduction impossible → narration
 *    française via tataSpeakWeb (jamais du français dans la voix MMS,
 *    jamais d'échec muet) + translationError dans le résultat.
 *
 * `callback` est transmis tel quel au moteur et part exactement une fois
 * (contrat tata-tts). Cette fonction ne lève jamais.
 */
export async function narrateResponse(
  frenchText: string,
  callback?: SpeakCallback,
): Promise<SpokenReply> {
  const ttsLanguage = getSelectedTtsLanguage()

  if (ttsLanguage !== 'bci') {
    // Session française : chaîne historique strictement inchangée.
    tataSpeak(frenchText, callback)
    return { spokenIn: 'fr' }
  }

  let bciText: string
  try {
    bciText = await translateToBci(frenchText)
  } catch (error) {
    // Repli explicite : narration française HORS chemin MMS (tataSpeakWeb
    // court-circuite la voix bci — du français n'y entrera jamais) et
    // message d'erreur retourné pour affichage UI.
    const translationError = describeNllbError(error)
    console.warn('[conversation] Traduction fra→bci impossible, narration française :', translationError)
    tataSpeakWeb(frenchText, callback)
    return { spokenIn: 'fr', translationError }
  }

  tataSpeak(bciText, callback)
  return { spokenIn: 'bci', bciText }
}

// ── Robustesse réseau (REQ-B4c, B4-041) ────────────────────────────────────

/**
 * Borne de temps pour les requêtes déclenchées EN PLEINE CONVERSATION
 * (dépense, commande fournisseur) : sans elle, un fetch vers un serveur
 * injoignable peut rester suspendu plusieurs dizaines de secondes et
 * bloquer la modale — l'interruption réseau doit être EXPLICITE et rapide.
 * (La chaîne voix elle-même est 100 % offline : NLLB, STT et TTS ont déjà
 * leurs propres timeouts.)
 *
 * Implémentation déplacée dans `src/lib/http.ts` (audit VOCAL-604) pour
 * servir aussi aux flux métier hors conversation (completeQuickSale) —
 * ré-exportée ici pour compatibilité avec les importeurs existants.
 */
export const CONVERSATION_NETWORK_TIMEOUT_MS = 10_000

export { fetchJsonWithTimeout } from '@/lib/http'
