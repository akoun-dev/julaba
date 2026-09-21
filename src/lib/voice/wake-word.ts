// Jùlaba Wake Word Detection Service
// Continuously listens for "Tata" (preferred) or "Julaba" and triggers the voice modal.

import { createSmartContinuousSTT, isAnySTTAvailable, initSherpaModel, type STTSession } from './stt-factory'
import { playBeep, tataSpeak, haptic } from './tata-tts'

// Wake word patterns — « Tata » is the short, natural command used by
// producteurs and marchands. Julaba remains a backward-compatible alias.
// Note: "djoula" (without the final -ba) is deliberately excluded — it's
// the common French name for the Dioula language/ethnic group and would
// false-trigger on completely unrelated conversation.
const WAKE_WORD_PATTERNS = [
  /\btata\b/i,
  /\btatah\b/i,
  /\bta\s+ta\b/i,
  /\bjulaba\b/i,
  /\bdjulaba\b/i,
  /\bjula\s+ba\b/i,
  /\bjou\s+laba\b/i,
]

export type WakeWordState =
  | 'inactive'    // Wake word feature is disabled in settings
  | 'unavailable' // STT not supported by browser
  | 'listening'   // Background listener is active, waiting for wake word
  | 'detected'    // Wake word just detected, modal opening
  | 'error'       // Listener crashed

let session: STTSession | null = null
let _state: WakeWordState = 'inactive'
let _onWake: ((transcript: string) => void) | null = null
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
// Le mot de réveil est-il ACTIVÉ (réglages) ? Piloté UNIQUEMENT par
// setWakeWordEnabled() (wake-word-manager reflète voiceEnabled &&
// wakeWordEnabled). resumeWakeWord() ne relance le listener que si ce
// flag vaut true — sinon fermer une modale vocale réactivait le micro de
// fond alors que l'utilisateur a désactivé le mot de réveil dans les
// réglages (audit F2).
let _enabled = false
// Compteur de génération : chaque startWakeWordListener() et chaque
// stopWakeWordListener() l'incrémente. Un start dont la génération n'est
// plus la courante à la résolution d'un await (init modèle, création de
// session) est supplanté — il avorte ce qu'il vient de créer et rend la
// main. Sans lui, les DEUX resumeWakeWord() dos à dos à la fermeture
// d'une modale (body + cleanup d'effet) créaient deux sessions
// concurrentes dont une orpheline, éternellement à l'écoute (audit F1) ;
// et un stop pendant un start en vol (logout) laissait une session
// zombie (audit F4).
let _startGen = 0

/**
 * Check if a transcript contains the wake word
 */
function containsWakeWord(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019']/g, ' ')
  return WAKE_WORD_PATTERNS.some(pattern => {
    pattern.lastIndex = 0 // reset to avoid /g flag state issues
    return pattern.test(normalized)
  })
}

