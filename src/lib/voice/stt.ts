// Jùlaba Speech-to-Text Utility
// Provides a clean API for Web Speech API with availability detection

let _isAvailable: boolean | null = null

export type STTResult = {
  transcript: string
  confidence: number
  isFinal: boolean
}

export type STTCallbacks = {
  onResult: (result: STTResult) => void
  onError?: (error: string) => void
  onEnd?: () => void
  /** Lifecycle UI: preparing = modèle vocal en chargement, listening = micro réellement démarré. */
  onStatus?: (status: 'preparing' | 'listening') => void
}

/**
 * Check if Web Speech API (SpeechRecognition) is available in this browser
 */
export function isSTTAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (_isAvailable !== null) return _isAvailable
  const W = window as unknown as Record<string, unknown>
  _isAvailable = !!(W.SpeechRecognition || W.webkitSpeechRecognition)
  return _isAvailable
}

export interface STTSession {
  start: () => void
  stop: () => void
  abort: () => void
  isListening: () => boolean
}

/**
 * Create a single-shot STT session (one recognition, then stops)
 * Used for push-to-talk: user holds button → speak → release → get result
 */
export function createSingleShotSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string; maxAlternatives?: number }
): STTSession {
  let listening = false
  let recognition: ReturnType<typeof _createRecognition> | null = null

  const stop = () => {
    if (recognition) {
      try { recognition.stop() } catch { /* already stopped */ }
    }
    listening = false
  }

  const abort = () => {
    if (recognition) {
      try { recognition.abort() } catch { /* already aborted */ }
    }
    listening = false
  }

  recognition = _createRecognition()
  recognition.lang = options?.lang || 'fr-FR'
  recognition.interimResults = false
  recognition.maxAlternatives = options?.maxAlternatives ?? 1

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]
      callbacks.onResult({
        transcript: r[0].transcript,
        confidence: r[0].confidence,
        isFinal: r.isFinal,
      })
    }
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    listening = false
    // 'no-speech' is normal — user was silent
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      callbacks.onError?.(event.error)
    }
  }

  recognition.onend = () => {
    listening = false
    callbacks.onEnd?.()
  }

  return {
    start: () => {
      if (!isSTTAvailable() || listening) return
      listening = true
      try {
        recognition!.start()
      } catch {
        listening = false
        callbacks.onError?.('failed')
      }
    },
    stop,
    abort,
    isListening: () => listening,
  }
}

/**
 * Create a continuous STT session (keeps listening, returns interim results)
 * Used for wake word detection: always-on background listener
 */
export function createContinuousSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string }
): STTSession {
  let listening = false
  let recognition: ReturnType<typeof _createRecognition> | null = null
  let shouldRestart = true
  let noSpeechStreak = 0
  let consecutiveRealErrors = 0
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let pendingErrorForOnEnd: string | null = null
  const MAX_CONSECUTIVE_REAL_ERRORS = 5
  const RESTART_DELAY_BASE = 500
  const NO_SPEECH_RESTART_DELAY_CAP = 2000
  // Errors where retrying is pointless (mic blocked/unavailable) — stop right away.
  const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

  recognition = _createRecognition()
  recognition.lang = options?.lang || 'fr-FR'
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.continuous = true

  const clearRestartTimer = () => {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
  }

  const tryRestart = () => {
    try {
      recognition!.start()
      listening = true
    } catch {
      // ignore — browser blocked restart (e.g. already running)
    }
  }

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    noSpeechStreak = 0
    consecutiveRealErrors = 0
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]
      callbacks.onResult({
        transcript: r[0].transcript,
        confidence: r[0].confidence,
        isFinal: r.isFinal,
      })
    }
  }

  // Just record the error — the Web Speech API always fires 'end' right
  // after 'error' (for every error type), so `onend` below is the single
  // place that decides whether/when to restart. Deciding in both handlers
  // caused a restart race (onend restarting instantly while onerror's
  // delayed retry fired later on top of it).
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    listening = false
    pendingErrorForOnEnd = event.error
  }

  recognition.onend = () => {
    listening = false
    const error = pendingErrorForOnEnd
    pendingErrorForOnEnd = null
    callbacks.onEnd?.()

    if (!shouldRestart) return
    if (error === 'aborted') return // explicit stop/abort — never restart

    if (error && FATAL_ERRORS.has(error)) {
      shouldRestart = false
      callbacks.onError?.(error)
      return
    }

    let delay = 0
    if (error === 'no-speech') {
      // Silence is the normal resting state for a background listener —
      // never give up on it, just back off a little so we don't hammer
      // the recognizer in a tight loop.
      noSpeechStreak++
      delay = Math.min(RESTART_DELAY_BASE * noSpeechStreak, NO_SPEECH_RESTART_DELAY_CAP)
    } else if (error) {
      noSpeechStreak = 0
      consecutiveRealErrors++
      callbacks.onError?.(error)
      if (consecutiveRealErrors >= MAX_CONSECUTIVE_REAL_ERRORS) {
        shouldRestart = false
        return
      }
      delay = RESTART_DELAY_BASE * Math.min(consecutiveRealErrors, 4)
    } else {
      noSpeechStreak = 0
    }

    if (delay === 0) {
      tryRestart()
    } else {
      clearRestartTimer()
      restartTimer = setTimeout(() => {
        restartTimer = null
        if (shouldRestart) tryRestart()
      }, delay)
    }
  }

  return {
    start: () => {
      if (!isSTTAvailable()) return
      shouldRestart = true
      noSpeechStreak = 0
      consecutiveRealErrors = 0
      pendingErrorForOnEnd = null
      clearRestartTimer()
      if (listening) return
      listening = true
      try {
        recognition!.start()
      } catch {
        listening = false
      }
    },
    stop: () => {
      shouldRestart = false
      clearRestartTimer()
      if (recognition) {
        try { recognition.stop() } catch { /* ok */ }
      }
      listening = false
    },
    abort: () => {
      shouldRestart = false
      clearRestartTimer()
      if (recognition) {
        try { recognition.abort() } catch { /* ok */ }
      }
      listening = false
    },
    isListening: () => listening,
  }
}

// --- Internal ---

function _createRecognition() {
  const W = window as unknown as Record<string, unknown>
  const Ctor = (W.SpeechRecognition || W.webkitSpeechRecognition) as new () => SpeechRecognition
  return new Ctor()
}
