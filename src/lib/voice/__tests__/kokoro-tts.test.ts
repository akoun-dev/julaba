import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock du package kokoro-js — importé dynamiquement par kokoro-tts.ts
// (downloadKokoroVoice / kokoroSpeak), donc intercepté ici au niveau module.
// ⚠️ Le pipeline réel n'utilise PAS generate() (carte de voix figée de
// kokoro-js, sans voix française) mais tokenizer() + generate_from_ids().
const mockFromPretrained = vi.fn()
const mockTokenizer = vi.fn()
const mockGenerateFromIds = vi.fn()

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (...args: unknown[]) => mockFromPretrained(...args),
  },
}))

// Mock du phonémiseur espeak-ng — le glue est chargé via blob-URL (non
// mockable) : kokoro-tts.ts expose donc setEspeakGlueLoaderForTests() pour
// injecter ce factory. Il reçoit le texte via FS.writeFile (preRun) et
// rend des phonèmes IPA via FS.readFile.
const mockEspeakFactory = vi.fn()
const mockEspeakWriteFile = vi.fn()
const mockEspeakReadFile = vi.fn()

// État du Cache API simulé — un seul cache factice sert les trois noms
// ('transformers-cache' pour le modèle, 'kokoro-voices' pour ff_siwis.bin,
// 'julaba-espeak-wasm' pour le binaire espeak-ng). Comportement fidèle :
// delete retire les entrées, match ne répond que si l'URL est présente.
let cacheEntries: Array<{ url: string }>
let mockCache: {
  keys: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  match: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

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
    delete: vi.fn(async (request: { url: string } | string) => {
      const url = typeof request === 'string' ? request : request.url
      const before = cacheEntries.length
      cacheEntries = cacheEntries.filter((entry) => entry.url !== url)
      return cacheEntries.length < before
    }),
    match: vi.fn(async (request: { url: string } | string) => {
      const url = typeof request === 'string' ? request : request.url
      return cacheEntries.some((entry) => entry.url === url) ? new Response(new ArrayBuffer(8)) : undefined
    }),
    put: vi.fn(async (request: { url: string } | string) => {
      const url = typeof request === 'string' ? request : request.url
      cacheEntries.push({ url })
    }),
  }
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {})
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => mockCache) })
  // Téléchargement réseau des ressources espeak-ng (CDN) : réponse factice.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 })))
  setEspeakGlueLoaderForTests(async () => ({
    default: mockEspeakFactory as unknown as EspeakNgModule['default'],
  }))
  mockEspeakFactory.mockImplementation(async (options?: { preRun?: (module: unknown) => void }) => {
    const runtime = {
      FS: {
        writeFile: mockEspeakWriteFile,
        readFile: mockEspeakReadFile,
      },
    }
    // Le vrai factory Emscripten invoque preRun AVANT main() — c'est là que
    // kokoro-tts.ts écrit le texte à phonémiser.
    options?.preRun?.(runtime)
    return runtime
  })
  mockEspeakReadFile.mockReturnValue('bɔ̃ʒuʁ\n')
  mockTokenizer.mockImplementation((phonemes: string) => ({ input_ids: { dims: [1, phonemes.length] } }))
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
  phonemizeFrench,
  removeKokoroVoice,
  resetKokoroForTests,
  setEspeakGlueLoaderForTests,
  type EspeakNgModule,
} from '../kokoro-tts'

