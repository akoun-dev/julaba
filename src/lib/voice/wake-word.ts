// Jùlaba Wake Word Detection Service
// Continuously listens for the word "Julaba" and triggers the voice modal

import { createSmartContinuousSTT, isAnySTTAvailable, initSherpaModel, type STTSession } from './stt-factory'
import { playBeep, tataSpeak, haptic } from './tata-tts'

// Wake word patterns — handles variations in pronunciation/spelling.
// Note: "djoula" (without the final -ba) is deliberately excluded — it's
// the common French name for the Dioula language/ethnic group and would
// false-trigger on completely unrelated conversation.
const WAKE_WORD_PATTERNS = [
  /julaba/i,
  /djulaba/i,
  /jula ba/i,
  /jou laba/i,
]

export type WakeWordState =
  | 'inactive'    // Wake word feature is disabled in settings
  | 'unavailable' // STT not supported by browser
  | 'listening'   // Background listener is active, waiting for wake word
  | 'detected'    // Wake word just detected, modal opening
  | 'error'       // Listener crashed

let session: STTSession | null = null
let _state: WakeWordState = 'inactive'
let _onWake: (() => void) | null = null
let _stateListeners: Set<(state: WakeWordState) => void> = new Set()
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
// 10 s "retour à l'écoute" armé après une détection — doit être annulé si le
// listener s'arrête entre-temps (logout, réglage voix coupé), sinon il
// ressuscite une session morte (fuite de timer, cf. audit F10).
let _resetTimer: ReturnType<typeof setTimeout> | null = null
// Pause demandée par une modale vocale (audit VOCAL-604) : DOIT être
// respectée même si un startWakeWordListener() est encore en vol
// (await initSherpaModel) — sinon la session est créée APRÈS la pause et
// le micro de fond reste actif pendant la modale (contention de micro,
// auto-détection parasite).
let _paused = false

/**
 * Check if a transcript contains the wake word
 */
function containsWakeWord(text: string): boolean {
  return WAKE_WORD_PATTERNS.some(pattern => {
    pattern.lastIndex = 0 // reset to avoid /g flag state issues
    return pattern.test(text)
  })
}

/**
 * Get current wake word listener state
 */
export function getWakeWordState(): WakeWordState {
  return _state
}

/**
 * Set callback when wake word is detected
 */
export function onWakeDetected(callback: () => void) {
  _onWake = callback
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 */
export function onWakeStateChange(callback: (state: WakeWordState) => void): () => void {
  _stateListeners.add(callback)
  callback(_state) // emit current state immediately
  return () => _stateListeners.delete(callback)
}

function setState(newState: WakeWordState) {
  if (_state === newState) return
  _state = newState
  _stateListeners.forEach(cb => cb(newState))
}

/**
 * Start the wake word listener.
 * Should be called after authentication.
 */
export async function startWakeWordListener() {
  // Stop any existing session
  stopWakeWordListener()

  // Warm the offline model BEFORE gating: on a native device without
  // network (the primary field scenario) Web Speech is dead and the model
  // may not be loaded yet — without this await the listener reports
  // 'unavailable' for a capability the device actually has.
  await initSherpaModel()

  // Une pause demandée PENDANT le chargement du modèle annule le
  // démarrage (audit VOCAL-604) — la modale qui a appelé pauseWakeWord()
  // pendant cet await ne doit jamais hériter d'un listener de fond.
  if (_paused) {
    setState('inactive')
    return
  }

  if (!isAnySTTAvailable()) {
    setState('unavailable')
    return
  }

  setState('listening')

  try {
    session = await createSmartContinuousSTT(
      {
        onResult: (result) => {
          // Only check final results for wake word (interim can be noisy)
          if (!result.isFinal) return

          const text = result.transcript.trim()
          if (!text) return

          if (containsWakeWord(text)) {
            handleWakeWordDetected(text)
          }
        },
        onError: (error) => {
          // If it's a serious error, mark as error state
          if (error !== 'no-speech' && error !== 'aborted') {
            if (error === 'network') {
              setState('unavailable')
              return
            }
            console.warn('[WakeWord] STT error:', error)
            setState('error')
          }
        },
        onEnd: () => {
          // Continuous STT auto-restarts, but if it stopped unexpectedly
          if (_state === 'listening') {
            // Will auto-restart by the continuous STT implementation
          }
        },
      },
      { lang: 'fr-FR' }
    )

    session.start()
  } catch (err) {
    console.warn('[WakeWord] Failed to create STT session:', err)
    setState('error')
  }
}

/**
 * Stop the wake word listener.
 * Should be called on logout or when voice is disabled.
 */
export function stopWakeWordListener() {
  if (session) {
    session.abort()
    session = null
  }
  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
  if (_resetTimer) {
    clearTimeout(_resetTimer)
    _resetTimer = null
  }
  if (_state !== 'inactive') {
    setState('inactive')
  }
}

/**
 * Temporarily pause wake word while voice modal is open
 * (to avoid detecting "Julaba" in Tata's TTS output)
 *
 * Audit VOCAL-604 : la pause est un ÉTAT (_paused), plus un simple abort
 * ponctuel — elle annule aussi un startWakeWordListener() encore en vol,
 * sinon le listener repartait après la pause (session créée pendant
 * l'await initSherpaModel).
 */
export function pauseWakeWord() {
  _paused = true
  if (session) {
    session.abort()
  }
  if (_state === 'listening') {
    setState('inactive')
  }
}

/**
 * Resume wake word after voice modal is closed
 */
export function resumeWakeWord() {
  if (!_onWake) return
  _paused = false
  if (isAnySTTAvailable()) {
    void startWakeWordListener()
  }
}

function handleWakeWordDetected(transcript: string) {
  // Debounce: don't trigger twice within 5 seconds
  if (_debounceTimer) return

  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
  }, 5000)

  setState('detected')
  playBeep('success')
  haptic('success')

  // Pause the background listener while the modal is open
  if (session) {
    session.abort()
  }

  // Speak a brief acknowledgment then open the modal
  tataSpeak('Oui, je vous écoute !', () => {
    _onWake?.()
    // Resume wake word after modal closes (the modal component handles this)
  })

  // Reset to listening after a timeout (in case modal doesn't open).
  // Kept in a module handle and cancelled by stopWakeWordListener so the
  // timer can never outlive the listener itself (audit F10).
  if (_resetTimer) clearTimeout(_resetTimer)
  _resetTimer = setTimeout(() => {
    _resetTimer = null
    if (_state === 'detected') {
      setState('listening')
      session?.start()
    }
  }, 10000)
}
