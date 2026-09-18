// MMS-TTS Baoulé (PILOTE) — moteur de narration baoulé opt-in (B3-031).
//
// ── Ce que ce module apporte ──────────────────────────────────────────────
// Première narration vocale baoulé de la pile : quand l'utilisateur a
// sélectionné « Baoulé » comme langue de la voix ET a installé la voix
// pilote, tataSpeak() route ici. Sans installation, la narration reste
// française ET le signale (tata-tts.ts, jamais de repli muet).
//
// ── ⚠️ Nature du checkpoint : PILOTE, voix « donor akan » ─────────────────
// Aucun TTS baoulé entraîné n'existe (évaluation B3-030,
// .ai/EVAL_B3_TTS.md) : facebook/mms-tts-bci est absent de MMS, et le seul
// dépôt « bci » de Hugging Face est un KIT DE FINE-TUNING dont les poids
// restent ceux du donor akan (facebook/mms-tts-aka, langue cousine Kwa —
// Anyi-Baoulé). Ce module intègre donc le MOTEUR (plombage mesuré : RTF
// 0,33 CPU sandbox, synthèse 250-350 ms par phrase courte) sur ce
// checkpoint provisoire. La phonétique baoulé exacte exigera le fine-tune
// B3-033 (ou la voix Piper B3-034) — l'UI doit rester explicite : « voix
// pilote, qualité limitée ».
// • Licence : MMS = CC-BY-NC-4.0 → PILOTE/ÉVALUATION uniquement, jamais la
//   production commerciale (voir EVAL_B3_TTS.md §5-6).
// • Provenance : onnx-community/mms-tts-aka-ONNX (port ONNX du donor,
//   fp32 114,28 Mo / fp16 58,16 Mo / q4f16 56,87 Mo).
//
// ── Choix dtype fp32 (contrainte transformers.js v2) ──────────────────────
// La v2 (@xenova/transformers 2.17.2) ne connaît que `quantized: true|false`
// → model_quantized.onnx (ABSENT du port) ou model.onnx (fp32). La variante
// fp16 (58 Mo) exige la v3 : le téléchargement pilote est donc 114 Mo.
// En WASM, fp16 est de toute façon promu fp32 à l'exécution (pas de gain
// vitesse) — seule la taille de téléchargement changerait.
//
// ── Chargement hors ligne : pré-remplissage du Cache API ──────────────────
// transformers.js v2 (web) met en cache chaque fichier sous la clé URL HF
// exacte dans le cache « transformers-cache » (utils/hub.js, BrowserCache).
// Le port onnx-community n'inclut PAS de tokenizer.json (requis par v2) :
// downloadMmsBciVoice() télécharge donc les fichiers du dépôt, GÉNÈRE le
// tokenizer.json localement (buildMmsTokenizerJson, port de
// .ai/eval-b3/build_tokenizer_json.py — validé par le smoke sandbox) et
// pré-remplit le cache avec ces clés. from_pretrained trouve ensuite tout
// localement : lancements suivants 100 % hors ligne.
//
// ── Normalisateur orthographique baoulé (INDISPENSABLE) ───────────────────
// Le vocab du checkpoint = 30 caractères latins SANS diacritiques de tons
// (une seule lettre à ton : « á »). Le baoulé standard note les tons
// (à, é, è, ǹ, ǎ…) : non normalisé, chaque lettre accentuée serait
// supprimée par la whitelist du tokenizer (texte mutilé à l'audio).
// normalizeBciText() décompose (NFD), retire les marques de tons, garde
// les lettres dédiées ɛ/ɔ (non décomposables), les apostrophes (’/'/ʼ) et
// transforme ponctuation/symboles en pauses (espaces). Les montants
// chiffrés restent HORS périmètre du pilote (vocab quasi sans chiffres) :
// les phrases bci réelles viendront avec les nombres en toutes lettres
// (chaîne B4 + NLLB).
//
// ── Garanties (identiques au pattern kokoro-tts.ts / DADR-001) ────────────
// • JAMAIS de téléchargement automatique : seul downloadMmsBciVoice()
//   touche au réseau, appelé depuis une action utilisateur (réglages voix).
// • mmsBciSpeak() ne télécharge JAMAIS : sans ressources en cache, false
//   immédiat → tataSpeak() enchaîne son repli français habituel.
// • Timeout borne synthèse ET lecture : une narration ne peut rester
//   bloquée (watchdog identique au contrat piper/kokoro).
// • CSP : la production exige 'wasm-unsafe-eval' (déjà en place, piège
//   Task 41) — même dépendance ONNX Runtime Web que Kokoro/Piper.