const MODEL_URL = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main/onnx/model_quantized.onnx`
const ESPEAK_GLUE_URL = 'https://unpkg.com/espeak-ng@1.0.2/dist/espeak-ng.js'
const ESPEAK_URL = 'https://unpkg.com/espeak-ng@1.0.2/dist/espeak-ng.wasm'
const ESPEAK_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.wasm'

/** Simule des ressources déjà téléchargées (from_pretrained résout). */
function mockModelAvailable() {
  mockFromPretrained.mockImplementation(async (_modelId: string, options?: {
    progress_callback?: (info: { status: string; loaded?: number; total?: number }) => void
  }) => {
    options?.progress_callback?.({ status: 'progress', loaded: 43, total: 86 })
    return { tokenizer: mockTokenizer, generate_from_ids: mockGenerateFromIds }
  })
}

/** Joue une génération réussie et pousse la lecture jusqu'à sa fin. */
async function speakToCompletion(text: string, options?: { rate?: number; volume?: number }) {
  mockGenerateFromIds.mockResolvedValue({ audio: new Float32Array(24_000), sampling_rate: 24_000 })
  const promise = kokoroSpeak(text, options)
  await vi.waitFor(() => expect(mockSource.start).toHaveBeenCalled())
  mockSource.onended?.()
  return promise
}

/** Le texte passé au phonémiseur (writeFile), espaces compactées. */
function phonemizerInput(): string {
  const calls = mockEspeakWriteFile.mock.calls as unknown as Array<[string, string, unknown?]>
  const last = calls[calls.length - 1]
  return last[1].replace(/\s+/g, ' ').trim()
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

    it('is false when only the model is cached — espeak-ng is missing', async () => {
      cacheEntries.push({ url: MODEL_URL })
      expect(await isKokoroVoiceReady()).toBe(false)
    })

    it('is true once BOTH model and espeak-ng resources are cached', async () => {
      cacheEntries.push({ url: MODEL_URL }, { url: ESPEAK_GLUE_URL }, { url: ESPEAK_URL })
      expect(await isKokoroVoiceReady()).toBe(true)
    })

    it('ignores unrelated cache entries', async () => {
      cacheEntries.push({ url: 'https://example.com/autre-chose.bin' })
      expect(await isKokoroVoiceReady()).toBe(false)
    })

    it('is true once the instances have been loaded', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await phonemizeFrench('Bonjour') // charge le module espeak en mémoire
      cacheEntries.length = 0 // même sans cache, les instances en mémoire suffisent
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

    it('also fetches and caches the espeak-ng glue and wasm binaries', async () => {
      mockModelAvailable()
      expect(await downloadKokoroVoice()).toBe(true)
      expect(fetch).toHaveBeenCalledWith(ESPEAK_GLUE_URL)
      expect(fetch).toHaveBeenCalledWith(ESPEAK_URL)
      expect(mockCache.put).toHaveBeenCalledWith(ESPEAK_GLUE_URL, expect.any(Response))
      expect(mockCache.put).toHaveBeenCalledWith(ESPEAK_URL, expect.any(Response))
    })

    it('reports download progress across model (0–85%) and espeak (100%)', async () => {
      mockModelAvailable()
      const onProgress = vi.fn()
      await downloadKokoroVoice(onProgress)
      expect(onProgress).toHaveBeenCalledWith(43) // 43/86 → 50 % du modèle → 85 % * 0,5
      expect(onProgress).toHaveBeenCalledWith(100)
    })

    it('falls back to the jsdelivr CDN when unpkg is unreachable', async () => {
      mockModelAvailable()
      ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
        if (String(url).includes('unpkg')) throw new Error('DNS unreachable')
        return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 })
      })
      expect(await downloadKokoroVoice()).toBe(true)
      expect(fetch).toHaveBeenCalledWith(ESPEAK_FALLBACK_URL)
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
    it('deletes only the model + espeak files and unloads the instances', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      cacheEntries.push({ url: MODEL_URL }, { url: ESPEAK_URL }, { url: 'https://example.com/autre.bin' })
      const deletedBefore = await removeKokoroVoice()
      expect(deletedBefore).toBeUndefined()
      const deletedUrls = (mockCache.delete.mock.calls as unknown as Array<[unknown]>).map(
        ([request]) => (typeof request === 'string' ? request : (request as { url: string }).url),
      )
      expect(deletedUrls).toContain(MODEL_URL)
      expect(deletedUrls).toContain(ESPEAK_URL)
      expect(deletedUrls).toContain(ESPEAK_GLUE_URL)
      expect(deletedUrls).not.toContain('https://example.com/autre.bin')
      expect(await isKokoroVoiceReady()).toBe(false)
    })
  })

  describe('phonemizeFrench', () => {
    it('sends the text through the espeak FS and returns trimmed IPA', async () => {
      mockEspeakReadFile.mockReturnValue('vˈɑ̃t də- tomˈat\npuʁ\n')
      expect(await phonemizeFrench('Vente de tomates pour')).toBe('vˈɑ̃t də- tomˈat puʁ')
      expect(mockEspeakWriteFile).toHaveBeenCalledWith(
        'julaba-input.txt',
        'Vente de tomates pour',
        expect.anything(),
      )
    })

    it('returns empty output for empty text', async () => {
      expect(await phonemizeFrench('')).toBe('')
      expect(await phonemizeFrench('   ')).toBe('')
      expect(mockEspeakFactory).not.toHaveBeenCalled()
    })

    it('propagates espeak failures (caller turns them into a graceful false)', async () => {
      mockModelAvailable()
      mockEspeakFactory.mockRejectedValue(new Error('abort'))
      await expect(phonemizeFrench('Bonjour')).rejects.toThrow('abort')
    })
  })

  describe('kokoroSpeak', () => {
    it('returns false when the resources are unavailable — never downloads on its own', async () => {
      expect(await kokoroSpeak('Bonjour')).toBe(false)
      expect(mockFromPretrained).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('returns false for empty text', async () => {
      expect(await kokoroSpeak('')).toBe(false)
      expect(await kokoroSpeak('   ')).toBe(false)
    })

    it('synthesizes via tokenizer + generate_from_ids with ff_siwis and waits for playback end', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      const result = await speakToCompletion('Bonjour')
      expect(result).toBe(true)
      expect(mockTokenizer).toHaveBeenCalledWith('bɔ̃ʒuʁ', { truncation: true })
      expect(mockGenerateFromIds).toHaveBeenCalledWith(
        { dims: [1, 'bɔ̃ʒuʁ'.length] },
        { voice: KOKORO_FR_VOICE, speed: 0.9 },
      )
      // generate() (voix validée contre la carte figée) n'est JAMAIS utilisé
      expect(mockGenerateFromIds.mock.calls[0][1].voice).toBe('ff_siwis')
      // Sortie audio : source → gain → destination
      expect(mockSource.connect).toHaveBeenCalled()
    })

    it('applies the requested speed (rate)', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion('Bonjour', { rate: 1.2 })
      expect(mockGenerateFromIds).toHaveBeenCalledWith(
        expect.anything(),
        { voice: KOKORO_FR_VOICE, speed: 1.2 },
      )
    })

    it('converts amounts to spoken French before phonemization', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion("Vente de tomates pour 1 500 FCFA, c'est bien ça ?")
      expect(phonemizerInput()).toBe("Vente de tomates pour mille cinq cents francs CFA, c'est bien ça ?")
      await speakToCompletion('Total : 25 000 F')
      expect(phonemizerInput()).toBe('Total : vingt-cinq mille francs CFA')
    })

    it('spells out remaining digits (PIN, phones) while keeping other text intact', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      await speakToCompletion('PIN 2580, téléphone 0700000000, code JID-0042')
      expect(phonemizerInput()).toBe(
        'PIN deux cinq huit zéro, téléphone zéro sept zéro zéro zéro zéro zéro zéro zéro zéro, code JID- zéro zéro quatre deux',
      )
    })

    it('returns false when generation fails', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerateFromIds.mockRejectedValue(new Error('Synthèse impossible'))
      expect(await kokoroSpeak('Bonjour')).toBe(false)
    })

    it('returns false when phonemization fails', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockEspeakFactory.mockRejectedValue(new Error('espeak abort'))
      expect(await kokoroSpeak('Bonjour')).toBe(false)
    })

    it('returns false when the audio payload is malformed', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerateFromIds.mockResolvedValue({ audio: null, sampling_rate: 0 })
      expect(await kokoroSpeak('Bonjour')).toBe(false)
    })

    it('gives up after the synthesis timeout instead of blocking narration', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerateFromIds.mockImplementation(() => new Promise(() => { /* ne résout jamais */ }))
      vi.useFakeTimers()
      const promise = kokoroSpeak('Bonjour')
      const assertion = expect(promise).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(30_000 + 'bɔ̃ʒuʁ'.length * 80 + 1_000)
      await assertion
      vi.useRealTimers()
    })

    it('stops playback via kokoroStop', async () => {
      mockModelAvailable()
      await downloadKokoroVoice()
      mockGenerateFromIds.mockResolvedValue({ audio: new Float32Array(24_000), sampling_rate: 24_000 })
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
