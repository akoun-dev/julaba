import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock transformers.js — importé dynamiquement par mms-tts.ts (loadMms),
// intercepté au niveau module par vitest, imports dynamiques inclus. Le
// pipeline simulé capture le texte reçu (garde « le moteur reçoit le texte
// normalisé bci, PAS la normalisation française ») et rend un Float32Array.
const mockPipeline = vi.fn()
const mockPipelineFactory = vi.fn(async (..._args: unknown[]) => mockPipeline)

vi.mock('@xenova/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipelineFactory(...args),
}))

// État du Cache API simulé — fidèle : put ajoute, match ne répond que si
// l'URL exacte est présente, delete retire, keys liste.
let cacheEntries: Array<{ url: string }>
let mockCache: {
  keys: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  match: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

function stubCacheApi(): void {
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
      return cacheEntries.some((entry) => entry.url === url)
        ? new Response(new ArrayBuffer(8))
        : undefined
    }),
    put: vi.fn(async (request: { url: string } | string) => {
      const url = typeof request === 'string' ? request : request.url
      cacheEntries.push({ url })
    }),
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => mockCache) })
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
  resetMmsForTests()
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {})
  }
  if (typeof globalThis.AudioContext === 'undefined') {
    vi.stubGlobal('AudioContext', MockAudioContext)
  }
  stubCacheApi()
  mockSource = {
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }
})

import {
  MMS_MODEL_ID,
  MMS_MODEL_SIZE_MB,
  normalizeBciText,
  buildMmsTokenizerJson,
  isMmsSupported,
  isMmsBciVoiceReady,
  downloadMmsBciVoice,
  removeMmsBciVoice,
  mmsBciSpeak,
  resetMmsForTests,
} from '../mms-tts'

const MODEL_BASE = `https://huggingface.co/${MMS_MODEL_ID}/resolve/main`

describe('mms-tts — normalizeBciText (garde vocab 30 chars sans tons)', () => {
  it('retire les diacritiques de tons mais préserve ɛ et ɔ', () => {
    // à/é/è/ǹ/ɔ́ = lettre + marque combinante → lettre nue ; ɛ et ɔ (lettres
    // dédiées, non décomposables) restent intactes — elles sont DANS le vocab.
    expect(normalizeBciText('nànwlɛ àbó kɔ́')).toBe('nanwlɛ abo kɔ')
    expect(normalizeBciText('ɛ')).toBe('ɛ')
    expect(normalizeBciText('ɔ')).toBe('ɔ')
  })

  it('unifie les apostrophes et préserve ʼ (dans le vocab du checkpoint)', () => {
    expect(normalizeBciText('n’anwlɛ')).toBe("n'anwlɛ")
    expect(normalizeBciText('n‘anwlɛ')).toBe("n'anwlɛ")
    // ʼ (U+02BC) est une lettre du vocab donor (id 1) — PAS une pause.
    expect(normalizeBciText('aʼb')).toBe('aʼb')
  })

  it('transforme la ponctuation et les symboles en pauses', () => {
    expect(normalizeBciText('Akwaba !')).toBe('Akwaba')
    expect(normalizeBciText('Akwaba. Ahou,  Yako;')).toBe('Akwaba Ahou Yako')
    // Devises / symboles hors périmètre pilote ; les tons sont retirés
    // (« marché » → « marche » — le vocab donor ne note pas les tons).
    expect(normalizeBciText('vente #12 @marché')).toBe('vente 12 marche')
  })

  it('est idempotent et gère les cas vides', () => {
    const once = normalizeBciText('Àkàmbà ɔ̂')
    expect(normalizeBciText(once)).toBe(once)
    expect(normalizeBciText('')).toBe('')
    expect(normalizeBciText('   !!!   ')).toBe('')
  })
})

