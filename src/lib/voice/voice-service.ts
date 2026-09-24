/**
 * VoiceService — couche haut niveau au-dessus du pont natif Capacitor
 * `VoiceService` (Task 31, plugin local : VoiceServicePlugin.java).
 *
 * Rôle :
 *   1. Router par langue :
 *        'fr'  → FrenchRecognizer  (sherpa-onnx zipformer FR int8, batch
 *                push-to-talk avec métriques) ;
 *        'bci' → BaouleRecognizer  (Omnilingual ASR 1600 langues CTC 300M
 *                int8, bci_Latn — intégré Task 35 sur demande explicite du
 *                propriétaire, levant le verrou mission §18 ; le BENCHMARK.md
 *                du POC reste la validation qualité recommandée).
 *      Garde-fou : si le modèle Baoulé n'est pas embarqué dans le build (ou
 *      hors plateforme native), la route bci répond par une erreur EXPLICITE
 *      — jamais un fallback silencieux vers le français.
 *   2. Offrir aux consommateurs une session STTSession aux conventions du
 *      reste du stack (src/lib/voice/stt.ts).
 *   3. Sur web, retomber sur la même chaîne de secours que la factory
 *      Sherpa : Web Speech API (fr uniquement) ou erreur franche.
 *
 * 100 % local sur natif : aucune requête réseau, l'audio ne quitte jamais
 * l'appareil (contrainte absolue de la mission).
 */

import { Capacitor } from '@capacitor/core'

import {
  VoiceService,
  type VoiceEngineStatus,
  type VoiceLanguage,
  type VoiceRecognitionResult,
} from '../../plugins/voice-service'
import { createSingleShotSTT, isSTTAvailable, type STTCallbacks, type STTSession } from './stt'
import { voicePerfDebug } from './voice-perf'

export type { VoiceEngineStatus, VoiceLanguage, VoiceRecognitionResult }

/** Durée maximale d'enregistrement par défaut (cohérente avec le natif). */
export const VOICE_MAX_DURATION_MS = 30000

/**
 * Message de la route Baoulé/Dioula quand le moteur omnilingual n'est pas
 * disponible : modèle non embarqué dans ce build (apk allégé) ou erreur de
 * chargement. État documenté et explicite — jamais un fallback silencieux.
 * Les DEUX langues partagent le même moteur Omnilingual ASR.
 */
export const BAOULE_NOT_READY_MESSAGE =
  'Langue baoulé : le moteur Omnilingual ASR (bci_Latn) n\'est pas disponible sur ' +
  'cet appareil — le modèle n\'est pas embarqué dans cette installation de l\'application'

/** Message équivalent pour la route dioula (même moteur, même cause). */
export const DIOULA_NOT_READY_MESSAGE =
  'Langue dioula : le moteur Omnilingual ASR (dyu_Latn) n\'est pas disponible sur ' +
  'cet appareil — le modèle n\'est pas embarqué dans cette installation de l\'application'

/**
 * Message du mode écoute continue en Baoulé : le modèle omnilingual CTC est
 * un moteur offline (utterance complète), l'écoute continue reste assurée
 * par le moteur français Sherpa streaming uniquement.
 */
export const BAOULE_CONTINUOUS_UNAVAILABLE_MESSAGE =
  'Langue baoulé : indisponible en écoute continue — utilisez le bouton vocal '
  + '(push-to-talk) pour dicter en Baoulé'

/** Équivalent dioula (même moteur omnilingual, même limite push-to-talk). */
export const DIOULA_CONTINUOUS_UNAVAILABLE_MESSAGE =
  'Langue dioula : indisponible en écoute continue — utilisez le bouton vocal '
  + '(push-to-talk) pour dicter en Dioula'

/**
 * Message du code PACK_MISSING (MODE-953) : le modèle n'est ni embarqué au
 * build (full) ni présent sur le disque (pack non installé dans un build
 * allégé) — l'action utilisateur est claire : installer le pack via les
 * réglages voix (consentement explicite, Sprint V).
 */
