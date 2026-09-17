/**
 * STT Factory — decides between Sherpa-ONNX (offline) and Web Speech API (online).
 * Provides a unified interface for all STT consumers in the app.
 */

import { SherpaStt } from './sherpa-stt'
import { createSingleShotSTT, createContinuousSTT, isSTTAvailable, type STTCallbacks, type STTSession } from './stt'
import { Capacitor } from '@capacitor/core'
import {
  createVoiceServiceSingleShotSTT,
  initVoiceService,
  BAOULE_NOT_READY_MESSAGE,
} from './voice-service'
import { getSelectedVoiceLanguage, type SelectedVoiceLanguage } from '../stores/voice-language-store'

/**
 * Normalise une langue demandée vers la langue VoiceService ('fr' | 'bci').
 * 'fr-FR', 'fr', undefined… → 'fr' ; 'bci', 'bci-Latn', 'bci_Latn' → 'bci'.
 */
export function normalizeVoiceLanguage(lang?: string): SelectedVoiceLanguage {
  if (lang && lang.toLowerCase().startsWith('bci')) return 'bci'
  return 'fr'
}

/**
 * Langue effective d'une nouvelle session : options.lang explicite
 * (consommateurs spécialisés) SINON le sélecteur de langue global
 * (voice-language-store, persisté — modale vocale « Français / Baoulé »).
 */
function resolveSessionLanguage(options?: { lang?: string }): SelectedVoiceLanguage {
  return options?.lang ? normalizeVoiceLanguage(options.lang) : getSelectedVoiceLanguage()
}

/**
 * Porte d'affichage des boutons micro : vaut true dès qu'un moteur PEUT
 * être tenté. Sur coque native, le VoiceService (Task 31) charge son
 * moteur à la première utilisation — la voix est donc toujours tentative
 * là-bas, même avant tout chargement de modèle (les erreurs réelles sont
 * signalées explicitement par la session, cf. describeSTTError).
 */
export function canAttemptSTT(): boolean {
  return isSTTAvailable() || _sherpaState === 'ready' || Capacitor.isNativePlatform()
}

const KNOWN_STT_CODES = new Set([
  'no-speech', 'aborted', 'not-allowed', 'service-not-allowed',
  'audio-capture', 'network', 'failed',
])

/**
 * Traduit une erreur de session STT en message utilisateur.
 * - codes connus (Web Speech + sessions historiques) → message français dédié ;
 * - toute autre chaîne est déjà un message formulé (VoiceService :
 *   mapVoiceServiceError, BAOULE_NOT_READY_MESSAGE…) → affichée TELLE QUELLE
 *   — jamais écrasée par un générique « Je n'ai pas bien entendu ».
 */
export function describeSTTError(err: string): string {
  if (err === 'no-speech') return "Je n'ai rien entendu. Réessayez."
  if (err === 'not-allowed' || err === 'service-not-allowed') return 'Micro non autorisé.'
  if (err === 'audio-capture') return 'Aucun micro détecté.'
  if (err === 'network') {
    return 'Connexion internet nécessaire pour la reconnaissance vocale. Vérifiez votre réseau.'
  }
  if (KNOWN_STT_CODES.has(err)) return "Je n'ai pas bien entendu. Réessayez."
  return err
}

// Re-export STTSession type for consumers
export type { STTSession } from './stt'

// Sherpa model path on device (bundled in assets)
const SHERPA_MODEL_PATH = 'models/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8'

/**
 * Observable lifecycle of the offline Sherpa engine:
 * - 'unknown'     : never probed (no native bridge call made yet)
 * - 'loading'     : initModel() in flight
 * - 'ready'       : model loaded — offline recognition is usable right now
 * - 'unavailable' : no native platform, bridge error, or failed init
 */
export type SherpaState = 'unknown' | 'loading' | 'ready' | 'unavailable'

let _sherpaAvailable: boolean | null = null
let _sherpaModelLoaded = false
let _sherpaState: SherpaState = 'unknown'

/**
 * Check if Sherpa-ONNX is available and the model is loaded.
 * Caches the result after the first call.
 */