/** Dépôt Hugging Face du port ONNX du checkpoint pilote (donor akan). */
export const MMS_MODEL_ID = 'onnx-community/mms-tts-aka-ONNX'
/** Taille approximative du téléchargement (fp32, voir en-tête), pour l'UI. */
export const MMS_MODEL_SIZE_MB = 114
/** Hôte HF — les clés de cache transformers.js v2 sont ces URLs exactes. */
const HF_HOST = 'https://huggingface.co'
const MODEL_BASE_URL = `${HF_HOST}/${MMS_MODEL_ID}/resolve/main`
/** Même cache que transformers.js v2 (BrowserCache, dur codé chez Xenova). */
const MMS_CACHE_NAME = 'transformers-cache'
/** Fichier poids (fp32 — voir en-tête). */
const MODEL_ONNX_FILE = 'onnx/model.onnx'
/** Petits fichiers du dépôt pré-requis par le chargement v2. */
const SMALL_FILES = [
  'config.json',
  'vocab.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'added_tokens.json',
] as const

type MmsGenerateResult = {
  audio: Float32Array
  sampling_rate: number
}

type MmsPipelineInstance = (
  text: string,
  options?: Record<string, unknown>,
) => Promise<MmsGenerateResult>

type TransformersModule = {
  pipeline: (
    task: 'text-to-speech',
    modelId: string,
    options?: { quantized?: boolean; progress_callback?: (info: unknown) => void },
  ) => Promise<MmsPipelineInstance>
}

type MmsProgressInfo = {
  status?: string
  file?: string
  loaded?: number
  total?: number
}

let mmsPipeline: MmsPipelineInstance | null = null
let loadingPromise: Promise<MmsPipelineInstance> | null = null

/** Réinitialise l'état module (instance + promesses) — isolation des tests. */
export function resetMmsForTests(): void {
  mmsPipeline = null
  loadingPromise = null
}

// ── Normalisateur orthographique baoulé ──────────────────────────────────

/**
 * Prépare un texte baoulé pour le moteur MMS (voir en-tête) : décompose les
 * diacritiques (NFD), retire les marques de tons, unifie les apostrophes,
 * transforme ponctuation/symboles en espaces (pauses), compacte les espaces.
 * Idempotent ; les lettres dédiées ɛ/ɔ et les apostrophes sont préservées.
 */