export const PACK_MISSING_MESSAGE =
  'Le pack vocal nécessaire n\'est pas installé sur cet appareil — '
  + 'installez-le depuis Réglages → Voix & Langue (téléchargement unique, '
  + 'recommandé en Wi-Fi)'

// --- État d'initialisation du pont natif (caché au consommateur) ---

let _initializedLang: VoiceLanguage | null = null
let _initPromise: Promise<boolean> | null = null

/** La coque native est-elle présente ? (faux dans un navigateur) */
export function isVoiceServicePlatformAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * État natif exact (diagnostics / écran de statut). null hors plateforme
 * native ou si le bridge échoue.
 */
export async function getVoiceServiceStatus(): Promise<VoiceEngineStatus | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return await VoiceService.isReady()
  } catch {
    return null
  }
}

/**
 * Sonde MODE-953 — le modèle de la langue demandée est-il présent sur
 * l'appareil (assets du build full OU disque après installation du pack) ?
 * SANS charger le moteur (quelques ms contre des secondes d'initialize).
 * Web → { available: false, source: 'none' } (le pont web répond pareil,
 * ce wrapper court-circuite simplement le bridge). Échec bridge → réponse
 * « none » honnête : une sonde ne doit jamais lever.
 */
export async function probeVoiceModelAvailability(
  lang: VoiceLanguage,
): Promise<{ available: boolean; source: 'assets' | 'disk' | 'none' }> {
  if (!Capacitor.isNativePlatform()) return { available: false, source: 'none' }
  try {
    const result = await VoiceService.isModelAvailable({ language: lang })
    return {
      available: !!result.available,
      source: result.source === 'assets' || result.source === 'disk' ? result.source : 'none',
    }
  } catch {
    return { available: false, source: 'none' }
  }
}

/**
 * Initialise le moteur pour la langue demandée (idempotent, avec anti-race).
 * Retourne true si le moteur est PRÊT à transcrire :
 *   - 'fr'  : modèle sherpa-onnx zipformer chargé (~1–2 s au premier appel) ;
 *   - 'bci' : modèle omnilingual CTC chargé (quelques secondes au premier
 *     appel). Échoue (false) si le modèle Baoulé n'est pas embarqué dans le
 *     build — l'erreur native BAOULE_NOT_READY reste consultable via les
 *     logs/diagnostics.
 *
 * Anti-race MODE-962 — déduplication PAR LANGUE :
 *   - même langue déjà prête → true immédiat (aucun appel natif) ;
 *   - initialisation en vol pour la MÊME langue → la promesse en cours est
 *     retournée (un seul chargement, même sous clics répétés du micro) ;
 *   - initialisation en vol pour une AUTRE langue → elle se termine D'ABORD,
 *     puis la nôtre démarre : jamais deux initialisations lourdes
 *     concurrentes, et jamais une promesse d'une autre langue résolue comme
 *     si de rien n'était (bci en vol + demande dyu = chargement dyu réel,
 *     séquentiel).
 *
 * Réutilisation Omnilingual bci↔dyu : côté natif, le plugin Android
 * (VoiceServicePlugin.initialize) ne recharge PAS le modèle quand le
 * recognizer omnilingual est déjà chargé — bci↔dyu est une simple bascule
 * d'étiquette (engineLanguage) sans rechargement des ~349 Mo.
 */
export async function initVoiceService(lang: VoiceLanguage = 'fr'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (_initializedLang === lang) return true
  if (_initPromise) {
    return _initPromise.then(() =>
      _initializedLang === lang ? true : initVoiceService(lang),
    )
  }

  const startedAt = performance.now()
  _initPromise = (async () => {
    try {
      // Le natif charge le modèle sur thread dédié et résout UNIQUEMENT
      // quand il est prêt ; reject (BAOULE_NOT_READY / ENGINE_ERROR) sinon.
      await VoiceService.initialize({ language: lang })
      _initializedLang = lang
      voicePerfDebug('asr_load_ms', performance.now() - startedAt, { language: lang })
      return true
    } catch {
      return false
    } finally {
      _initPromise = null
    }
  })()
  return _initPromise
}

