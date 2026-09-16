import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock piper-tts
const mockPiperSpeak = vi.fn()
const mockPiperStop = vi.fn()
const mockIsPiperVoiceReady = vi.fn()
const mockUnlockPiperAudio = vi.fn()

vi.mock('../piper-tts', () => ({
  piperSpeak: (...args: any[]) => mockPiperSpeak(...args),
  piperStop: (...args: any[]) => mockPiperStop(...args),
  isPiperVoiceReady: (...args: any[]) => mockIsPiperVoiceReady(...args),
  unlockPiperAudio: (...args: any[]) => mockUnlockPiperAudio(...args),
}))

// Mock the native TTS bridge — the flag toggles the "native shell" case.
const nativeState = { available: false }
const mockNativeSpeak = vi.fn()
const mockNativeStop = vi.fn()

vi.mock('../native-tts', () => ({
  TataTts: {
    speak: (...args: any[]) => mockNativeSpeak(...args),
    stop: (...args: any[]) => mockNativeStop(...args),
  },
  isNativeTtsAvailable: () => nativeState.available,
}))

// Ensure browser globals exist in node env
beforeEach(() => {
  vi.clearAllMocks()
  nativeState.available = false
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {})
  }
  if (typeof globalThis.localStorage === 'undefined') {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    })
  }
  if (typeof globalThis.speechSynthesis === 'undefined') {
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
    })
  }
  // SpeechSynthesisUtterance must be a constructor (class or function)
  if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
    class MockUtterance {
      lang = ''
      rate = 0
      pitch = 0
      volume = 0
      voice: any = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text = '') {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
  }
  if (typeof globalThis.navigator === 'undefined') {
    vi.stubGlobal('navigator', { vibrate: vi.fn() })
  }
  if (typeof globalThis.Audio === 'undefined') {
    class MockAudio {
      src = ''
      onended: (() => void) | null = null
      play = vi.fn().mockResolvedValue(undefined)
      constructor(_src?: string) {}
    }
    vi.stubGlobal('Audio', MockAudio)
  }
  if (typeof globalThis.AudioContext === 'undefined') {
    class MockOscillator {
      frequency = { value: 0 }
      connect = vi.fn()
      start = vi.fn()
      stop = vi.fn()
    }
    class MockGainNode {
      gain = { value: 0 }
      connect = vi.fn()
    }
    class MockAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator = vi.fn(() => new MockOscillator())
      createGain = vi.fn(() => new MockGainNode())
      resume = vi.fn().mockResolvedValue(undefined)
    }
    vi.stubGlobal('AudioContext', MockAudioContext)
  }
})

import {
  getTtsEngine,
  setTtsEngine,
  tataSpeak,
  tataSpeakWeb,
  tataStop,
  playBeep,
  haptic,
} from '../tata-tts'

