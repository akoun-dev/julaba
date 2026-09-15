// Tata Nanti Lou - TTS Voice Feedback System
// Default engine: Web Speech Synthesis API with French voice. Optional
// opt-in upgrade: Piper neural TTS (see piper-tts.ts) once its voice model
// has been explicitly downloaded by the user in settings.
import { piperSpeak, piperStop, isPiperVoiceReady } from './piper-tts'

let frenchVoice: SpeechSynthesisVoice | null = null
let isSpeaking = false

type TataCallback = (state: 'done' | 'error') => void
type TtsEngine = 'webspeech' | 'piper'

const TTS_ENGINE_KEY = 'julaba-tts-engine'

export function getTtsEngine(): TtsEngine {
  if (typeof window === 'undefined') return 'webspeech'
  return localStorage.getItem(TTS_ENGINE_KEY) === 'piper' ? 'piper' : 'webspeech'
}

/**
 * Switches the active TTS engine. Callers should only set 'piper' after
 * confirming isPiperVoiceReady() — tataSpeak falls back to Web Speech
 * automatically if the Piper voice isn't actually downloaded yet, but the
 * settings UI should reflect real availability rather than surprise the
 * user with a silent fallback.
 */
export function setTtsEngine(engine: TtsEngine): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TTS_ENGINE_KEY, engine)
}

/**
 * Initialize TTS and find a French voice
 */
export function initTata(): void {
  if (typeof window === 'undefined') return
  const voices = speechSynthesis.getVoices()
  frenchVoice = voices.find(v => v.lang.startsWith('fr')) || voices[0] || null
}

// Re-init when voices load
if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => initTata()
  // Try immediately
  setTimeout(initTata, 100)
}

function speakWithWebSpeech(text: string, callback?: TataCallback, rate: number = 0.9): void {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') {
    callback?.('done')
    return
  }

  try {
    speechSynthesis.cancel()
    // Chrome/Safari can keep the synthesis queue paused after canceling a
    // previous utterance. Resume before enqueueing the next one or speak()
    // succeeds while producing no audio.
    speechSynthesis.resume()
  } catch { /* WebView may throw or block */ }

  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'fr-FR'
    utterance.rate = rate
    utterance.pitch = 1.1
    utterance.volume = 1

    if (frenchVoice) {
      utterance.voice = frenchVoice
    }

    isSpeaking = true

    utterance.onend = () => {
      isSpeaking = false
      callback?.('done')
    }

    utterance.onerror = () => {
      isSpeaking = false
      callback?.('error')
    }

    speechSynthesis.speak(utterance)
  } catch {
    isSpeaking = false
    callback?.('error')
  }
}

/**
 * Speak text with Tata's voice. Uses the Piper neural voice when the user
 * has opted in and its model is actually downloaded; otherwise (and on
 * any Piper failure) falls back to the Web Speech API transparently.
 *
 * `callback` fires exactly once, when speech finishes ('done') or fails
 * ('error') — every caller in this app treats it as a single completion
 * callback (chaining a navigate/close/state-change after it), so it must
 * never fire early. It used to also fire once immediately with 'speaking'
 * before either engine had produced any audio, which silently double-ran
 * every such callback (e.g. the wake-word handler below would open the
 * voice modal twice per detection, tearing down its own in-flight
 * auto-listen before it could start — see wake-word.ts/handleWakeWordDetected).
 */
export function tataSpeak(
  text: string,
  callback?: TataCallback,
  rate: number = 0.9
): void {
  if (typeof window === 'undefined') {
    callback?.('done')
    return
  }

  if (getTtsEngine() === 'piper') {
    isSpeaking = true
    isPiperVoiceReady()
      .then((ready) => (ready ? piperSpeak(text) : false))
      .then((played) => {
        isSpeaking = false
        if (played) {
          callback?.('done')
        } else {
          // A cached Piper model can outlive the WASM backend or its CDN.
          // Disable the optional engine for this browser until it is re-enabled
          // after a successful download, then use the reliable native fallback.
          setTtsEngine('webspeech')
          speakWithWebSpeech(text, callback, rate)
        }
      })
      .catch(() => {
        isSpeaking = false
        setTtsEngine('webspeech')
        speakWithWebSpeech(text, callback, rate)
      })
    return
  }

  speakWithWebSpeech(text, callback, rate)
}

/**
 * Stop current speech (either engine)
 */
export function tataStop(): void {
  piperStop()
  if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
    try { speechSynthesis.cancel() } catch { /* WebView may block */ }
  }
  isSpeaking = false
}

/**
 * Check if Tata is currently speaking
 */
export function tataIsSpeaking(): boolean {
  return isSpeaking
}

/**
 * Play a beep sound (for push-to-talk feedback)
 * Uses a shared AudioContext to avoid exhausting the browser limit (~6)
 */
let _audioCtx: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_audioCtx || _audioCtx.state === 'closed') {
    try { _audioCtx = new AudioContext() } catch { return null }
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {})
  }
  return _audioCtx
}

export function playBeep(type: 'start' | 'stop' | 'success' | 'error'): void {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    switch (type) {
      case 'start':
        osc.frequency.value = 880
        gain.gain.value = 0.15
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
        break
      case 'stop':
        osc.frequency.value = 660
        gain.gain.value = 0.15
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
        break
      case 'success':
        osc.frequency.value = 1047
        gain.gain.value = 0.15
        osc.start()
        setTimeout(() => {
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.connect(gain2)
          gain2.connect(ctx.destination)
          osc2.frequency.value = 1319
          gain2.gain.value = 0.15
          osc2.start()
          osc2.stop(ctx.currentTime + 0.15)
        }, 120)
        osc.stop(ctx.currentTime + 0.15)
        break
      case 'error':
        osc.frequency.value = 330
        gain.gain.value = 0.2
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
        break
    }
  } catch {
    // Audio not available
  }
}

/**
 * Vibrate device (mobile haptic feedback)
 */
export function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light'): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  switch (pattern) {
    case 'light': navigator.vibrate(30); break
    case 'medium': navigator.vibrate([30, 20, 30]); break
    case 'heavy': navigator.vibrate([50, 30, 50, 30, 50]); break
    case 'success': navigator.vibrate([30, 50, 30, 50, 100]); break
    case 'error': navigator.vibrate([100, 50, 100]); break
  }
}
