// BaouleVoiceEngine — façade unifiée de la chaîne baoulé (B5-050, REQ-B5a).
//
// Encapsule B1→B4 derrière UN contrat : initialize / isReady / transcribe /
// speak, avec codes d'erreur dédiés — pour que l'appelant (stt-factory,
// modales vocales, futurs écrans) n'ait plus à connaître les quatre
// sous-modules. C'est une FAÇADE : aucune logique nouvelle, chaque maillon
// reste dans son module d'origine (source de vérité unique, tests existants
// inchangés) :
//
//   B1  ÉCOUTE   : voice-service (Omnilingual ASR bci_Latn, natif offline)
//   B2  TRADUCTION : nllb-translation (NLLB-200 bci↔fra, q8, opt-in)
//   B3  VOIX     : mms-tts (voix pilote MMS, opt-in, licence pilote)
//   B4  CHAÎNE   : conversation (garde B2-022 + narrateResponse)
//
// ── Garde-fous mission (inchangés, réaffirmés ici) ────────────────────────
// • initialize ne télécharge JAMAIS : il initialise ce qui est déjà
//   disponible (moteur STT natif, modèles en cache) et renvoie un état
//   EXACT des maillons manquants. Le téléchargement reste une action
//   utilisateur explicite (installBaouleTranslator / installBaouleVoice).
// • transcribe : session STT baoulé 100 % offline (audio jamais sorti de
//   l'appareil). Hors plateforme native → session inerte avec erreur
//   explicite (jamais de reconnaissance française en repli).
// • prepareBaouleParserInput : traduction bci→fr OBLIGATOIRE avant tout
//   parseur (garde B2-022) — indisponible → BaouleEngineError typée,
//   JAMAIS de baoulé brut en sortie.
// • speakBaoule : ne lève jamais ; réponse narrée en bci si le maillon
//   traduction+voix le permet, repli français explicite sinon.
// • Chaque échec porte un code dédié + un message français lisible
//   (pattern Task 41 — erreurs affichées, jamais avalées).

import { createVoiceServiceSingleShotSTT, initVoiceService, isVoiceServicePlatformAvailable } from './voice-service'
import {
  downloadNllbModel,
  isNllbModelReady,
  NllbError,
  translateText,
} from './nllb-translation'
import { downloadMmsBciVoice, isMmsBciVoiceReady } from './mms-tts'
import {
  narrateResponse,
  resolveConversationInput,
  type SpeakCallback,
  type SpokenReply,
} from './conversation'
import type { STTCallbacks, STTSession } from './stt'

// Robustesse réseau de la conversation (REQ-B4c) : ré-exportée pour que la
// façade reste l'entrée UNIQUE de la chaîne baoulé côté UI (B5-051).
export { fetchJsonWithTimeout, CONVERSATION_NETWORK_TIMEOUT_MS } from './conversation'

// ── Erreurs dédiées ─────────────────────────────────────────────────────────

export type BaouleEngineErrorCode =
  | 'BAOULE_UNSUPPORTED'
  | 'BAOULE_STT_UNAVAILABLE'
  | 'BAOULE_TRANSLATOR_NOT_READY'
  | 'BAOULE_TRANSLATOR_ERROR'
  | 'BAOULE_VOICE_NOT_READY'
  | 'BAOULE_VOICE_ERROR'
  | 'BAOULE_EMPTY_INPUT'

/** Erreur typée de la façade — message français prêt pour l'UI. */
export class BaouleEngineError extends Error {
  readonly code: BaouleEngineErrorCode
  constructor(code: BaouleEngineErrorCode, message: string) {
    super(message)
    this.name = 'BaouleEngineError'
    this.code = code
  }
}

/** Message français explicite pour l'UI (pattern Task 41). */
export function describeBaouleEngineError(error: unknown): string {
  if (error instanceof BaouleEngineError) return error.message
  if (error instanceof Error) return `Moteur baoulé : ${error.message}`
  return 'Moteur baoulé : erreur inconnue.'
}

/** Correspondance NllbErrorCode → code façade (messages préservés). */
function mapNllbError(error: unknown): BaouleEngineError {
  if (error instanceof BaouleEngineError) return error
  if (error instanceof NllbError) {
    const code: BaouleEngineErrorCode =
      error.code === 'NLLB_NOT_READY'
        ? 'BAOULE_TRANSLATOR_NOT_READY'
        : error.code === 'NLLB_UNSUPPORTED'
          ? 'BAOULE_UNSUPPORTED'
          : error.code === 'NLLB_EMPTY_INPUT'
            ? 'BAOULE_EMPTY_INPUT'
            : 'BAOULE_TRANSLATOR_ERROR'
    return new BaouleEngineError(code, error.message)
  }
  return new BaouleEngineError(
    'BAOULE_TRANSLATOR_ERROR',
    error instanceof Error ? error.message : String(error),
  )
}

// ── État et initialisation ─────────────────────────────────────────────────

/** État réel des trois maillons de la façade (B1/B2/B3). */
export type BaouleEngineStatus = {
  /** Écoute baoulé disponible (plateforme native + moteur initialisable). */
  sttReady: boolean
  /** Traducteur NLLB chargé OU déjà en cache (jamais de téléchargement ici). */
  translatorReady: boolean
  /** Voix pilote MMS installée (poids + tokenizer en cache). */
  voiceReady: boolean
}

/**
 * Sonde SANS effet de bord : ne télécharge rien, n'initialise rien.
 * sttReady indique ici la DISPONIBILITÉ de la plateforme (coque native) —
 * le chargement réel du moteur ASR se fait via initializeBaouleEngine.
 */
