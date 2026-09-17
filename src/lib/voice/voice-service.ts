/**
 * VoiceService — couche haut niveau au-dessus du pont natif Capacitor
 * `VoiceService` (Task 31, plugin local : VoiceServicePlugin.java).
 *
 * Rôle :
 *   1. Router par langue selon l'architecture cible de la mission POC Baoulé :
 *        'fr'  → FrenchRecognizer  (sherpa-onnx, mode batch push-to-talk, prêt)
 *        'bci' → BaouleRecognizer  (Omnilingual ASR bci_Latn) — emplacement
 *                RÉSERVÉ : tant que le benchmark du POC indépendant
 *                (julaba-baoule-asr-poc, docs/BENCHMARK.md) n'est pas validé
 *                sur appareil réel, la route bci répond par une erreur
 *                EXPLICITE (mission §18 : pas d'intégration avant rapport
 *                reproductible) — jamais un fallback silencieux vers le
 *                français ni une reconnaissance fantôme.
 *   2. Offrir aux consommateurs une session STTSession aux conventions du
 *      reste du stack (src/lib/voice/stt.ts), pour un branchement futur
 *      trivial dans stt-factory (préparation seule — les consommateurs
 *      existants ne sont PAS rewirés dans cette tâche).
 *   3. Sur web, retomber sur la même chaîne de secours que la factory
 *      Sherpa : Web Speech API (en ligne) ou erreur franche.
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

export type { VoiceEngineStatus, VoiceLanguage, VoiceRecognitionResult }

/** Durée maximale d'enregistrement par défaut (cohérente avec le natif). */
export const VOICE_MAX_DURATION_MS = 30000

/**
 * Message de la route Baoulé tant que le moteur n'est pas intégré. Volontairement
 * explicite pour l'utilisateur comme pour le développeur : c'est un état
 * documenté du produit (POC en cours d'évaluation), pas un bug.
 */
export const BAOULE_NOT_READY_MESSAGE =
  'Langue baoulé : le moteur Omnilingual ASR (bci_Latn) n\'est pas encore intégré — ' +
  'en attente de la validation du benchmark du POC (julaba-baoule-asr-poc, docs/BENCHMARK.md)'

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
 * Initialise le moteur pour la langue demandée (idempotent, avec anti-race).
 * Retourne true si le moteur est PRÊT à transcrire :
 *   - 'fr'  : modèle sherpa-onnx chargé (~1–2 s au premier appel) ;
 *   - 'bci' : slot réservé mais moteur indisponible → false (état documenté,
 *     voir BAOULE_NOT_READY_MESSAGE).
 */
export async function initVoiceService(lang: VoiceLanguage = 'fr'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (_initializedLang === lang) return lang === 'fr'
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      await VoiceService.initialize({ language: lang })
      _initializedLang = lang
      // 'bci' : initialize() réussit (slot réservé) mais rien ne transcrit
      // tant que le benchmark du POC n'est pas validé → non prêt.
      return lang === 'fr'
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
 * createSingleShotSTT/createSmartSingleShotSTT l'est déjà. PAS encore
 * branché dans stt-factory (préparation seule — Task 31).
 *
 * Routing :
 *   - lang 'bci' → session inerte qui signale l'état Baoulé (voir ci-dessus) ;
 *   - web        → Web Speech API si disponible, sinon session inerte
 *                  « Aucun moteur STT disponible » (même message que la
 *                  factory, pour des tests et UX cohérents) ;
 *   - natif 'fr' → VoiceServicePlugin (offline garanti).
 */
export async function createVoiceServiceSingleShotSTT(
  callbacks: STTCallbacks,
  options?: { lang?: VoiceLanguage; maxDurationMs?: number }
): Promise<STTSession> {
  const lang: VoiceLanguage = options?.lang ?? 'fr'
  const maxDurationMs = options?.maxDurationMs ?? VOICE_MAX_DURATION_MS

  // --- Route Baoulé : emplacement réservé, erreur explicite (mission §18) ---
  if (lang === 'bci') {
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

  // --- Web : même chaîne de secours que la factory Sherpa ---
  if (!Capacitor.isNativePlatform()) {
    if (isSTTAvailable()) {
      return createSingleShotSTT(callbacks, { lang: 'fr-FR' })
    }
    return inertSession('Aucun moteur STT disponible', callbacks)
  }

  // --- Natif : initialise le moteur français si nécessaire ---
  const ready = await initVoiceService(lang)
  if (!ready) {
    return inertSession('Aucun moteur STT disponible', callbacks)
  }

  let listening = false
  // Déféré après un abort() : la chaîne stop→transcribe déjà en vol doit se
  // terminer sans produire de résultat ni d'erreur parasite.
  let discardNext = false

  return {
    start: () => {
      if (listening) return
      listening = true
      discardNext = false
      void (async () => {
        try {
          await VoiceService.startRecording({ maxDurationMs })
        } catch (err) {
          listening = false
          if (!discardNext) callbacks.onError?.(mapVoiceServiceError(err))
          else discardNext = false
          callbacks.onEnd?.()
        }
      })()
    },
    stop: () => {
      if (!listening) return
      listening = false
      void (async () => {
        try {
          await VoiceService.stopRecording()
          if (discardNext) return
          const result: VoiceRecognitionResult = await VoiceService.transcribe()
          if (discardNext) return
          callbacks.onResult({
            transcript: result.text,
            confidence: 0.9,
            isFinal: true,
          })
        } catch (err) {
          if (!discardNext) callbacks.onError?.(mapVoiceServiceError(err))
        } finally {
          discardNext = false
          callbacks.onEnd?.()
        }
      })()
    },
    abort: () => {
      if (!listening) return
      listening = false
      discardNext = true
      void VoiceService.stopRecording()
        .catch(() => { /* déjà arrêté */ })
        .finally(() => { callbacks.onEnd?.() })
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