export async function isSherpaAvailable(): Promise<boolean> {
  // SherpaStt is a native Capacitor plugin and has no web implementation.
  // Never call the bridge in a browser; use Web Speech there instead.
  if (!Capacitor.isNativePlatform()) {
    _sherpaState = 'unavailable'
    return false
  }
  if (_sherpaAvailable !== null) return _sherpaAvailable
  try {
    const result = await SherpaStt.isAvailable()
    _sherpaAvailable = result.available
    _sherpaModelLoaded = result.modelLoaded
    _sherpaState = result.available ? 'ready' : 'unavailable'
    return result.available
  } catch {
    _sherpaAvailable = false
    _sherpaState = 'unavailable'
    return false
  }
}

/**
 * Initialize the Sherpa model if not already loaded.
 * Returns true if successful. Safe to call repeatedly and early in the
 * app lifecycle (login screens, wake-word manager) — offline devices need
 * the model warm BEFORE the first voice interaction, not after it failed.
 */
export async function initSherpaModel(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    _sherpaState = 'unavailable'
    return false
  }
  if (_sherpaModelLoaded) {
    _sherpaState = 'ready'
    return true
  }
  _sherpaState = 'loading'
  try {
    await SherpaStt.initModel({ modelPath: SHERPA_MODEL_PATH })
    _sherpaModelLoaded = true
    _sherpaAvailable = true
    _sherpaState = 'ready'
    return true
  } catch (err) {
    console.warn('[stt-factory] Failed to init Sherpa model:', err)
    _sherpaAvailable = false
    _sherpaState = 'unavailable'
    return false
  }
}

/**
 * Synchronous check: is any STT engine usable right now?
 *
 * Historically this only tested the Web Speech API — an ONLINE engine — so
 * on an offline device (or a WebView without Web Speech) every voice entry
 * point was gated off even though the offline Sherpa chain existed. It now
 * also reports a Sherpa model that finished loading: the gate matches the
 * engines the app can actually speak through.
 */
export function isAnySTTAvailable(): boolean {
  return isSTTAvailable() || _sherpaState === 'ready'
}

/** Rich, synchronous availability snapshot (for diagnostics / settings UI). */
export function getSTTStatus(): { webspeech: boolean; sherpa: SherpaState } {
  return { webspeech: isSTTAvailable(), sherpa: _sherpaState }
}

/** @internal test seam — reset cached Sherpa state between unit tests. */
export function resetSherpaStateForTests(): void {
  _sherpaAvailable = null
  _sherpaModelLoaded = false
  _sherpaState = 'unknown'
}

/**
 * Sherpa-backed single-shot STT session (fully offline): one final result,
 * then the session ends.
 */
function createSherpaSingleShotSTT(
  callbacks: STTCallbacks,
  _options?: { lang?: string; maxAlternatives?: number }
): STTSession {
  let listening = false
  let removeListener: (() => Promise<void>) | null = null

  const start = async () => {
    if (listening) return
    listening = true
    try {
      const handle = await SherpaStt.addListener('sttResult', (data) => {
        if (data.isFinal && data.transcript) {
          callbacks.onResult({
            transcript: data.transcript,
            confidence: 0.9,
            isFinal: true,
          })
          callbacks.onEnd?.()
          listening = false
        }
      })
      removeListener = () => handle.remove()
      await SherpaStt.startRecognition()
    } catch (err) {
      listening = false
      callbacks.onError?.(`Sherpa STT error: ${err}`)
      callbacks.onEnd?.()
    }
  }

  const stop = async () => {
    if (!listening) return
    listening = false
    try {
      await SherpaStt.stopRecognition()
    } catch { /* already stopped */ }
    if (removeListener) {
      await removeListener()
      removeListener = null
    }
  }

  const abort = () => {
    stop()
  }

  return {
    start: () => { start() },
    stop,
    abort,
    isListening: () => listening,
  }
}

/**
 * Sherpa-backed CONTINUOUS STT session (fully offline).
 *
 * The plugin exposes a single-shot recognizer: after each final result the
 * engine stops. A wake-word listener must survive its own results, so this
 * wrapper immediately restarts recognition after every final transcript
 * until stop()/abort() is called. Without it, the background "Julaba"
 * listener went permanently deaf after the first recognized phrase.
 */
