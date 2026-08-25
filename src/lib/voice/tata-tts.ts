// Tata Nanti Lou - TTS Voice Feedback System
// Uses Web Speech Synthesis API with French voice

let frenchVoice: SpeechSynthesisVoice | null = null
let isSpeaking = false

type TataCallback = (state: 'speaking' | 'done' | 'error') => void

/**
 * Initialize TTS and find a French voice
 */
export function initTata(): void {
  if (typeof window === 'undefined') return
  const voices = speechSynthesis.getVoices()
  frenchVoice = voices.find(v => v.lang.startsWith('fr')) || voices[0] || null
}

// Re-init when voices load
if (typeof window !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => initTata()
  // Try immediately
  setTimeout(initTata, 100)
}

/**
 * Speak text with Tata's voice
 */
export function tataSpeak(
  text: string,
  callback?: TataCallback,
  rate: number = 0.9
): void {
  if (typeof window === 'undefined' || !speechSynthesis) {
    callback?.('done')
    return
  }

  // Cancel any current speech
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'fr-FR'
  utterance.rate = rate
  utterance.pitch = 1.1
  utterance.volume = 1

  if (frenchVoice) {
    utterance.voice = frenchVoice
  }

  isSpeaking = true
  callback?.('speaking')

  utterance.onend = () => {
    isSpeaking = false
    callback?.('done')
  }

  utterance.onerror = () => {
    isSpeaking = false
    callback?.('error')
  }

  speechSynthesis.speak(utterance)
}

/**
 * Stop current speech
 */
export function tataStop(): void {
  if (typeof window !== 'undefined' && speechSynthesis) {
    speechSynthesis.cancel()
    isSpeaking = false
  }
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