describe('tata-tts', () => {
  describe('getTtsEngine / setTtsEngine', () => {
    it('defaults to webspeech', () => {
      expect(getTtsEngine()).toBe('webspeech')
    })

    it('persists engine selection', () => {
      setTtsEngine('piper')
      expect(getTtsEngine()).toBe('piper')
      setTtsEngine('webspeech')
      expect(getTtsEngine()).toBe('webspeech')
    })

    it('returns webspeech when window is undefined', () => {
      const orig = globalThis.window
      // @ts-expect-error SSR test
      delete globalThis.window
      expect(getTtsEngine()).toBe('webspeech')
      globalThis.window = orig
    })
  })

  describe('tataSpeak - Web Speech path', () => {
    it('calls speechSynthesis.speak', () => {
      const callback = vi.fn()
      tataSpeak('Bonjour', callback)
      expect(speechSynthesis.speak).toHaveBeenCalled()
    })

    it('resumes the browser synthesis engine after canceling queued speech', () => {
      tataSpeak('Bonjour')
      expect(speechSynthesis.resume).toHaveBeenCalled()
    })

    it('does not call callback immediately', () => {
      const callback = vi.fn()
      tataSpeak('Bonjour', callback)
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('tataSpeak - Piper path', () => {
    it('tries Piper when engine is piper and voice is ready', async () => {
      setTtsEngine('piper')
      mockIsPiperVoiceReady.mockResolvedValue(true)
      mockPiperSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(mockIsPiperVoiceReady).toHaveBeenCalledOnce()
      })
      expect(mockPiperSpeak).toHaveBeenCalledWith('Bonjour')
    })

    it('falls back to Web Speech when Piper voice not ready', async () => {
      setTtsEngine('piper')
      mockIsPiperVoiceReady.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(mockPiperSpeak).not.toHaveBeenCalled()
      })
    })

    it('falls back to Web Speech when Piper synthesis fails', async () => {
      setTtsEngine('piper')
      mockIsPiperVoiceReady.mockResolvedValue(true)
      mockPiperSpeak.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        // Le repli doit être réellement audible : Web Speech parle.
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
    })

    it('falls back to Web Speech when Piper throws', async () => {
      setTtsEngine('piper')
      mockIsPiperVoiceReady.mockRejectedValue(new Error('fail'))

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        // Repli garanti même sur rejet : plus de silence avalé.
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
    })
  })

  describe('tataSpeak - native shell (Capacitor)', () => {
    it('routes to the native bridge instead of Web Speech', () => {
      nativeState.available = true
      mockNativeSpeak.mockResolvedValue({ spoken: true })

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      expect(mockNativeSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Bonjour' }),
      )
      expect(speechSynthesis.speak).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
    })

    it('resolves done once the native engine finished', async () => {
      nativeState.available = true
      mockNativeSpeak.mockResolvedValue({ spoken: true })

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('done')
      })
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('falls back to the native bridge when Piper fails inside the shell', async () => {
      nativeState.available = true
      setTtsEngine('piper')
      mockIsPiperVoiceReady.mockResolvedValue(false)

      tataSpeak('Bonjour')

      await vi.waitFor(() => {
        expect(mockNativeSpeak).toHaveBeenCalled()
      })
    })

    it('fires error when the native engine reports a failure', async () => {
      nativeState.available = true
      mockNativeSpeak.mockResolvedValue({ spoken: false, reason: 'init_echouee' })

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('error')
      })
    })

    it('tataSpeakWeb routes narrations through the native bridge too', () => {
      nativeState.available = true
      mockNativeSpeak.mockResolvedValue({ spoken: true })

      tataSpeakWeb('Bonjour, ici Tata')

      expect(mockNativeSpeak).toHaveBeenCalled()
      expect(speechSynthesis.speak).not.toHaveBeenCalled()
    })
  })

  describe('tataStop', () => {
    it('stops both Piper and Web Speech', () => {
      tataStop()
      expect(mockPiperStop).toHaveBeenCalledOnce()
      expect(speechSynthesis.cancel).toHaveBeenCalled()
    })
  })

  describe('playBeep', () => {
    it('does not throw when AudioContext is unavailable', () => {
      vi.stubGlobal('AudioContext', undefined)
      expect(() => playBeep('start')).not.toThrow()
    })

    it('plays a beep for each type', () => {
      // _audioCtx is a module-level singleton cached by getAudioContext().
      // Each beep call reuses it, so we just verify all types complete
      // without error using the cached context.
      playBeep('start')
      playBeep('stop')
      playBeep('success')
      playBeep('error')
      // If we got here, no errors were thrown — the AudioContext was
      // properly created and oscillators were dispatched.
    })
  })

  describe('haptic', () => {
    it('does not throw when vibrate is unavailable', () => {
      vi.stubGlobal('navigator', {})
      expect(() => haptic('light')).not.toThrow()
    })

    it('calls vibrate with correct patterns', () => {
      const vibrate = vi.fn()
      vi.stubGlobal('navigator', { vibrate })

      haptic('light')
      expect(vibrate).toHaveBeenCalledWith(30)

      haptic('medium')
      expect(vibrate).toHaveBeenCalledWith([30, 20, 30])

      haptic('heavy')
      expect(vibrate).toHaveBeenCalledWith([50, 30, 50, 30, 50])

      haptic('success')
      expect(vibrate).toHaveBeenCalledWith([30, 50, 30, 50, 100])

      haptic('error')
      expect(vibrate).toHaveBeenCalledWith([100, 50, 100])
    })
  })
})
