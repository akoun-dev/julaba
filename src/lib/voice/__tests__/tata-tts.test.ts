import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// Mock kokoro-tts
const mockKokoroSpeak = vi.fn()
const mockKokoroStop = vi.fn()
const mockIsKokoroVoiceReady = vi.fn()
const mockUnlockKokoroAudio = vi.fn()

vi.mock('../kokoro-tts', () => ({
  kokoroSpeak: (...args: any[]) => mockKokoroSpeak(...args),
  kokoroStop: (...args: any[]) => mockKokoroStop(...args),
  isKokoroVoiceReady: (...args: any[]) => mockIsKokoroVoiceReady(...args),
  unlockKokoroAudio: (...args: any[]) => mockUnlockKokoroAudio(...args),
}))

// Mock mms-tts — voix baoulé pilote (B3-031) et voix dioula (MODE-914). Les
// chemins bci et dyu de tataSpeak consultent leur readiness puis leur
// synthèse avec le texte BRUT.
const mockMmsBciSpeak = vi.fn()
const mockMmsDyuSpeak = vi.fn()
const mockMmsStop = vi.fn()
const mockIsMmsBciVoiceReady = vi.fn()
const mockIsMmsDyuVoiceReady = vi.fn()
const mockUnlockMmsAudio = vi.fn()

