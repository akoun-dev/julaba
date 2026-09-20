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

/** Données réellement écrites dans les AudioBuffer créés (MODE-917 : permet
 * de vérifier le post-traitement — trim, normalisation, pauses). */
let createdBuffers: Float32Array[]

class MockAudioContext {
  state = 'running'
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => {
    const data = new Float32Array(length)
    createdBuffers.push(data)
    return {
      duration: length / sampleRate,
      getChannelData: () => data,
    }
  })
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() }))
  createBufferSource = vi.fn(() => mockSource)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMmsForTests()
  createdBuffers = []
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
  MMS_DYU_MODEL_ID,
  MMS_DYU_MODEL_SIZE_MB,
  MMS_DYU_MODEL_URL,
  normalizeBciText,
  normalizeDyuText,
  buildMmsTokenizerJson,
  isMmsSupported,
  isMmsBciVoiceReady,
  isMmsDyuVoiceReady,
  downloadMmsBciVoice,
  downloadMmsDyuVoice,
  removeMmsBciVoice,
  removeMmsDyuVoice,
  mmsBciSpeak,
  mmsDyuSpeak,
  resetMmsForTests,
} from '../mms-tts'

const MODEL_BASE = `https://huggingface.co/${MMS_MODEL_ID}/resolve/main`
const DYU_BASE = `https://huggingface.co/${MMS_DYU_MODEL_ID}/resolve/main`

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
      // Contenu audible réaliste — un audio muet est désormais un échec
      // (MODE-917 : la sortie VITS serait filtrée, jamais jouée muette).
      return { audio: tone(1600, 0.2), sampling_rate: 16000 }
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

// ════════════════════════════════════════════════════════════════════════════
// MODE-914 — voix dioula (facebook/mms-tts-dyu, port ONNX produit par nous)
// ════════════════════════════════════════════════════════════════════════════

describe('mms-tts dyu — normalizeDyuText (vocab 32 symboles sans chiffres)', () => {
  it('retire les diacritiques mais préserve ŋ ɔ ɛ ɲ (lettres dédiées)', () => {
    expect(normalizeDyuText('An bɛ́ sɛ ka baara kɛ')).toBe('An bɛ sɛ ka baara kɛ')
    expect(normalizeDyuText('ɲɛ ɔ ŋɔ ɛ́ ɔ́')).toBe('ɲɛ ɔ ŋɔ ɛ ɔ')
    expect(normalizeDyuText('ɛ')).toBe('ɛ')
    expect(normalizeDyuText('ɔ')).toBe('ɔ')
    expect(normalizeDyuText('ŋ')).toBe('ŋ')
    expect(normalizeDyuText('ɲ')).toBe('ɲ')
  })

  it('transforme les CHIFFRES en pauses (le vocab dyu n\'en a aucun)', () => {
    // Différence clé avec le bci : pas de \p{N} dans le vocab dyu.
    expect(normalizeDyuText('vente 1500 FCFA')).toBe('vente FCFA')
    expect(normalizeDyuText('pin 2580')).toBe('pin')
  })

  it('unifie les apostrophes, ponctuation en pauses, idempotent', () => {
    expect(normalizeDyuText('n’ye Tata ye')).toBe("n'ye Tata ye")
    expect(normalizeDyuText('I ni ce ! N ye Tata ye.')).toBe('I ni ce N ye Tata ye')
    const once = normalizeDyuText('An bɛ se ka baara kɛ.')
    expect(normalizeDyuText(once)).toBe(once)
    expect(normalizeDyuText('')).toBe('')
    expect(normalizeDyuText('   !!! 123  ')).toBe('')
  })
})

describe('mms-tts dyu — gardes d’environnement (jamais de téléchargement implicite)', () => {
  it('isMmsDyuVoiceReady : false sans support, true si modèle + tokenizer en cache', async () => {
    vi.stubGlobal('window', undefined as unknown as object)
    expect(await isMmsDyuVoiceReady()).toBe(false)

    vi.stubGlobal('window', {})
    stubCacheApi()
    cacheEntries.push({ url: `${DYU_BASE}/onnx/model.onnx` })
    expect(await isMmsDyuVoiceReady()).toBe(false)
    cacheEntries.push({ url: `${DYU_BASE}/tokenizer.json` })
    expect(await isMmsDyuVoiceReady()).toBe(true)
  })

  it('mmsDyuSpeak : false immédiat sans ressources, AUCUN fetch (ni proxy ni HF)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await mmsDyuSpeak('I ni ce')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockPipelineFactory).not.toHaveBeenCalled()
  })

  it('mmsDyuSpeak : false sur texte vide', async () => {
    expect(await mmsDyuSpeak('   ')).toBe(false)
  })
})