/** @internal seam de test — remet à zéro l'état d'initialisation mémorisé. */
export function resetVoiceServiceStateForTests(): void {
  _initializedLang = null
  _initPromise = null
}

/**
 * Traduit une erreur du pont natif (message préfixé par son code, mission §15)
 * en message utilisateur français. Exportée pour les tests et les écrans qui
 * gèrent eux-mêmes le bridge brut.
 */
export function mapVoiceServiceError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (raw.includes('BAOULE_NOT_READY')) return BAOULE_NOT_READY_MESSAGE
  if (raw.includes('PACK_MISSING')) return PACK_MISSING_MESSAGE
  if (raw.includes('PERMISSION_DENIED')) {
    return 'Micro non autorisé — accordez la permission microphone à Jùlaba'
  }
  if (raw.includes('MIC_UNAVAILABLE')) return 'Micro indisponible sur cet appareil'
  if (raw.includes('ENGINE_NOT_INITIALIZED')) {
    return 'Moteur vocal non initialisé — réessayez dans un instant'
  }
  if (raw.includes('ALREADY_RECORDING')) return 'Un enregistrement est déjà en cours'
  if (raw.includes('NO_RECORDING')) return 'Aucun audio enregistré'
  if (raw.includes('ENGINE_ERROR')) {
    return `Erreur du moteur vocal : ${raw.replace(/^.*ENGINE_ERROR:\s*/, '')}`
  }
  return raw
}

/**
 * Session single-shot push-to-talk pilotée par le VoiceService natif :
 *   start() → startRecording (le micro s'ouvre, l'audio reste sur l'appareil)
 *   stop()  → stopRecording + transcribe → UN onResult final (texte + RTF
 *             natif, confidence 0.9 non calibrée — même convention que la
 *             factory Sherpa) puis onEnd.
 *
 * Compatibilité STTSession (src/lib/voice/stt.ts) : consommable partout où
 * createSingleShotSTT/createSmartSingleShotSTT l'est déjà. Branché dans
 * stt-factory (Task 32) — c'est la tête de chaîne single-shot sur natif.
 *
 * Routing :
 *   - natif 'fr' → VoiceServicePlugin (sherpa batch) ; 'bci' ET 'dyu' →
 *     le MÊME moteur omnilingual offline (erreur explicite si le modèle
 *     n'est pas embarqué) ;
 *   - web 'bci'/'dyu'    → session inerte avec erreur explicite (aucun
 *     moteur omnilingual web — surtout PAS de reconnaissance française) ;
 *   - web 'fr'           → Web Speech API si disponible, sinon session
 *     inerte « Aucun moteur STT disponible ».
 */