export function normalizeBciText(input: string): string {
  return input
    .normalize('NFD')
    // Marques combinantes = tons et diacritiques (U+0300–U+036F). Les
    // lettres ɛ (U+025B) et ɔ (U+0254) n'ont pas de décomposition : intactes.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    // Lettres + chiffres + apostrophes (' et ʼ — TOUTES DEUX dans le vocab
    // du checkpoint) + tiret gardés ; tout le reste (ponctuation, symboles,
    // devises) devient une pause.
    .replace(/[^\p{L}\p{N}\s'ʼ-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Génération du tokenizer.json (port de build_tokenizer_json.py) ───────

/** Échappe un caractère pour une classe de caractères regex JAVASCRIPT.
 * ⚠️ re.escape() de Python produit des séquences invalides en JS avec le
 * flag `u` (ex. « \ » pour l'espace). Dans une classe JS, seuls `\ ] ^ -`
 * exigent un échappement — comme dans le port de référence
 * Xenova/mms-tts-fra (constaté et corrigé pendant le smoke B3-030). */
function escChar(ch: string): string {
  if (ch === '\\' || ch === ']' || ch === '^' || ch === '-') return '\\' + ch
  return ch
}

type VocabMap = Record<string, number>

type TokenizerConfig = {
  pad_token?: string
  unk_token?: string
  added_tokens_decoder?: Record<string, { content?: string }>
}

/**
 * Construit le contenu tokenizer.json (format « fast » tokenizers) exigé
 * par transformers.js v2, à partir du vocab char-level du checkpoint et de
 * sa config tokenizer. Schéma copié sur le port fonctionnel
 * Xenova/mms-tts-fra : Lowercase + whitelist (supprime tout caractère hors
 * vocab — pas de <unk> silencieux) + Strip + apposition du pad token en fin
 * de séquence (astuce Replace « (?=.)|(?<!^)$ »).
 */
export function buildMmsTokenizerJson(
  vocab: VocabMap,
  tokenizerConfig: TokenizerConfig,
): string {
  const pad = tokenizerConfig.pad_token ?? Object.keys(vocab)[0]
  const unk = tokenizerConfig.unk_token ?? '<unk>'

  // Identifiant du <unk> : hors du vocab char-level, déclaré dans
  // added_tokens_decoder (ex. id 30 pour un vocab 0-29).
  let unkId = vocab[unk]
  if (unkId === undefined) {
    unkId = Object.keys(vocab).length
    for (const [tid, meta] of Object.entries(tokenizerConfig.added_tokens_decoder ?? {})) {
      if (meta?.content === unk) {
        unkId = Number(tid)
        break
      }
    }
  }

  const chars = Object.entries(vocab)
    .sort(([, a], [, b]) => a - b)
    .map(([ch]) => escChar(ch))
    .join('')
  const whitelist = `[^${chars}]`

  return JSON.stringify({
    version: '1.0',
    truncation: null,
    padding: null,
    added_tokens: [
      {
        id: unkId,
        content: unk,
        single_word: false,
        lstrip: false,
        rstrip: false,
        normalized: false,
        special: true,
      },
    ],
    normalizer: {
      type: 'Sequence',
      normalizers: [
        { type: 'Lowercase' },
        { type: 'Replace', pattern: { Regex: whitelist }, content: '' },
        { type: 'Strip', strip_left: true, strip_right: true },
        { type: 'Replace', pattern: { Regex: '(?=.)|(?<!^)$' }, content: pad },
      ],
    },
    pre_tokenizer: {
      type: 'Split',
      pattern: { Regex: '' },
      behavior: 'Isolated',
      invert: false,
    },
    post_processor: null,
    decoder: null,
    model: { type: 'WordLevel', vocab, unk_token: unk },
  })
}

// ── Cache API (mêmes clés que transformers.js v2) ────────────────────────

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(MMS_CACHE_NAME)
  } catch {
    return null
  }
}

const fileUrl = (file: string): string => `${MODEL_BASE_URL}/${file}`
const MODEL_ONNX_URL = fileUrl(MODEL_ONNX_FILE)
const TOKENIZER_JSON_URL = fileUrl('tokenizer.json')

/** Les ressources critiques sont-elles déjà pré-cachées ? (modèle +
 * tokenizer.json généré — un téléchargement à moitié fait n'est pas « prêt ».) */
async function isModelCached(): Promise<boolean> {
  try {
    const cache = await openCache()
    if (!cache) return false
    const [model, tokenizer] = await Promise.all([
      cache.match(MODEL_ONNX_URL),
      cache.match(TOKENIZER_JSON_URL),
    ])
    return model !== undefined && tokenizer !== undefined
  } catch {
    return false
  }
}

export function isMmsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof caches !== 'undefined'
  )
}

/**
 * La voix pilote baoulé est-elle « prête » sans action de l'utilisateur ?
 * Vrai si l'instance est chargée en mémoire OU les fichiers critiques sont
 * en cache. Ne télécharge rien, ne jette pas.
 */
export async function isMmsBciVoiceReady(): Promise<boolean> {
  if (!isMmsSupported()) return false
  if (mmsPipeline !== null) return true
  try {
    return await isModelCached()
  } catch {
    return false
  }
}

/** Fetch d'un fichier du dépôt avec progression basée sur Content-Length
 * (le poids fait 99 % du total ; les petits fichiers sont quasi instantanés).
 * Retourne un ArrayBuffer — la mise en cache se fait sous l'URL HF exacte
 * (clé BrowserCache de transformers.js v2). */
