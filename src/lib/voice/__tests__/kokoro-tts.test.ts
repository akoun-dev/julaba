import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock du package kokoro-js — importé dynamiquement par kokoro-tts.ts
// (downloadKokoroVoice / kokoroSpeak), donc intercepté ici au niveau module.
const mockFromPretrained = vi.fn()
const mockGenerate = vi.fn()

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (...args: unknown[]) => mockFromPretrained(...args),
  },
}))

// État du Cache API simulé (Transformers.js met les fichiers ONNX en cache
// sous le nom 'transformers-cache' — kokoro-tts.ts y vérifie la présence du
// modèle sans jamais déclencher de téléchargement).
let cacheEntries: Array<{ url: string }>
let mockCache: { keys: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

let mockSource: {
  buffer: unknown
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onended: (() => void) | null
}

class MockAudioContext {
  state = 'running'
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => ({
    duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
  }))
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() }))
  createBufferSource = vi.fn(() => mockSource)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetKokoroForTests()
  cacheEntries = []
  mockCache = {
    keys: vi.fn(async () => cacheEntries),
    delete: vi.fn(async (request: { url: string }) => {
      const before = cacheEntries.length
      cacheEntries = cacheEntries.filter((entry) => entry.url !== request.url)
      return cacheEntries.length < before
    }),
  }
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {})
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => mockCache) })
  mockSource = {
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }
  if (typeof globalThis.AudioContext === 'undefined') {
    vi.stubGlobal('AudioContext', MockAudioContext)
  }
})

// Import après la mise en place des mocks/globaux
import {
  KOKORO_DTYPE,
  KOKORO_FR_VOICE,
  KOKORO_MODEL_ID,
  downloadKokoroVoice,
  isKokoroSupported,
  isKokoroVoiceReady,
  kokoroSpeak,
  kokoroStop,
  removeKokoroVoice,
  resetKokoroForTests,
} from '../kokoro-tts'