export async function createVoiceServiceSingleShotSTT(
  callbacks: STTCallbacks,
  options?: { lang?: VoiceLanguage; maxDurationMs?: number }
): Promise<STTSession> {
  const lang: VoiceLanguage = options?.lang ?? 'fr'
  const maxDurationMs = options?.maxDurationMs ?? VOICE_MAX_DURATION_MS

  // --- Web : langues omnilingual = erreur explicite ; fr = chaîne de secours ---
  if (!Capacitor.isNativePlatform()) {
    if (lang === 'bci' || lang === 'dyu') {
      return inertSession(lang === 'dyu' ? DIOULA_NOT_READY_MESSAGE : BAOULE_NOT_READY_MESSAGE, callbacks)
    }
    if (isSTTAvailable()) {
      return createSingleShotSTT(callbacks, { lang: 'fr-FR' })
    }
    return inertSession('Aucun moteur STT disponible', callbacks)
  }

  // --- Natif : sonde légère (MODE-953) AVANT toute initialisation lourde ---
  // bci/dyu : le modèle peut être un pack téléchargeable absent de
  // l'appareil — le probe (quelques ms, SANS chargement) répond PACK_MISSING
  // explicitement sans lancer un initialize voué à l'échec. 'fr' : modèle
  // embarqué au build, chemin historique inchangé (aucun probe).
  if (lang === 'bci' || lang === 'dyu') {
    const availability = await probeVoiceModelAvailability(lang)
    if (!availability.available) {
      return inertSession(PACK_MISSING_MESSAGE, callbacks)
    }
  }

  // --- Natif : initialise le moteur de la langue demandée si nécessaire ---
  const ready = await initVoiceService(lang)
  if (!ready) {
    return inertSession(
      lang === 'bci' ? BAOULE_NOT_READY_MESSAGE
        : lang === 'dyu' ? DIOULA_NOT_READY_MESSAGE
          : 'Aucun moteur STT disponible',
      callbacks
    )
  }

  let listening = false
  let startPromise: Promise<void> | null = null
  let sessionId = 0
  let ended = false

  const finish = () => {
    if (ended) return
    ended = true
    callbacks.onEnd?.()
  }

  return {
    start: () => {
      if (listening || startPromise) return
      listening = true
      ended = false
      const currentSession = ++sessionId

      startPromise = (async () => {
        try {
          await VoiceService.startRecording({ maxDurationMs })

          // Le bouton peut être relâché avant que le bridge Capacitor ait
          // terminé startRecording(). Dans ce cas, ne jamais laisser le
          // microphone démarrer « après coup » : on arrête immédiatement
          // l'enregistrement devenu orphelin.
          if (currentSession !== sessionId || !listening) {
            await VoiceService.stopRecording().catch(() => {})
            return
          }
        } catch (err) {
          if (currentSession === sessionId) {
            listening = false
            callbacks.onError?.(mapVoiceServiceError(err))
            finish()
          }
        } finally {
          if (currentSession === sessionId) startPromise = null
        }
      })()
    },

    stop: () => {
      if (!listening && !startPromise) return

      const currentSession = sessionId
      listening = false

      void (async () => {
        try {
          // CRITIQUE : attendre la fin de startRecording() avant
          // stopRecording(). Sinon stop pouvait arriver trop tôt, recevoir
          // NO_RECORDING, puis startRecording() ouvrait le micro après coup.
          const pendingStart = startPromise
          if (pendingStart) await pendingStart

          if (currentSession !== sessionId) return
          await VoiceService.stopRecording()

          if (currentSession !== sessionId) return
          const result: VoiceRecognitionResult =
            await VoiceService.transcribe({ language: lang })

          if (currentSession !== sessionId) return
          callbacks.onResult({
            transcript: result.text,
            confidence: 0.9,
            isFinal: true,
          })
        } catch (err) {
          if (currentSession === sessionId) {
            callbacks.onError?.(mapVoiceServiceError(err))
          }
        } finally {
          if (currentSession === sessionId) {
            startPromise = null
            finish()
          }
        }
      })()
    },

    abort: () => {
      if (!listening && !startPromise) return

      // Invalide immédiatement toute opération encore en vol.
      ++sessionId
      listening = false

      const pendingStart = startPromise
      void (async () => {
        try {
          if (pendingStart) await pendingStart
          // Si startRecording() avait finalement réussi, stopRecording()
          // ferme le micro. S'il n'avait pas démarré, l'erreur est ignorée.
          await VoiceService.stopRecording().catch(() => {})
        } finally {
          startPromise = null
          finish()
        }
      })()
    },

    isListening: () => listening,
  }
}

/** Session sans moteur : signale l'échec une seule fois, au premier start(). */
function inertSession(message: string, callbacks: STTCallbacks): STTSession {
  let fired = false
  return {
    start: () => {
      if (fired) return
      fired = true
      callbacks.onError?.(message)
      callbacks.onEnd?.()
    },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}