describe('mms-tts dyu — downloadMmsDyuVoice (petits fichiers embarqués, poids via proxy)', () => {
  it('un SEUL fetch (le poids) et 7 clés de cache sous l\'id virtuel dyu', async () => {
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(64)))
    vi.stubGlobal('fetch', fetchMock)
    const percents: number[] = []
    const ok = await downloadMmsDyuVoice((p) => percents.push(p))
    expect(ok).toBe(true)
    // Un seul téléchargement réseau : le poids 114 Mo via le proxy app.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(MMS_DYU_MODEL_URL)
    const urls = cacheEntries.map((e) => e.url)
    for (const file of ['config.json', 'vocab.json', 'tokenizer_config.json',
      'special_tokens_map.json', 'added_tokens.json', 'tokenizer.json', 'onnx/model.onnx']) {
      expect(urls).toContain(`${DYU_BASE}/${file}`)
    }
    expect(percents[percents.length - 1]).toBe(100)
  })

  it('le tokenizer.json généré utilise le vocab dyu réel (pad « t », unk id 32)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(16))))
    await downloadMmsDyuVoice()
    const entry = cacheEntries.find((e) => e.url === `${DYU_BASE}/tokenizer.json`)
    expect(entry).toBeDefined()
    // Le générateur est couvert par ses propres tests bci — on vérifie ici la
    // STRUCTURE attendue pour le vocab dyu embarqué (pad « t », unk hors vocab).
    const { MMS_DYU_VOCAB, MMS_DYU_TOKENIZER_CONFIG } = await import('../mms-dyu-assets')
    const expected = JSON.parse(buildMmsTokenizerJson(MMS_DYU_VOCAB, MMS_DYU_TOKENIZER_CONFIG))
    expect(expected.normalizer.normalizers[3].content).toBe('t')
    expect(expected.added_tokens[0]).toMatchObject({ id: 32, content: '<unk>' })
    // Le whitelistage du vocab réel compile bien en JS (letters + ŋ ɔ ɛ ɲ + ' - _).
    const whitelist = expected.normalizer.normalizers[1].pattern.Regex as string
    expect(() => new RegExp(whitelist, 'gu')).not.toThrow()
  })

  it('échec réseau sur le poids → false + warn, jamais d\'exception propagée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau coupé') }))
    expect(await downloadMmsDyuVoice()).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('poids en erreur HTTP (proxy 502) → false (échec explicite)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erreur', { status: 502 })))
    expect(await downloadMmsDyuVoice()).toBe(false)
    warn.mockRestore()
  })
})

describe('mms-tts dyu — mmsDyuSpeak (chemin nominal, texte dioula brut)', () => {
  function primeDyuReadyState(): void {
    cacheEntries.push(
      { url: `${DYU_BASE}/onnx/model.onnx` },
      { url: `${DYU_BASE}/tokenizer.json` },
    )
  }

  it('synthétise le texte dioula normalisé PAR PHRASE (ɛ préservée, pauses restaurées)', async () => {
    primeDyuReadyState()
    const received: string[] = []
    mockPipeline.mockImplementation(async (text: string) => {
      received.push(text)
      // Contenu audible réaliste (audio muet = échec depuis MODE-917).
      return { audio: tone(1600, 0.2), sampling_rate: 16000 }
    })
    const ok = await mmsDyuSpeak('I ni ce ! N ye Tata ye.')
    expect(ok).toBe(true)
    // MODE-917 : un appel par phrase — la ponctuation, filtrée par la
    // whitelist du tokenizer, ne fait plus disparaître les pauses.
    expect(received).toEqual(['I ni ce', 'N ye Tata ye'])
    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'text-to-speech',
      MMS_DYU_MODEL_ID,
      expect.objectContaining({ quantized: false }),
    )
    expect(mockSource.start).toHaveBeenCalled()
  })

  it('retourne false si la synthèse jette (repli français de tataSpeak)', async () => {
    primeDyuReadyState()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPipeline.mockRejectedValue(new Error('ONNX fail'))
    expect(await mmsDyuSpeak('I ni ce')).toBe(false)
    warn.mockRestore()
  })
})

