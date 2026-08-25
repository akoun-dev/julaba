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
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 5
  const RESTART_DELAY_BASE = 500

  recognition = _createRecognition()
  recognition.lang = options?.lang || 'fr-FR'
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.continuous = true

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    consecutiveErrors = 0
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
    if (event.error === 'aborted') {
      listening = false
      return
    }
    if (event.error === 'no-speech') {
      consecutiveErrors++
      if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS && shouldRestart) {
        const delay = RESTART_DELAY_BASE * Math.min(consecutiveErrors, 4) // backoff: 500ms → 1s → 1.5s → 2s
        setTimeout(() => {
          if (shouldRestart) {
            try { recognition!.start(); listening = true } catch { /* will try on onend */ }
          }
        }, delay)
      } else if (shouldRestart) {
        listening = false
        callbacks.onError?.('no-speech')
      }
      return
    }
    // For all other errors
    listening = false
    consecutiveErrors++
    callbacks.onError?.(event.error)
  }

  recognition.onend = () => {
    listening = false
    // Auto-restart in continuous mode unless explicitly stopped or too many errors
    if (shouldRestart && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
      try {
        recognition!.start()
        listening = true
      } catch {
        // ignore — browser blocked restart
      }
    }
    callbacks.onEnd?.()
  }

  return {
    start: () => {
      if (!isSTTAvailable()) return
      shouldRestart = true
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
      if (recognition) {
        try { recognition.stop() } catch { /* ok */ }
      }
      listening = false
    },
    abort: () => {
      shouldRestart = false
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