function createSherpaContinuousSTT(
  callbacks: STTCallbacks,
  _options?: { lang?: string; maxAlternatives?: number; interimResults?: boolean }
): STTSession {
  let listening = false
  let shouldListen = false
  let removeListener: (() => Promise<void>) | null = null

  const startOnce = async () => {
    try {
      const handle = await SherpaStt.addListener('sttResult', (data) => {
        if (data.isFinal && data.transcript) {
          callbacks.onResult({
            transcript: data.transcript,
            confidence: 0.9,
            isFinal: true,
          })
          // Loop: the engine stopped after emitting this final result —
          // restart so the background listener keeps listening.
          if (shouldListen) {
            SherpaStt.startRecognition().catch(() => { /* next result retries */ })
          }
        }
      })
      removeListener = () => handle.remove()
      await SherpaStt.startRecognition()
    } catch (err) {
      listening = false
      shouldListen = false
      callbacks.onError?.(`Sherpa STT error: ${err}`)
      callbacks.onEnd?.()
    }
  }

  const stop = async () => {
    shouldListen = false
    listening = false
    try {
      await SherpaStt.stopRecognition()
    } catch { /* already stopped */ }
    if (removeListener) {
      await removeListener()
      removeListener = null
    }
  }

  return {
    start: () => {
      if (listening) return
      listening = true
      shouldListen = true
      void startOnce()
    },
    stop,
    abort: () => { void stop() },
    isListening: () => listening,
  }
}

/**
 * Create a single-shot STT session.
 *
 * Chaîne de routage (Task 32 — VoiceService branché) :
 *   - lang 'bci' (Baoulé) → route DÉDIÉE VoiceService, sans fallback :
 *     erreur explicite BAOULE_NOT_READY tant que le benchmark du POC
 *     julaba-baoule-asr-poc n'est pas validé (mission §18) — jamais un
 *     fallback silencieux vers le français ;
 *   - lang 'fr' sur natif → VoiceService d'abord (batch push-to-talk
 *     offline, métriques RTF), puis Sherpa streaming, puis Web Speech ;
 *   - lang 'fr' sur web → chaîne historique (Web Speech).
 *
 * La langue vient de options.lang, sinon du sélecteur global
 * (voice-language-store).
 */
export async function createSmartSingleShotSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string; maxAlternatives?: number }
): Promise<STTSession> {
  const language = resolveSessionLanguage(options)

  // Baoulé — slot réservé, erreur explicite, aucun fallback (mission §18)
  if (language === 'bci') {
    return createVoiceServiceSingleShotSTT(callbacks, { lang: 'bci' })
  }

  // Français sur natif — VoiceService en premier (moteur batch avec RTF)
  if (Capacitor.isNativePlatform() && (await initVoiceService('fr'))) {
    return createVoiceServiceSingleShotSTT(callbacks, { lang: 'fr' })
  }

  // Try Sherpa next (offline-capable)
  if (await isSherpaAvailable()) {
    return createSherpaSingleShotSTT(callbacks, options)
  }

  // Try to init Sherpa model if not yet loaded
  if (await initSherpaModel()) {
    return createSherpaSingleShotSTT(callbacks, options)
  }

  // Fallback to Web Speech API (requires network)
  if (isSTTAvailable()) {
    return createSingleShotSTT(callbacks, options)
  }

  // Neither available
  return {
    start: () => { callbacks.onError?.('Aucun moteur STT disponible') },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}

/**
 * Create a continuous STT session, preferring Sherpa (offline) when available.
 * Falls back to Web Speech API if Sherpa is not available.
 *
 * NOTE Task 32 : le continu (mot d'appel) reste sur Sherpa streaming —
 * le VoiceService est un moteur batch push-to-talk. Une demande continue
 * en Baoulé est refusée explicitement (même règle mission §18).
 */
export async function createSmartContinuousSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string; maxAlternatives?: number; interimResults?: boolean }
): Promise<STTSession> {
  if (resolveSessionLanguage(options) === 'bci') {
    return {
      start: () => {
        callbacks.onError?.(BAOULE_NOT_READY_MESSAGE)
        callbacks.onEnd?.()
      },
      stop: () => {},
      abort: () => {},
      isListening: () => false,
    }
  }
  // Try Sherpa first (offline-capable) — continuous variant restarts after
  // each final result (see createSherpaContinuousSTT).
  if (await isSherpaAvailable()) {
    return createSherpaContinuousSTT(callbacks, options)
  }

  // Try to init Sherpa model if not yet loaded
  if (await initSherpaModel()) {
    return createSherpaContinuousSTT(callbacks, options)
  }

  // Fallback to Web Speech API (requires network)
  if (isSTTAvailable()) {
    return createContinuousSTT(callbacks, options)
  }

  // Neither available
  return {
    start: () => { callbacks.onError?.('Aucun moteur STT disponible') },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}