describe('mms-tts dyu — removeMmsDyuVoice', () => {
  it('supprime les clés dyu SANS toucher aux clés baoulé/kokoro', async () => {
    cacheEntries.push(
      { url: `${DYU_BASE}/onnx/model.onnx` },
      { url: `${DYU_BASE}/tokenizer.json` },
      { url: `${MODEL_BASE}/onnx/model.onnx` },
      { url: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx' },
    )
    await removeMmsDyuVoice()
    const urls = cacheEntries.map((e) => e.url)
    expect(urls.some((u) => u.includes(MMS_DYU_MODEL_ID))).toBe(false)
    expect(urls.some((u) => u.includes(MMS_MODEL_ID))).toBe(true)
    expect(urls.some((u) => u.includes('Kokoro-82M'))).toBe(true)
  })
})

describe('mms-tts dyu — constantes UI', () => {
  it('taille annoncée = 114 Mo (fp32 114 221 861 octets) et id de cache virtuel', () => {
    expect(MMS_DYU_MODEL_SIZE_MB).toBe(114)
    expect(MMS_DYU_MODEL_ID).toBe('julaba-voices/mms-tts-dyu-onnx')
    expect(MMS_DYU_MODEL_URL).toBe('/api/voix/dyu-model')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// MODE-917 — qualité d'écoute : chiffres→mots, post-traitement audio, pauses
// ════════════════════════════════════════════════════════════════════════════

/** Sinusoïde 440 Hz d'amplitude `amp` — contenu « audible » pour le trim. */
function tone(n: number, amp: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 16000)
  return out
}

/** Pré-remplit le cache de la voix demandée (helpers locaux aux describes
 * historiques non visibles ici). */
function primeVoiceCache(kind: 'bci' | 'dyu'): void {
  const base = kind === 'bci' ? MODEL_BASE : DYU_BASE
  cacheEntries.push(
    { url: `${base}/onnx/model.onnx` },
    { url: `${base}/tokenizer.json` },
  )
}

/** Résout la lecture immédiatement (onended) plutôt que par le watchdog. */
async function resolvePlayback(p: Promise<boolean>): Promise<boolean> {
  await vi.waitFor(() => expect(mockSource.onended).not.toBeNull())
  mockSource.onended?.()
  return p
}

describe('mms-tts MODE-917 — chiffres → mots avant synthèse', () => {
  it('dyu : un montant chiffré est synthétisé en numérales jula (plus de trou silencieux)', async () => {
    primeVoiceCache('dyu')
    const received: string[] = []
    mockPipeline.mockImplementation(async (text: string) => {
      received.push(text)
      return { audio: tone(1600, 0.2), sampling_rate: 16000 }
    })
    await resolvePlayback(mmsDyuSpeak('An bɛ sara 5000 F ye.'))
    expect(received).toEqual(['An bɛ sara waa looru F ye'])
  })

  it('bci : nombre isolé d un chiffre converti, run multi-chiffres intact', async () => {
    primeVoiceCache('bci')
    const received: string[] = []
    mockPipeline.mockImplementation(async (text: string) => {
      received.push(text)
      return { audio: tone(1600, 0.2), sampling_rate: 16000 }
    })
    await resolvePlayback(mmsBciSpeak('3 kilo de riz, 1500 F.'))
    // « 3 » → nsan ; « 1500 » inchangé (centaines/milliers non sourcées).
    expect(received).toEqual(['nsan kilo de riz 1500 F'])
  })
})

describe('mms-tts MODE-917 — post-traitement audio et pauses', () => {
  function primeTwoSegments(): void {
    primeVoiceCache('dyu')
    // Chaque segment : 0,1 s de silence + 0,2 s de ton (crête 0,15) + 0,1 s
    // de silence — le trim retire les bords, la normalisation remonte à 0,85.
    mockPipeline.mockImplementation(async () => ({
      audio: Float32Array.from([
        ...new Float32Array(1600),
        ...tone(3200, 0.15),
        ...new Float32Array(1600),
      ]),
      sampling_rate: 16000,
    }))
  }

  it('trim + normalisation de crête + pause 220 ms (rate 1)', async () => {
    primeTwoSegments()
     await resolvePlayback(mmsDyuSpeak('An bɛ sara ye. I ni ce.', { rate: 1 }))
    // Trim : 3200+2×800 (marge 50 ms) = 4800 par segment ; pause 220 ms = 3520.
    expect(createdBuffers).toHaveLength(1)
    const data = createdBuffers[0]
    expect(data.length).toBe(4800 * 2 + 3520)
    let peak = 0
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
     expect(peak).toBeCloseTo(0.82, 2) // niveau homogène et remonté
    expect(data[0]).toBeCloseTo(0, 6) // fondu d'ouverture anti-clic
    // La pause inter-phrases est bien silencieuse.
    const pause = data.slice(4800, 4800 + 3520)
    expect(pause.every((v) => v === 0)).toBe(true)
  })

   it('rate module les pauses inter-phrases (rate 0,75 → pause 293 ms)', async () => {
     primeTwoSegments()
     await resolvePlayback(mmsDyuSpeak('An bɛ sara ye. I ni ce.', { rate: 0.75 }))
     expect(createdBuffers[0].length).toBe(4800 * 2 + 4680)
  })

  it('tout-ou-rien : un segment en échec → false (jamais de narration partielle)', async () => {
    primeVoiceCache('dyu')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPipeline.mockImplementation(async (text: string) => {
      if (text.includes('I ni ce')) throw new Error('deuxième phrase perdue')
      return { audio: new Float32Array(1600), sampling_rate: 16000 }
    })
    expect(await mmsDyuSpeak('An bɛ sara ye. I ni ce.')).toBe(false)
    expect(mockSource.start).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('segment purement ponctué → retiré, aucun appel pipeline', async () => {
    primeVoiceCache('dyu')
    mockPipeline.mockImplementation(async () => ({
      audio: new Float32Array(1600),
      sampling_rate: 16000,
    }))
    expect(await mmsDyuSpeak('   .  !  ')).toBe(false)
    expect(mockPipeline).not.toHaveBeenCalled()
  })
})
