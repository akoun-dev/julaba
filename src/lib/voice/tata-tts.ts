// Tata Nanti Lou - TTS Voice Feedback System
// Engine chain: native system TTS (Capacitor shell — Android/iOS), optional
// opt-in Piper neural TTS (see piper-tts.ts), Web Speech Synthesis API with
// French voice as the browser fallback.
//
// WHY NATIVE FIRST: the Android WebView does not implement the Web Speech
// API (speechSynthesis), so a Web-Speech-only chain produced a silent no-op
// for every narration — "on n'entend pas la voix du onboarding à la
// navigation marchand". The STT side already bridges the same WebView
// limitation natively (SherpaSttPlugin); TataTtsPlugin is the output
// counterpart (android.speech.tts.TextToSpeech / AVSpeechSynthesizer).
import { piperSpeak, piperStop, isPiperVoiceReady, unlockPiperAudio } from './piper-tts'
import { TataTts, isNativeTtsAvailable } from './native-tts'
import { toSpeechText } from './speech-text'

let frenchVoice: SpeechSynthesisVoice | null = null
let isSpeaking = false

type TataCallback = (state: 'done' | 'error') => void
type TtsEngine = 'webspeech' | 'piper'

const TTS_ENGINE_KEY = 'julaba-tts-engine'

// Lazy-loaded store getter to avoid circular imports
let _getVoiceSettings: (() => { volume: number; rate: number }) | null = null
function getVoiceSettings(): { volume: number; rate: number } {
  if (!_getVoiceSettings) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAppStore } = require('@/lib/stores/app-store')
      _getVoiceSettings = () => {
        const s = useAppStore.getState()
        return { volume: s.voiceVolume ?? 100, rate: s.voiceRate ?? 0.9 }
      }
    } catch {
      _getVoiceSettings = () => ({ volume: 100, rate: 0.9 })
    }
  }
  return _getVoiceSettings()
}

export function getTtsEngine(): TtsEngine {
  if (typeof window === 'undefined') return 'webspeech'
  return localStorage.getItem(TTS_ENGINE_KEY) === 'piper' ? 'piper' : 'webspeech'
}

export type EffectiveTtsEngine = 'piper' | 'native' | 'webspeech'

/**
 * Which engine ACTUALLY speaks right now — as opposed to getTtsEngine(),
 * which only reports the user's stored preference. Inside the native shell
 * the system TTS engine handles every non-Piper utterance (the WebView has
 * no Web Speech at all — see native-tts.ts), so reporting 'webspeech' there
 * misled the diagnostics UI (audit F11).
 */
export function getEffectiveTtsEngine(): EffectiveTtsEngine {
  if (getTtsEngine() === 'piper') return 'piper'
  if (isNativeTtsAvailable()) return 'native'
  return 'webspeech'
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
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') return
  const voices = speechSynthesis.getVoices()
  frenchVoice = voices.find(v => v.lang.startsWith('fr')) || voices[0] || null
}

export type WebSpeechStatus = 'ready' | 'unsupported' | 'no-voice'

export function getWebSpeechStatus(): WebSpeechStatus {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return 'unsupported'
  initTata()
  return frenchVoice || speechSynthesis.getVoices().length > 0 ? 'ready' : 'no-voice'
}

export function unlockTataAudio(): void {
  if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.resume()
    initTata()
    if (getTtsEngine() === 'piper') unlockPiperAudio()
  } catch { /* Browser audio can remain unavailable until a later gesture. */ }
}

// Re-init when voices load. Assigned once and idempotently: re-running this
// module (HMR, multiple imports under test) must not stack handlers (audit
// F10 — module-level listeners are never removed, so keep exactly one).
if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
  if (!speechSynthesis.onvoiceschanged) {
    speechSynthesis.onvoiceschanged = () => initTata()
  }
  // Try immediately
  setTimeout(initTata, 100)
}