/** Retourne la commande située après le mot Tata/Julaba, s'il y en a une. */
export function extractWakeWordCommand(text: string): string {
  return text
    .replace(/\b(?:tata|tatah)\b|\bta\s+ta\b|\b(?:julaba|djulaba)\b|\bjula\s+ba\b|\bjou\s+laba\b/i, '')
    .replace(/^[\s,;:!?-]+/, '')
    .trim()
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
export function onWakeDetected(callback: (transcript: string) => void) {
  _onWake = callback
}

/**
 * Active/désactive le service mot de réveil — miroir des réglages
 * (voiceEnabled && wakeWordEnabled), appliqué par WakeWordManager.
 * Désactiver coupe immédiatement le listener ET interdit tout
 * redémarrage via resumeWakeWord() (audit F2).
 */
export function setWakeWordEnabled(enabled: boolean) {
  _enabled = enabled
  if (!enabled) stopWakeWordListener()
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
  // Stop any existing session — bump aussi la génération : tout autre
  // start encore en vol est invalidé (audit F1).
  stopWakeWordListener()

  // MA génération, capturée APRÈS le stop : si un stop/nouveau start
  // survient pendant nos awaits, elle n'est plus la courante et nous
  // abandonnons sans créer de session fantôme (audit F1/F4).
  const gen = ++_startGen

  // Warm the offline model BEFORE gating: on a native device without
  // network (the primary field scenario) Web Speech is dead and the model
  // may not be loaded yet — without this await the listener reports
  // 'unavailable' for a capability the device actually has.
  await initSherpaModel()

  // Une pause demandée PENDANT le chargement du modèle annule le
  // démarrage (audit VOCAL-604) — la modale qui a appelé pauseWakeWord()
  // pendant cet await ne doit jamais hériter d'un listener de fond.
  // Idem si un stop/nouveau start nous a supplantés entre-temps
  // (génération dépassée, audit F1/F4) : ne rien créer, ne rien toucher —
  // le gagnant gère l'état.
  if (_paused || gen !== _startGen) return

  if (!isAnySTTAvailable()) {
    setState('unavailable')
    return
  }

  setState('listening')

  try {
    const created = await createSmartContinuousSTT(
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

    // Supplanté (nouveau start) ou arrêté (stop/pause) PENDANT la
    // création : avorter la session fraîchement créée — jamais de session
    // orpheline à l'écoute en parallèle de la gagnante (audit F1/F4).
    if (_paused || gen !== _startGen) {
      created.abort()
      return
    }

    session = created
    session.start()
  } catch (err) {
    // Supplanté pendant la création : l'échec ne nous appartient plus.
    if (gen !== _startGen) return
    console.warn('[WakeWord] Failed to create STT session:', err)
    setState('error')
  }
}

/**
 * Stop the wake word listener.
 * Should be called on logout or when voice is disabled.
 */
export function stopWakeWordListener() {
  // Invalide tout startWakeWordListener() encore en vol : à sa prochaine
  // résolution d'await il verra une génération dépassée et avortera —
  // logout / réglage coupé ⇒ aucune session zombie (audit F4).
  _startGen += 1
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
  // Une modale est ouverte : le « retour à l'écoute » armé par une
  // détection doit mourir avec la session. Sinon, à +10 s, il voyait
  // l'état 'detected' figé par la pause et ressuscitait le micro de fond
  // PENDANT la modale (audit F3) — contention de micro et auto-détection
  // parasite au milieu d'une vente vocale.
  if (_resetTimer) {
    clearTimeout(_resetTimer)
    _resetTimer = null
  }
  if (session) {
    session.abort()
  }
  // 'listening' ET 'detected' : la pause doit laisser un état propre —
  // un 'detected' figé servait de condition de résurrection au timer
  // (audit F3).
  if (_state !== 'inactive') {
    setState('inactive')
  }
}

/**
 * Resume wake word after voice modal is closed
 */
export function resumeWakeWord() {
  _paused = false
  // Respect du réglage : un mot de réveil désactivé dans les réglages ne
  // doit JAMAIS redémarrer parce qu'une modale vocale se ferme (audit F2).
  if (!_enabled) return
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
    _onWake?.(extractWakeWordCommand(transcript))
    // Resume wake word after modal closes (the modal component handles this)
  })

  // Reset to listening after a timeout (in case modal doesn't open).
  // Kept in a module handle and cancelled by stopWakeWordListener so the
  // timer can never outlive the listener itself (audit F10).
  if (_resetTimer) clearTimeout(_resetTimer)
  _resetTimer = setTimeout(() => {
    _resetTimer = null
    // Pause demandée entre-temps (modale ouverte) : ne rien ressusciter
    // (audit F3 — pauseWakeWord annule aussi ce timer, double ceinture
    // et bretelles).
    if (_paused) return
    if (_state === 'detected') {
      setState('listening')
      session?.start()
    }
  }, 10000)
}