describe('mms-tts — buildMmsTokenizerJson (port build_tokenizer_json.py)', () => {
  const vocab = { a: 0, b: 1, '-': 2 }
  const config = {
    pad_token: 'a',
    unk_token: '<unk>',
    added_tokens_decoder: { '3': { content: '<unk>' } },
  }

  it('produit un tokenizer fast avec vocab WordLevel, pad apposé et unk hors vocab', () => {
    const parsed = JSON.parse(buildMmsTokenizerJson(vocab, config))
    expect(parsed.model.type).toBe('WordLevel')
    expect(parsed.model.vocab).toEqual(vocab)
    expect(parsed.model.unk_token).toBe('<unk>')
    expect(parsed.added_tokens[0]).toMatchObject({ id: 3, content: '<unk>', special: true })
    // Apposition du pad en fin de séquence (astuce Replace du port fra).
    const normalizers = parsed.normalizer.normalizers
    expect(normalizers[0].type).toBe('Lowercase')
    expect(normalizers[3]).toMatchObject({ type: 'Replace', content: 'a' })
  })

  it('échappe la whitelist pour JAVASCRIPT (\\- mais jamais « \\ »)', () => {
    const parsed = JSON.parse(buildMmsTokenizerJson(vocab, config))
    // Regex JS valide : le tiret est échappé, l'espace du vocab resterait
    // littéral — le piège re.escape() de Python (« \ ») est exclu.
    expect(parsed.normalizer.normalizers[1].pattern.Regex).toBe('[^ab\\-]')
    // La classe construite compile réellement en JS avec le flag u.
    expect(() => new RegExp(parsed.normalizer.normalizers[1].pattern.Regex, 'gu')).not.toThrow()
  })

  it('retombe sur le premier char comme pad si la config n’en fournit pas', () => {
    const parsed = JSON.parse(buildMmsTokenizerJson({ a: 0, b: 1 }, {}))
    expect(parsed.normalizer.normalizers[3].content).toBe('a')
    expect(parsed.added_tokens[0].id).toBe(2)
  })
})

describe('mms-tts — gardes d’environnement (jamais de téléchargement implicite)', () => {
  it('isMmsSupported : false sans window ni caches', () => {
    vi.stubGlobal('window', undefined as unknown as object)
    expect(isMmsSupported()).toBe(false)
  })

  it('isMmsBciVoiceReady : false sans support, true si modèle + tokenizer en cache', async () => {
    vi.stubGlobal('window', undefined as unknown as object)
    expect(await isMmsBciVoiceReady()).toBe(false)

    // ⚠️ vi.stubGlobal persiste entre tests (unstubGlobals off) : restaurer
    // explicitement un environnement supporté.
    vi.stubGlobal('window', {})
    stubCacheApi()
    cacheEntries.push({ url: `${MODEL_BASE}/onnx/model.onnx` })
    // Tokenizer manquant = état à moitié téléchargé = PAS prêt.
    expect(await isMmsBciVoiceReady()).toBe(false)
    cacheEntries.push({ url: `${MODEL_BASE}/tokenizer.json` })
    expect(await isMmsBciVoiceReady()).toBe(true)
  })

  it('mmsBciSpeak : false immédiat sans ressources, AUCUN fetch réseau lancé', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await mmsBciSpeak('Akwaba')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockPipelineFactory).not.toHaveBeenCalled()
  })

  it('mmsBciSpeak : false sur texte vide', async () => {
    expect(await mmsBciSpeak('   ')).toBe(false)
  })
})