function speakWithWebSpeech(text: string, callback?: TataCallback, rate: number = 0.9, volume: number = 1): void {
  if (getWebSpeechStatus() === 'unsupported') {
    // Diagnostic unique observable : "aucun son" doit pouvoir s'expliquer
    // (WebView sans Web Speech + pont natif absent = environnement cassé).
    console.warn('[tata-tts] Web Speech indisponible dans cet environnement — narration muette')
    callback?.('error')
    return
  }
  unlockTataAudio()

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
    utterance.volume = volume

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

/** Use the browser voice explicitly for automatic narrations that can happen
 * outside a direct gesture, such as onboarding step transitions. Inside the
 * native shell, the system TTS engine speaks instead (the WebView has no
 * Web Speech API at all — see native-tts.ts). Piper is deliberately skipped:
 * non-gesture narrations must not depend on a WASM model or an AudioContext
 * that autoplay policy can keep suspended. */
export function tataSpeakWeb(text: string, callback?: TataCallback, rate?: number, volume?: number): void {
  // Montants verbalisés une seule fois ici : le texte arrive déjà en
  // « mille cinq cents francs CFA » quel que soit le moteur en dessous.
  const spokenText = toSpeechText(text)
  const settings = getVoiceSettings()
  const effectiveRate = rate ?? settings.rate
  const effectiveVolume = (volume ?? settings.volume) / 100
  if (isNativeTtsAvailable()) {
    nativeSpeak(spokenText, callback, effectiveRate, effectiveVolume)
    return
  }
  speakWithWebSpeech(spokenText, callback, effectiveRate, effectiveVolume)
}

/** Speak through the native system TTS bridge (TataTtsPlugin). The plugin
 * resolves exactly once per utterance ({spoken:boolean}); a watchdog below
 * guarantees our callback still fires even if a broken system engine never
 * answers, so caller chains (speak → close modal → navigate) can never
 * freeze. */
function nativeSpeak(text: string, callback?: TataCallback, rate: number = 0.9, volume: number = 1): void {
  isSpeaking = true
  let settled = false
  const finish = (state: 'done' | 'error') => {
    if (settled) return
    settled = true
    clearTimeout(watchdog)
    isSpeaking = false
    callback?.(state)
  }
  // System engines always answer in practice; if one never does (exotic
  // device, killed TTS process), release the chain instead of hanging.
  const watchdog = setTimeout(() => {
    console.warn('[tata-tts] Watchdog moteur natif déclenché — libération du callback')
    try { void TataTts.stop() } catch { /* bridge gone */ }
    finish('done')
  }, 30_000 + Math.min(120_000, text.length * 80))

  TataTts.speak({ text, rate, volume })
    .then((res) => finish(res?.spoken === false ? 'error' : 'done'))
    .catch((err) => {
      console.warn('[tata-tts] Pont natif TTS en échec :', err)
      finish('error')
    })
}

/** Guaranteed-audible fallback after a Piper failure: native system voice
 * inside the shell (Web Speech doesn't exist there), Web Speech otherwise. */
function speakReliableFallback(text: string, callback?: TataCallback, rate?: number, volume?: number): void {
  if (isNativeTtsAvailable()) {
    nativeSpeak(text, callback, rate, volume)
    return
  }
  setTtsEngine('webspeech')
  speakWithWebSpeech(text, callback, rate, volume)
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
  rate?: number,
  volume?: number
): void {
  if (typeof window === 'undefined') {
    callback?.('done')
    return
  }

  // Normalisation centrale des montants (intégration unique, aucun appelant
  // à modifier) : « 1 500 FCFA » → « mille cinq cents francs CFA » pour les
  // trois moteurs. Les PIN, téléphones et codes ne matchent pas (aucune
  // devise) et restent épelés chiffre par chiffre côté Piper. Idempotent :
  // re-normaliser le texte déjà converti ne change rien.
  const spokenText = toSpeechText(text)

  const settings = getVoiceSettings()
  const effectiveRate = rate ?? settings.rate
  const effectiveVolume = (volume ?? settings.volume) / 100

  if (getTtsEngine() === 'piper') {
    isSpeaking = true
    isPiperVoiceReady()
      .then((ready) => ready ? piperSpeak(spokenText).then((played) => ({ ready: true, played })) : { ready: false, played: false })
      .then(({ ready, played }) => {
        isSpeaking = false
        if (played) {
          callback?.('done')
        } else {
          // Piper not installed OR installed but its synthesis/playback
          // failed: audibility beats engine fidelity. Fall back to a voice
          // that will actually be heard (native system TTS in the shell,
          // Web Speech in the browser) instead of staying silent — the
          // original bug report.
          speakReliableFallback(spokenText, callback, effectiveRate, effectiveVolume)
        }
      })
      .catch((err) => {
        isSpeaking = false
        console.warn('[tata-tts] Chaîne Piper en échec, repli :', err)
        speakReliableFallback(spokenText, callback, effectiveRate, effectiveVolume)
      })
    return
  }

  // Inside the native shell the WebView has no speechSynthesis at all:
  // route to the system TTS engine before even trying Web Speech.
  if (isNativeTtsAvailable()) {
    nativeSpeak(spokenText, callback, effectiveRate, effectiveVolume)
    return
  }

  speakWithWebSpeech(spokenText, callback, effectiveRate, effectiveVolume)
}

/**
 * Stop current speech (any engine)
 */
export function tataStop(): void {
  piperStop()
  if (isNativeTtsAvailable()) {
    try { void TataTts.stop() } catch { /* bridge gone */ }
  }
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
