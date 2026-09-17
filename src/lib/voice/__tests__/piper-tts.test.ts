import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @mintplex-labs/piper-tts-web — its functions are lazy-imported via
// dynamic import() inside piper-tts.ts, so we set up module-level mocks
// that the dynamic import will resolve to.
const mockStored = vi.fn()
const mockDownload = vi.fn()
const mockRemove = vi.fn()
const mockPredict = vi.fn()
// piper-tts.ts's configurePiperWasm() overrides TtsSession.WASM_LOCATIONS
// before creating a session (see piper-tts.ts) — the mock must expose it
// or every piperSpeak path dies inside the try block and returns false.
const mockTtsSession = { WASM_LOCATIONS: {} as Record<string, string> }

vi.mock('@mintplex-labs/piper-tts-web', () => ({
  stored: mockStored,
  download: mockDownload,
  remove: mockRemove,
  predict: mockPredict,
  TtsSession: mockTtsSession,
}))

// Ensure window / Worker / indexedDB exist (node env doesn't have them)
beforeEach(() => {
  vi.clearAllMocks()
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {})
  }
  if (typeof globalThis.Worker === 'undefined') {
    vi.stubGlobal('Worker', class MockWorker {})
  }
  if (typeof globalThis.indexedDB === 'undefined') {
    vi.stubGlobal('indexedDB', {})
  }
  if (typeof globalThis.Audio === 'undefined') {
    class MockAudio {
      src = ''
      onended: (() => void) | null = null
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn()
      constructor(_src?: string) {}
    }
    vi.stubGlobal('Audio', MockAudio)
  }
})

// Fresh import after mocks are set up
import {
  isPiperSupported,
  isPiperVoiceReady,
  downloadPiperVoice,
  removePiperVoice,
  piperSpeak,
  piperStop,
  PIPER_FR_VOICE,
  sanitizeForPiper,
} from '../piper-tts'