async function fetchModelFile(
  file: string,
  progressFrom: number,
  progressTo: number,
  onProgress?: (percent: number) => void,
): Promise<ArrayBuffer> {
  const url = fileUrl(file)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`)
  }
  const total = Number(response.headers.get('content-length') ?? '0')
  if (!response.body || !total) {
    // Pas de stream ni de taille annoncée : lecture simple, progression sautée.
    const buffer = await response.arrayBuffer()
    onProgress?.(progressTo)
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    const ratio = Math.min(1, received / total)
    onProgress?.(Math.round(progressFrom + (progressTo - progressFrom) * ratio))
  }
  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  return buffer.buffer
}

async function putInCache(
  cache: Cache | null,
  url: string,
  buffer: ArrayBuffer,
  contentType: string,
): Promise<void> {
  if (!cache) return
  try {
    await cache.put(
      url,
      new Response(buffer, { headers: { 'content-type': contentType } }),
    )
  } catch {
    // Quota dépassé ou cache indisponible : le chargement de cette session
    // peut encore fonctionner via l'instance mémoire ; le re-téléchargement
    // retentera la persistance plus tard.
  }
}

/**
 * Télécharge (une fois) et pré-remplit le cache avec TOUTES les ressources
 * de la voix pilote : 5 petits fichiers du dépôt + tokenizer.json GÉNÉRÉ
 * localement (le dépôt n'en fournit pas — voir en-tête) + le poids ONNX
 * fp32 (~114 Mo, progression 10→100 %). Appel UNIQUEMENT depuis une action
 * utilisateur (réglages voix). Retourne false (jamais d'exception) en cas
 * d'échec réseau ou de config inattendue.
 */
export async function downloadMmsBciVoice(
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  if (!isMmsSupported()) return false
  try {
    const cache = await openCache()
    const smallShare = 10 // 0-10 % pour les petits fichiers

    // 1. Petits fichiers (config, vocab, tokenizer_config, special/added tokens).
    const smallBuffers = new Map<string, ArrayBuffer>()
    for (let i = 0; i < SMALL_FILES.length; i++) {
      const file = SMALL_FILES[i]
      const buffer = await fetchModelFile(
        file,
        Math.round((i / SMALL_FILES.length) * smallShare),
        Math.round(((i + 1) / SMALL_FILES.length) * smallShare),
        onProgress,
      )
      smallBuffers.set(file, buffer)
      await putInCache(cache, fileUrl(file), buffer, 'application/json')
    }

    // 2. tokenizer.json GÉNÉRÉ — à partir du vocab et de la config du dépôt.
    const vocab = JSON.parse(
      new TextDecoder().decode(smallBuffers.get('vocab.json')),
    ) as VocabMap
    const tokenizerConfig = JSON.parse(
      new TextDecoder().decode(smallBuffers.get('tokenizer_config.json')),
    ) as TokenizerConfig
    const tokenizerJson = buildMmsTokenizerJson(vocab, tokenizerConfig)
    await putInCache(
      cache,
      TOKENIZER_JSON_URL,
      new TextEncoder().encode(tokenizerJson).buffer as ArrayBuffer,
      'application/json',
    )

    // 3. Poids ONNX (10-100 % de la progression).
    const modelBuffer = await fetchModelFile(MODEL_ONNX_FILE, 10, 100, onProgress)
    await putInCache(cache, MODEL_ONNX_URL, modelBuffer, 'application/octet-stream')

    onProgress?.(100)
    return true
  } catch (err) {
    console.warn('[mms-tts] Téléchargement de la voix pilote baoulé échoué :', err)
    return false
  }
}

/** Supprime les fichiers du modèle du cache et décharge l'instance mémoire. */
export async function removeMmsBciVoice(): Promise<void> {
  try {
    const cache = await openCache()
    if (cache) {
      const keys = await cache.keys()
      await Promise.all(
        keys
          .filter((request) => request.url.includes(MMS_MODEL_ID))
          .map((request) => cache.delete(request)),
      )
    }
  } catch {
    // Rien à nettoyer ou cache inaccessible — l'état mémoire est réinitialisé quoi qu'il arrive.
  }
  mmsPipeline = null
  loadingPromise = null
}

async function loadMms(): Promise<MmsPipelineInstance> {
  if (mmsPipeline) return mmsPipeline
  if (!loadingPromise) {
    const attempt = (async () => {
      // Import dynamique : transformers.js ne doit pas alourdir le bundle
      // initial (même motif que kokoro-js dans kokoro-tts.ts).
      const transformers = (await import('@xenova/transformers')) as unknown as TransformersModule
      const pipe = await transformers.pipeline('text-to-speech', MMS_MODEL_ID, {
        // fp32 (model.onnx) — voir en-tête pour le choix dtype (contrainte v2).
        quantized: false,
      })
      mmsPipeline = pipe
      return pipe
    })()
    loadingPromise = attempt
    // Un échec doit pouvoir être retenté plus tard (réseau revenu) sans
    // laisser une promesse rejetée en cache module.
    attempt.catch(() => {
      if (loadingPromise === attempt) loadingPromise = null
      mmsPipeline = null
    })
  }
  return loadingPromise
}

// ── Lecture audio (contrat piper/kokoro : résolution à la fin RÉELLE) ────

let audioContext: AudioContext | null = null
let audioSource: AudioBufferSourceNode | null = null

export function unlockMmsAudio(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    // Le navigateur peut n'exposer aucune sortie audio exploitable.
  }
}

/** Arrête la lecture MMS en cours (no-op si aucune). */
export function mmsStop(): void {
  try { audioSource?.stop() } catch { /* déjà arrêtée */ }
  audioSource = null
}

// Timeout de synthèse : même formule que le watchdog kokoro — une génération
// WASM qui pend ne peut pas bloquer la narration (mmsBciSpeak retourne false
// et le repli français de tataSpeak s'enclenche). Marge généreuse : le WASM
// du device est plus lent que le backend natif mesuré (RTF 0,33 sandbox).
const SYNTHESIS_TIMEOUT_BASE_MS = 30_000
const SYNTHESIS_TIMEOUT_PER_CHAR_MS = 80
const SYNTHESIS_TIMEOUT_CAP_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const raced = Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`[mms-tts] ${label} dépassé (${ms} ms)`)), ms)
    }),
  ])
  return raced.finally(() => clearTimeout(timer))
}

/**
 * Synthétise et lit `text` (baoulé) avec la voix pilote MMS. Pipeline :
 * normalizeBciText → pipeline text-to-speech (tokenizer fast généré, poids
 * fp32) → AudioContext. Retourne false (jamais d'exception) si les
 * ressources ne sont pas disponibles ou si une étape échoue, pour que
 * tataSpeak() enchaîne son repli français.
 *
 * ⚠️ NE PAS passer par toSpeechText/spellDigits ici : c'est du baoulé, pas
 * du français — les montants chiffrés sont hors périmètre du pilote (voir
 * en-tête). Le texte est normalisé côté bci dans ce module.
 *
 * Résout uniquement quand LA LECTURE EST TERMINÉE (onended + watchdog),
 * même contrat que piperSpeak()/kokoroSpeak().
 */
export async function mmsBciSpeak(
  text: string,
  options?: { rate?: number; volume?: number },
): Promise<boolean> {
  if (!text || !text.trim()) return false
  // Garde-fou anti-téléchargement : une narration ne doit JAMAIS lancer un
  // téléchargement de 114 Mo à l'improviste. Sans ressources en cache ni
  // instance → false immédiat (repli français de tataSpeak).
  if (!(await isMmsBciVoiceReady())) return false

  const spokenText = normalizeBciText(text)
  if (!spokenText) return false
  const volume = Math.max(0, Math.min(1, options?.volume ?? 1))

  try {
    const synthesizer = await loadMms()
    const timeoutMs = Math.min(
      SYNTHESIS_TIMEOUT_CAP_MS,
      SYNTHESIS_TIMEOUT_BASE_MS + spokenText.length * SYNTHESIS_TIMEOUT_PER_CHAR_MS,
    )
    const raw = await withTimeout(
      synthesizer(spokenText),
      timeoutMs,
      'Synthèse MMS baoulé',
    )
    const audioData = raw?.audio
    const sampleRate = raw?.sampling_rate
    if (!(audioData instanceof Float32Array) || !sampleRate || audioData.length === 0) return false

    unlockMmsAudio()
    if (!audioContext || audioContext.state === 'closed') return false
    if (audioContext.state === 'suspended') await audioContext.resume()

    const buffer = audioContext.createBuffer(1, audioData.length, sampleRate)
    buffer.getChannelData(0).set(audioData)
    audioSource?.stop()
    const gain = audioContext.createGain()
    gain.gain.value = volume
    audioSource = audioContext.createBufferSource()
    audioSource.buffer = buffer
    audioSource.connect(gain)
    gain.connect(audioContext.destination)

    // Attendre la fin RÉELLE de la lecture (ou mmsStop(), ou watchdog de
    // secours sur WebView cassée), comme piperSpeak()/kokoroSpeak().
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(watchdog)
        resolve()
      }
      const watchdog = setTimeout(finish, (buffer.duration + 2) * 1000)
      audioSource!.onended = finish
      audioSource!.start()
    })
    return true
  } catch (err) {
    console.warn('[mms-tts] Synthèse/lecture baoulé en échec :', err)
    return false
  }
}