describe('mms-tts — downloadMmsBciVoice (opt-in, pré-remplissage Cache API)', () => {
  function stubFetchHappy(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('vocab.json')) {
        return new Response(JSON.stringify({ a: 0, b: 1, ' ': 2 }))
      }
      if (url.endsWith('tokenizer_config.json')) {
        return new Response(JSON.stringify({ pad_token: 'a', unk_token: '<unk>' }))
      }
      if (url.endsWith('onnx/model.onnx')) {
        return new Response(new ArrayBuffer(64))
      }
      return new Response(JSON.stringify({ ok: true }))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('télécharge les fichiers, GÉNÈRE le tokenizer.json et pré-remplit les clés exactes', async () => {
    const fetchMock = stubFetchHappy()
    const percents: number[] = []
    const ok = await downloadMmsBciVoice((p) => percents.push(p))
    expect(ok).toBe(true)
    // 6 fichiers du dépôt (5 petits + poids) + tokenizer.json généré.
    expect(fetchMock).toHaveBeenCalledTimes(6)
    const urls = cacheEntries.map((e) => e.url)
    expect(urls).toContain(`${MODEL_BASE}/tokenizer.json`)
    expect(urls).toContain(`${MODEL_BASE}/onnx/model.onnx`)
    expect(urls).toContain(`${MODEL_BASE}/config.json`)
    expect(urls).toContain(`${MODEL_BASE}/vocab.json`)
    // Progression terminée à 100.
    expect(percents[percents.length - 1]).toBe(100)
  })

  it('échec réseau → false + raison warn, jamais d’exception propagée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau coupé') }))
    const ok = await downloadMmsBciVoice()
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('fichier poids en erreur HTTP → false (échec explicite)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('onnx/model.onnx')) {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({}))
    }))
    expect(await downloadMmsBciVoice()).toBe(false)
    warn.mockRestore()
  })
})

describe('mms-tts — mmsBciSpeak (chemin nominal, timeout, repli)', () => {
  function primeReadyState(): void {
    cacheEntries.push(
      { url: `${MODEL_BASE}/onnx/model.onnx` },
      { url: `${MODEL_BASE}/tokenizer.json` },
    )
  }

  it('synthétise le texte normalisé bci et joue l’audio, callback résolu à la fin réelle', async () => {
    primeReadyState()
    const received: string[] = []
    mockPipeline.mockImplementation(async (text: string) => {
      received.push(text)
      return { audio: new Float32Array(1600), sampling_rate: 16000 }
    })
    const ok = await mmsBciSpeak('Nànwlɛ, àbó !')
    expect(ok).toBe(true)
    // Le moteur reçoit le texte BCI normalisé (pas de toSpeechText fr) —
    // ɛ préservée, tons retirés, ponctuation en pauses.
    expect(received[0]).toBe('Nanwlɛ abo')
    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'text-to-speech',
      MMS_MODEL_ID,
      expect.objectContaining({ quantized: false }),
    )
    // Lecture : source connectée puis démarrée ; fin réelle via onended.
    expect(mockSource.start).toHaveBeenCalled()
  })

  it('retourne false si la synthèse jette (repli français de tataSpeak)', async () => {
    primeReadyState()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPipeline.mockRejectedValue(new Error('ONNX fail'))
    expect(await mmsBciSpeak('Akwaba')).toBe(false)
    warn.mockRestore()
  })

  it('retourne false si le résultat est inutilisable (audio vide)', async () => {
    primeReadyState()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPipeline.mockResolvedValue({ audio: new Float32Array(0), sampling_rate: 16000 })
    expect(await mmsBciSpeak('Akwaba')).toBe(false)
    warn.mockRestore()
  })
})

describe('mms-tts — removeMmsBciVoice', () => {
  it('supprime toutes les entrées du modèle et décharge l’instance', async () => {
    cacheEntries.push(
      { url: `${MODEL_BASE}/onnx/model.onnx` },
      { url: `${MODEL_BASE}/tokenizer.json` },
      { url: `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx` },
    )
    await removeMmsBciVoice()
    const urls = cacheEntries.map((e) => e.url)
    expect(urls.some((u) => u.includes(MMS_MODEL_ID))).toBe(false)
    // La voix Kokoro (autre modèle) n'est PAS touchée.
    expect(urls.some((u) => u.includes('Kokoro-82M'))).toBe(true)
  })
})

describe('mms-tts — constantes UI', () => {
  it('taille annoncée cohérente avec le choix fp32 documenté', () => {
    expect(MMS_MODEL_SIZE_MB).toBe(114)
  })
})