const MODEL_URL = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main/onnx/model_quantized.onnx`

/** Simule un modèle déjà téléchargé (from_pretrained résout). */
function mockModelAvailable() {
  mockFromPretrained.mockImplementation(async (_modelId: string, options?: {
    progress_callback?: (info: { status: string; loaded?: number; total?: number }) => void
  }) => {
    options?.progress_callback?.({ status: 'progress', loaded: 43, total: 86 })
    return { generate: mockGenerate }
  })
}

/** Joue une génération réussie et pousse la lecture jusqu'à sa fin. */
async function speakToCompletion(text: string, options?: { rate?: number; volume?: number }) {
  mockGenerate.mockResolvedValue({ audio: new Float32Array(24_000), sampling_rate: 24_000 })
  const promise = kokoroSpeak(text, options)
  await vi.waitFor(() => expect(mockSource.start).toHaveBeenCalled())
  mockSource.onended?.()
  return promise
}

describe('kokoro-tts', () => {
  describe('isKokoroSupported', () => {
    it('returns true when window, AudioContext and caches exist', () => {
      expect(isKokoroSupported()).toBe(true)
    })

    it('returns false when caches is unavailable', () => {
      vi.stubGlobal('caches', undefined)
      expect(isKokoroSupported()).toBe(false)
    })
  })

  describe('isKokoroVoiceReady', () => {
    it('is false when nothing was downloaded and no instance is loaded', async () => {
      expect(await isKokoroVoiceReady()).toBe(false)
      expect(mockFromPretrained).not.toHaveBeenCalled()
    })

    it('is true when the model files are present in the Transformers cache', async () => {
      cacheEntries.push({ url: MODEL_URL })
      expect(await isKokoroVoiceReady()).toBe(true)
    })

    it('ignores unrelated cache entries', async () => {
      cacheEntries.push({ url: 'https://example.com/autre-chose.bin' })
      expect(await isKokoroVoiceReady()).toBe(false)
    })

    it('is true once the instance has been loaded', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      cacheEntries.length = 0 // même sans cache, l'instance en mémoire suffit
      expect(await isKokoroVoiceReady()).toBe(true)
    })

    it('is false when caches is unavailable', async () => {
      vi.stubGlobal('caches', undefined)
      expect(await isKokoroVoiceReady()).toBe(false)
    })
  })

  describe('downloadKokoroVoice', () => {
    it('returns false without window support', async () => {
      const orig = globalThis.window
      // @ts-expect-error SSR test
      delete globalThis.window
      expect(await downloadKokoroVoice()).toBe(false)
      globalThis.window = orig
    })

    it('loads the French voice with the quantified q8 model on wasm', async () => {
      mockModelAvailable()
      expect(await downloadKokoroVoice()).toBe(true)
      expect(mockFromPretrained).toHaveBeenCalledWith(
        KOKORO_MODEL_ID,
        expect.objectContaining({ dtype: KOKORO_DTYPE, device: 'wasm' }),
      )
    })

    it('reports download progress', async () => {
      mockModelAvailable()
      const onProgress = vi.fn()
      await downloadKokoroVoice(onProgress)
      expect(onProgress).toHaveBeenCalledWith(50) // 43/86
    })

    it('returns false on failure and can retry later', async () => {
      mockFromPretrained.mockRejectedValueOnce(new Error('Hors ligne'))
      expect(await downloadKokoroVoice()).toBe(false)
      mockModelAvailable()
      expect(await downloadKokoroVoice()).toBe(true)
      expect(mockFromPretrained).toHaveBeenCalledTimes(2)
    })
  })

  describe('removeKokoroVoice', () => {
    it('deletes only the model files and unloads the instance', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      cacheEntries.push({ url: MODEL_URL }, { url: 'https://example.com/autre.bin' })
      await removeKokoroVoice()
      expect(mockCache.delete).toHaveBeenCalledTimes(1)
      expect(await isKokoroVoiceReady()).toBe(false)
    })
  })

  describe('kokoroSpeak', () => {
    it('returns false when the model is unavailable — never downloads on its own', async () => {
      expect(await kokoroSpeak('Bonjour')).toBe(false)
      expect(mockFromPretrained).not.toHaveBeenCalled()
    })

    it('returns false for empty text', async () => {
      expect(await kokoroSpeak('')).toBe(false)
      expect(await kokoroSpeak('   ')).toBe(false)
    })

    it('synthesizes successfully once the model is ready and waits for playback end', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      const result = await speakToCompletion('Bonjour')
      expect(result).toBe(true)
      expect(mockGenerate).toHaveBeenCalledWith('Bonjour', {
        voice: KOKORO_FR_VOICE,
        speed: 0.9,
      })
      // Sortie audio : source → gain → destination
      expect(mockSource.connect).toHaveBeenCalled()
    })

    it('applies the requested speed (rate) and volume', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion('Bonjour', { rate: 1.2, volume: 0.5 })
      expect(mockGenerate).toHaveBeenCalledWith('Bonjour', {
        voice: KOKORO_FR_VOICE,
        speed: 1.2,
      })
    })

    it('converts amounts to spoken French before synthesis', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion("Vente de tomates pour 1 500 FCFA, c'est bien ça ?")
      expect(mockGenerate).toHaveBeenCalledWith(
        "Vente de tomates pour mille cinq cents francs CFA, c'est bien ça ?",
        expect.objectContaining({ voice: KOKORO_FR_VOICE }),
      )
      await speakToCompletion('Total : 25 000 F')
      expect(mockGenerate).toHaveBeenCalledWith(
        'Total : vingt-cinq mille francs CFA',
        expect.anything(),
      )
    })

    it('never alters PINs, phone numbers or identifiers', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion('PIN 2580, téléphone 0700000000, code JID-0042')
      expect(mockGenerate).toHaveBeenCalledWith(
        'PIN 2580, téléphone 0700000000, code JID-0042',
        expect.anything(),
      )
    })

    it('returns false when generation fails', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerate.mockRejectedValue(new Error('Synthèse impossible'))
      expect(await kokoroSpeak('Bonjour')).toBe(false)
    })

    it('returns false when the audio payload is malformed', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerate.mockResolvedValue({ audio: null, sampling_rate: 0 })
      expect(await kokoroSpeak('Bonjour')).toBe(false)
    })

    it('gives up after the synthesis timeout instead of blocking narration', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerate.mockImplementation(() => new Promise(() => { /* ne résout jamais */ }))
      vi.useFakeTimers()
      const promise = kokoroSpeak('Bonjour')
      const assertion = expect(promise).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(30_000 + 'Bonjour'.length * 80 + 1_000)
      await assertion
      vi.useRealTimers()
    })

    it('stops playback via kokoroStop', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerate.mockResolvedValue({ audio: new Float32Array(24_000), sampling_rate: 24_000 })
      const promise = kokoroSpeak('Bonjour')
      await vi.waitFor(() => expect(mockSource.start).toHaveBeenCalled())
      kokoroStop()
      expect(mockSource.stop).toHaveBeenCalled()
      mockSource.onended?.()
      expect(await promise).toBe(true)
    })

    it('kokoroStop is a safe no-op when nothing is playing', () => {
      expect(() => kokoroStop()).not.toThrow()
    })
  })
})