export async function getBaouleEngineStatus(): Promise<BaouleEngineStatus> {
  const [translatorReady, voiceReady] = await Promise.all([
    isNllbModelReady().catch(() => false),
    isMmsBciVoiceReady().catch(() => false),
  ])
  return {
    sttReady: isVoiceServicePlatformAvailable(),
    translatorReady,
    voiceReady,
  }
}

/** Les trois maillons sont-ils prêts ? (sonde sans effet de bord) */
export async function isBaouleEngineReady(): Promise<boolean> {
  const status = await getBaouleEngineStatus()
  return status.sttReady && status.translatorReady && status.voiceReady
}

/**
 * Initialise la façade SANS télécharger : charge le moteur ASR natif bci
 * (quelques secondes au premier appel) et sonde traducteur + voix. L'état
 * renvoyé dit EXACTEMENT ce qui manque — l'UI oriente vers les
 * installations opt-in (installBaouleTranslator / installBaouleVoice).
 */
export async function initializeBaouleEngine(): Promise<BaouleEngineStatus> {
  const [sttReady, translatorReady, voiceReady] = await Promise.all([
    isVoiceServicePlatformAvailable() ? initVoiceService('bci') : Promise.resolve(false),
    isNllbModelReady().catch(() => false),
    isMmsBciVoiceReady().catch(() => false),
  ])
  return { sttReady, translatorReady, voiceReady }
}

// ── B1 — écoute (transcribe) ───────────────────────────────────────────────

/**
 * Session STT baoulé push-to-talk (contrat STTSession du stack — même
 * convention que stt-factory). 100 % offline : l'audio reste sur
 * l'appareil. Hors plateforme native, ou moteur non embarqué dans ce
 * build : session INERTE dont le premier start() signale l'erreur
 * explicite — jamais de repli vers la reconnaissance française.
 */
export async function createBaouleTranscriptionSession(
  callbacks: STTCallbacks,
  options?: { maxDurationMs?: number; lang?: 'bci' | 'dyu' },
): Promise<STTSession> {
  return createVoiceServiceSingleShotSTT(callbacks, {
    lang: options?.lang ?? 'bci',
    maxDurationMs: options?.maxDurationMs,
  })
}

// ── B2/B4 — lien montant (translate + parse input) ────────────────────────

/**
 * Traduit un texte baoulé → français (B2). Lève BaouleEngineError typée ;
 * ne télécharge JAMAIS implicitement (BAOULE_TRANSLATOR_NOT_READY si le
 * traducteur n'est ni chargé ni en cache).
 */
export async function translateBaouleToFrench(text: string, options?: { timeoutMs?: number }): Promise<string> {
  try {
    return await translateText(text, { src: 'bci_Latn', tgt: 'fra_Latn', timeoutMs: options?.timeoutMs })
  } catch (error) {
    throw mapNllbError(error)
  }
}

/**
 * Jumelle dioula de translateBaouleToFrench : même modèle NLLB (un seul
 * téléchargement sert les deux langues), même contrat d'erreurs typées.
 */
export async function translateDioulaToFrench(text: string, options?: { timeoutMs?: number }): Promise<string> {
  try {
    return await translateText(text, { src: 'dyu_Latn', tgt: 'fra_Latn', timeoutMs: options?.timeoutMs })
  } catch (error) {
    throw mapNllbError(error)
  }
}

/**
 * Lien montant B4 : transcript STT → entrée de parseur. En session
 * baoulé, la traduction est OBLIGATOIRE (garde B2-022) — indisponible →
 * BaouleEngineError (BAOULE_TRANSLATOR_NOT_READY), jamais de baoulé brut.
 */
export async function prepareBaouleParserInput(transcript: string): Promise<{
  text: string
  sourceText: string
  translated: boolean
}> {
  try {
    return await resolveConversationInput(transcript)
  } catch (error) {
    throw mapNllbError(error)
  }
}

// ── B3/B4 — lien descendant (speak) ───────────────────────────────────────

/**
 * Narration d'une réponse Tata en session baoulé (B3+B4) : réponse fr →
 * NLLB fra→bci → voix pilote MMS (texte brut) ; échec de traduction →
 * narration française explicite hors chemin MMS + translationError.
 * Ne lève JAMAIS (une conversation ne meurt pas sur un maillon narration).
 */
export async function speakBaoule(frenchText: string, callback?: SpeakCallback): Promise<SpokenReply> {
  return narrateResponse(frenchText, callback)
}

// ── Installations opt-in (actions utilisateur explicites — réglages) ──────

/**
 * Télécharge le traducteur NLLB (~872 Mo — Wi-Fi recommandé) puis charge le
 * pipeline. Action utilisateur EXPLICITE uniquement (réglages voix).
 */
export async function installBaouleTranslator(onProgress?: (percent: number) => void): Promise<boolean> {
  try {
    return await downloadNllbModel(onProgress)
  } catch (error) {
    throw mapNllbError(error)
  }
}

/**
 * Télécharge la voix pilote MMS (fp32 114 Mo) — qualité limitée (donor
 * akan), voir .ai/EVAL_B3_TTS.md. Action utilisateur EXPLICITE uniquement.
 */
export async function installBaouleVoice(onProgress?: (percent: number) => void): Promise<boolean> {
  try {
    return await downloadMmsBciVoice(onProgress)
  } catch (error) {
    throw new BaouleEngineError(
      'BAOULE_VOICE_ERROR',
      error instanceof Error ? error.message : 'Téléchargement de la voix baoulé impossible.',
    )
  }
}