vi.mock('../mms-tts', () => ({
  mmsBciSpeak: (...args: any[]) => mockMmsBciSpeak(...args),
  mmsDyuSpeak: (...args: any[]) => mockMmsDyuSpeak(...args),
  mmsStop: (...args: any[]) => mockMmsStop(...args),
  isMmsBciVoiceReady: (...args: any[]) => mockIsMmsBciVoiceReady(...args),
  isMmsDyuVoiceReady: (...args: any[]) => mockIsMmsDyuVoiceReady(...args),
  unlockMmsAudio: (...args: any[]) => mockUnlockMmsAudio(...args),
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
  // localStorage est partagé entre les tests (stub persistant) : chaque test
  // démarre sur la sélection par défaut pour rester déterministe.
  localStorage.setItem('julaba-tts-engine', 'webspeech')
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
  getEffectiveTtsEngine,
  getTtsEngine,
  setTtsEngine,
  tataSpeak,
  tataSpeakWeb,
  tataStop,
  playBeep,
  haptic,
} from '../tata-tts'
import { useVoiceLanguageStore } from '../../stores/voice-language-store'

describe('tata-tts', () => {
  describe('getTtsEngine / setTtsEngine', () => {
    it('defaults to webspeech', () => {
      expect(getTtsEngine()).toBe('webspeech')
    })

    it('persists engine selection', () => {
      setTtsEngine('piper')
      expect(getTtsEngine()).toBe('piper')
      setTtsEngine('kokoro')
      expect(getTtsEngine()).toBe('kokoro')
      expect(getEffectiveTtsEngine()).toBe('kokoro')
      setTtsEngine('webspeech')
      expect(getTtsEngine()).toBe('webspeech')
    })

    it('ignores unknown stored engine values', () => {
      localStorage.setItem('julaba-tts-engine', 'moteur-inconnu')
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

    it('verbalise les montants avant la synthèse (critère d’acceptation)', () => {
      tataSpeak("Vente de tomates pour 1 500 FCFA, c'est bien ça ?")
      const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(utterance.text).toBe(
        "Vente de tomates pour mille cinq cents francs CFA, c'est bien ça ?",
      )
    })

    it('ne déforme pas les PIN dictés', () => {
      tataSpeak('Code PIN 2580')
      const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(utterance.text).toBe('Code PIN 2580')
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

  describe('tataSpeak - Kokoro path (ordre Kokoro → Piper → natif → Web Speech)', () => {
    it('speaks with Kokoro when selected and ready — Piper untouched', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(true)
      mockKokoroSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('done')
      })
      expect(mockKokoroSpeak).toHaveBeenCalledWith('Bonjour', expect.objectContaining({ rate: expect.any(Number), volume: expect.any(Number) }))
      expect(mockIsPiperVoiceReady).not.toHaveBeenCalled()
      expect(mockPiperSpeak).not.toHaveBeenCalled()
      expect(speechSynthesis.speak).not.toHaveBeenCalled()
    })

    it('hands amounts to Kokoro already spoken in French', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(true)
      mockKokoroSpeak.mockResolvedValue(true)

      tataSpeak('Total : 25 000 F')

      await vi.waitFor(() => {
        expect(mockKokoroSpeak).toHaveBeenCalled()
      })
      expect(mockKokoroSpeak).toHaveBeenCalledWith(
        'Total : vingt-cinq mille francs CFA',
        expect.anything(),
      )
    })

    it('leaves PINs and phone numbers untouched for Kokoro', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(true)
      mockKokoroSpeak.mockResolvedValue(true)

      tataSpeak('PIN 2580, téléphone 0700000000')

      await vi.waitFor(() => {
        expect(mockKokoroSpeak).toHaveBeenCalled()
      })
      expect(mockKokoroSpeak).toHaveBeenCalledWith(
        'PIN 2580, téléphone 0700000000',
        expect.anything(),
      )
    })

    it('never auto-downloads: falls back to Piper when Kokoro is not ready', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(false)
      mockIsPiperVoiceReady.mockResolvedValue(true)
      mockPiperSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('done')
      })
      expect(mockKokoroSpeak).not.toHaveBeenCalled()
      expect(mockPiperSpeak).toHaveBeenCalledWith('Bonjour')
    })

    it('falls back to Piper when Kokoro synthesis fails', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(true)
      mockKokoroSpeak.mockResolvedValue(false)
      mockIsPiperVoiceReady.mockResolvedValue(true)
      mockPiperSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith('done')
      })
      expect(mockPiperSpeak).toHaveBeenCalledWith('Bonjour')
    })

    it('falls back to Web Speech when both Kokoro and Piper are unavailable', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(false)
      mockIsPiperVoiceReady.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
    })

    it('still recovers when Kokoro throws unexpectedly', async () => {
      setTtsEngine('kokoro')
      mockIsKokoroVoiceReady.mockResolvedValue(true)
      mockKokoroSpeak.mockRejectedValue(new Error('boom'))
      mockIsPiperVoiceReady.mockResolvedValue(false)

      tataSpeak('Bonjour')

      await vi.waitFor(() => {
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
    })

    it('selection webspeech never attempts the neural engines', async () => {
      setTtsEngine('webspeech')
      tataSpeak('Bonjour')
      await vi.waitFor(() => {
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
      expect(mockIsKokoroVoiceReady).not.toHaveBeenCalled()
      expect(mockIsPiperVoiceReady).not.toHaveBeenCalled()
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

    it('le pont natif reçoit aussi les montants verbalisés', () => {
      nativeState.available = true
      mockNativeSpeak.mockResolvedValue({ spoken: true })

      tataSpeak('Total : 25 000 F')

      expect(mockNativeSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Total : vingt-cinq mille francs CFA' }),
      )
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

  describe('tataSpeak - chemin bci (voix pilote MMS, B3-031)', () => {
    beforeEach(() => {
      useVoiceLanguageStore.setState({ sttLanguage: 'bci', ttsLanguage: 'bci' })
    })

    afterEach(() => {
      // Les suites existantes supposent la langue par défaut fr.
      useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
    })

    it('route vers mmsBciSpeak avec le texte BRUT quand la voix pilote est prête', async () => {
      mockIsMmsBciVoiceReady.mockResolvedValue(true)
      mockMmsBciSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      tataSpeak('Nànwlɛ, àbó', callback)

      await vi.waitFor(() => {
        expect(mockMmsBciSpeak).toHaveBeenCalledWith(
          'Nànwlɛ, àbó',
          expect.anything(),
        )
      })
      await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('done'))
    })

    it('ne passe JAMAIS par la normalisation française des montants (toSpeechText)', async () => {
      mockIsMmsBciVoiceReady.mockResolvedValue(true)
      mockMmsBciSpeak.mockResolvedValue(true)

      tataSpeak('vente 1 500 FCFA')

      await vi.waitFor(() => {
        expect(mockMmsBciSpeak).toHaveBeenCalledWith(
          'vente 1 500 FCFA',
          expect.anything(),
        )
      })
    })

    it('voix pilote non installée → narration française (Web Speech) + jamais de MMS', async () => {
      mockIsMmsBciVoiceReady.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        // Repli audible réel : Web Speech parle (langue bci = français en
        // attendant l’installation, signal explicite une fois par session).
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
      expect(mockMmsBciSpeak).not.toHaveBeenCalled()
    })

    it('échec de synthèse MMS → repli français garanti (done unique)', async () => {
      mockIsMmsBciVoiceReady.mockResolvedValue(true)
      mockMmsBciSpeak.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Akwaba', callback)

      await vi.waitFor(() => {
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
      // Le callback 'done' part à la fin RÉELLE de la lecture Web Speech :
      // déclencher onend sur l'utterance capturée (contrat tataSpeak).
      const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0][0]
      utterance.onend()
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('done')
    })

    it('langue française → le moteur MMS n’est JAMAIS consulté (zéro coût, zéro réseau)', async () => {
      useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })

      tataSpeak('Bonjour')

      // Dispatch français synchrone : ni le readiness MMS ni sa synthèse.
      expect(mockIsMmsBciVoiceReady).not.toHaveBeenCalled()
      expect(mockMmsBciSpeak).not.toHaveBeenCalled()
    })

    it('tataStop arrête aussi le moteur MMS', () => {
      tataStop()
      expect(mockMmsStop).toHaveBeenCalled()
    })
  })

  describe('tataSpeak - chemin dyu (voix dioula MMS, MODE-914)', () => {
    beforeEach(() => {
      useVoiceLanguageStore.setState({ sttLanguage: 'dyu', ttsLanguage: 'dyu' })
    })

    afterEach(() => {
      // Les suites existantes supposent la langue par défaut fr.
      useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
    })

    it('route vers mmsDyuSpeak avec le texte BRUT quand la voix dioula est prête', async () => {
      mockIsMmsDyuVoiceReady.mockResolvedValue(true)
      mockMmsDyuSpeak.mockResolvedValue(true)

      const callback = vi.fn()
      // Texte dioula (réponse traduite fra→dyu par conversation.ts) : le
      // chemin dyu ne doit NI le normaliser en français NI altérer ɛ/ɔ.
      tataSpeak('I ni ce ! N ye Tata ye.', callback)

      await vi.waitFor(() => {
        expect(mockMmsDyuSpeak).toHaveBeenCalledWith(
          'I ni ce ! N ye Tata ye.',
          expect.anything(),
        )
      })
      await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('done'))
      // La chaîne française n'est JAMAIS consultée quand la voix dyu parle.
      expect(speechSynthesis.speak).not.toHaveBeenCalled()
    })

    it('ne passe JAMAIS par la normalisation française des montants (toSpeechText)', async () => {
      mockIsMmsDyuVoiceReady.mockResolvedValue(true)
      mockMmsDyuSpeak.mockResolvedValue(true)

      tataSpeak('tôme 1500 FCFA la')

      await vi.waitFor(() => {
        expect(mockMmsDyuSpeak).toHaveBeenCalledWith(
          'tôme 1500 FCFA la',
          expect.anything(),
        )
      })
    })

    it('voix non installée → narration française (Web Speech) + jamais de MMS dyu', async () => {
      mockIsMmsDyuVoiceReady.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Bonjour', callback)

      await vi.waitFor(() => {
        // Repli audible réel : Web Speech parle (langue dyu = français en
        // attendant l'installation, signal explicite une fois par session).
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
      expect(mockMmsDyuSpeak).not.toHaveBeenCalled()
      const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0][0]
      utterance.onend()
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('done')
    })

    it('échec de synthèse dyu → repli français garanti (done unique)', async () => {
      mockIsMmsDyuVoiceReady.mockResolvedValue(true)
      mockMmsDyuSpeak.mockResolvedValue(false)

      const callback = vi.fn()
      tataSpeak('Aw ni ce', callback)

      await vi.waitFor(() => {
        expect(speechSynthesis.speak).toHaveBeenCalled()
      })
      const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0][0]
      utterance.onend()
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('done')
    })

    it('langue française → le moteur dyu n\'est JAMAIS consulté (zéro coût, zéro réseau)', () => {
      useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })

      tataSpeak('Bonjour')

      expect(mockIsMmsDyuVoiceReady).not.toHaveBeenCalled()
      expect(mockMmsDyuSpeak).not.toHaveBeenCalled()
    })
  })
})