describe('piper-tts', () => {
  describe('sanitizeForPiper', () => {
    it('normalizes digits and removes unsupported symbols', () => {
      expect(sanitizeForPiper('Vente #42 : 1 500 FCFA !')).toBe(
        'vente quatre deux : un cinq zéro zéro fcfa !',
      )
    })

    it('preserves French accents and apostrophes', () => {
      expect(sanitizeForPiper("C'est déjà prêt.")).toBe("c'est déjà prêt.")
    })
  })

  describe('PIPER_FR_VOICE', () => {
    it('is the correct French voice ID', () => {
      expect(PIPER_FR_VOICE).toBe('fr_FR-siwis-low')
    })
  })

  describe('isPiperSupported', () => {
    it('returns true when window/Worker/indexedDB exist', () => {
      expect(isPiperSupported()).toBe(true)
    })

    it('returns false when window is undefined', () => {
      const orig = globalThis.window
      // @ts-expect-error SSR test
      delete globalThis.window
      expect(isPiperSupported()).toBe(false)
      globalThis.window = orig
    })

    it('returns false when Worker is undefined', () => {
      const orig = globalThis.Worker
      // @ts-expect-error SSR test
      delete globalThis.Worker
      expect(isPiperSupported()).toBe(false)
      globalThis.Worker = orig
    })
  })

  describe('isPiperVoiceReady', () => {
    it('returns false when not supported', async () => {
      const orig = globalThis.window
      // @ts-expect-error SSR test
      delete globalThis.window
      expect(await isPiperVoiceReady()).toBe(false)
      globalThis.window = orig
    })

    it('returns true when voice is in stored list', async () => {
      mockStored.mockResolvedValue(['fr_FR-siwis-low'])
      expect(await isPiperVoiceReady()).toBe(true)
      expect(mockStored).toHaveBeenCalledOnce()
    })

    it('returns false when voice is not in stored list', async () => {
      mockStored.mockResolvedValue(['en_US-lessac-low'])
      expect(await isPiperVoiceReady()).toBe(false)
    })

    it('returns false when stored() throws', async () => {
      mockStored.mockRejectedValue(new Error('Module not found'))
      expect(await isPiperVoiceReady()).toBe(false)
    })
  })

  describe('downloadPiperVoice', () => {
    it('returns false when not supported', async () => {
      const orig = globalThis.window
      // @ts-expect-error SSR test
      delete globalThis.window
      expect(await downloadPiperVoice()).toBe(false)
      globalThis.window = orig
    })

    it('downloads voice and reports progress', async () => {
      const progressFn = vi.fn()
      mockDownload.mockImplementation(async (_voiceId: string, onProgress?: (p: { loaded: number; total: number }) => void) => {
        onProgress?.({ loaded: 50, total: 100 })
        onProgress?.({ loaded: 100, total: 100 })
      })

      const result = await downloadPiperVoice(progressFn)
      expect(result).toBe(true)
      expect(mockDownload).toHaveBeenCalledWith('fr_FR-siwis-low', expect.any(Function))
      expect(progressFn).toHaveBeenCalledWith(50)
      expect(progressFn).toHaveBeenCalledWith(100)
    })

    it('returns false when download fails', async () => {
      mockDownload.mockRejectedValue(new Error('Network error'))
      expect(await downloadPiperVoice()).toBe(false)
    })

    it('skips progress callback when total is 0', async () => {
      const progressFn = vi.fn()
      mockDownload.mockImplementation(async (_voiceId: string, onProgress?: (p: { loaded: number; total: number }) => void) => {
        onProgress?.({ loaded: 0, total: 0 })
      })

      const result = await downloadPiperVoice(progressFn)
      expect(result).toBe(true)
      expect(progressFn).not.toHaveBeenCalled()
    })
  })

  describe('removePiperVoice', () => {
    it('calls remove with correct voice ID', async () => {
      mockRemove.mockResolvedValue(undefined)
      await removePiperVoice()
      expect(mockRemove).toHaveBeenCalledWith('fr_FR-siwis-low')
    })

    it('does not throw on error', async () => {
      mockRemove.mockRejectedValue(new Error('Not found'))
      await expect(removePiperVoice()).resolves.not.toThrow()
    })
  })

  describe('piperSpeak', () => {
    it('returns false when voice is not ready', async () => {
      mockStored.mockResolvedValue([])
      expect(await piperSpeak('Bonjour')).toBe(false)
    })

    it('returns false when predict throws', async () => {
      mockStored.mockResolvedValue(['fr_FR-siwis-low'])
      mockPredict.mockRejectedValue(new Error('Synthesis error'))
      expect(await piperSpeak('Bonjour')).toBe(false)
    })

    it('plays audio when synthesis succeeds', async () => {
      mockStored.mockResolvedValue(['fr_FR-siwis-low'])
      const mockBlob = new Blob(['audio'], { type: 'audio/wav' })
      mockPredict.mockResolvedValue(mockBlob)

      // piper-tts.ts plays through the Web Audio API (AudioContext +
      // BufferSource), not an <audio> element — it decodes the WAV blob
      // and starts the source. Mock that path end to end.
      const mockStart = vi.fn()
      const mockSource = {
        buffer: null as unknown,
        connect: vi.fn(),
        start: mockStart,
        stop: vi.fn(),
      }
      class MockAudioContext {
        state = 'running'
        destination = {}
        resume = vi.fn().mockResolvedValue(undefined)
        decodeAudioData = vi.fn().mockResolvedValue({ mocked: 'buffer' })
        createBufferSource = vi.fn().mockReturnValue(mockSource)
      }
      vi.stubGlobal('AudioContext', MockAudioContext)

      const result = await piperSpeak('Bonjour')
      expect(result).toBe(true)
      expect(mockPredict).toHaveBeenCalledWith({ text: 'bonjour', voiceId: 'fr_FR-siwis-low' })
      expect(mockSource.connect).toHaveBeenCalled()
      expect(mockStart).toHaveBeenCalled()
    })
  })

  describe('piperStop', () => {
    it('does not throw when no audio is playing', () => {
      // piperStop calls audioEl?.pause() on a module-level variable that
      // is null by default, so it should not throw
      expect(() => piperStop()).not.toThrow()
    })
  })
})
