// MMS-TTS — moteurs de narration opt-in MMS (VITS) : baoulé PILOTE (B3-031)
// et dioula (MODE-914).
//
// ── Ce que ce module apporte ──────────────────────────────────────────────
// Deux voix de narration hors de la pile française : quand l'utilisateur a
// sélectionné « Baoulé » ou « Dioula » comme langue de la voix ET installé
// la voix correspondante, tataSpeak() route ici. Sans installation, la
// narration reste française ET le signale (tata-tts.ts, jamais de repli
// muet). Les deux voix partagent le MÊME moteur (pipeline transformers.js
// v2 « text-to-speech » + Cache API pré-rempli) — seuls le checkpoint et la
// provenance changent, d'où une configuration par voix plus bas.
//
// ── ⚠️ Nature des checkpoints ─────────────────────────────────────────────
// • BCI (pilote) : aucun TTS baoulé entraîné n'existe (évaluation B3-030,
//   .ai/EVAL_B3_TTS.md) : facebook/mms-tts-bci est absent de MMS, et le seul
//   dépôt « bci » de Hugging Face est un KIT DE FINE-TUNING dont les poids
//   restent ceux du donor akan (facebook/mms-tts-aka, langue cousine Kwa —
//   Anyi-Baoulé). Provenance : onnx-community/mms-tts-aka-ONNX (fp32
//   114,28 Mo). L'UI annonce « voix pilote, qualité limitée ».
// • DYU : facebook/mms-tts-dyu EXISTE dans MMS (dioula/jula réel — pas un
//   donor) mais sans port ONNX chez Meta ; le port usable par la pile
//   (format transformers.js, entrées input_ids+attention_mask) a été produit
//   par nous via optimum-cli export et PROUVÉ par synthèse WAV 16 kHz
//   (scripts/synthese-dyu-test.py — RMS ≈ 4000, échantillons validés par le
//   produit). Les poids vivent en GitHub Release (voix-dyu-mms-v1) et
//   transitent par le proxy streaming de l'app /api/voix/dyu-model — GitHub
//   n'envoie PAS d'en-têtes CORS, un fetch navigateur direct échouerait ;
//   les cinq petits fichiers du port sont EMBARQUÉS (mms-dyu-assets.ts), le
//   téléchargement utilisateur ne porte donc QUE le poids (114 Mo).
// • Licences : MMS = CC-BY-NC-4.0 pour les DEUX checkpoints → PILOTE/
//   ÉVALUATION uniquement, jamais la production commerciale sans décision
//   dédiée (B3-033/034 côté baoulé, décision équivalente côté dioula).
//
// ── Choix dtype fp32 (contrainte transformers.js v2) ──────────────────────
// La v2 (@xenova/transformers 2.17.2) ne connaît que `quantized: true|false`
// → model_quantized.onnx (ABSENT des ports) ou model.onnx (fp32). La
// variante fp16 exigerait la v3 : le téléchargement est donc 114 Mo.
// En WASM, fp16 est de toute façon promu fp32 à l'exécution (pas de gain
// vitesse) — seule la taille de téléchargement changerait.
//
// ── Chargement hors ligne : pré-remplissage du Cache API ──────────────────
// transformers.js v2 (web) met en cache chaque fichier sous la clé URL HF
// exacte dans le cache « transformers-cache » (utils/hub.js, BrowserCache).
// Aucun des deux ports n'inclut de tokenizer.json (requis par v2) :
// downloadMms*Voice() récupère les fichiers, GÉNÈRE le tokenizer.json
// localement (buildMmsTokenizerJson — port de .ai/eval-b3/
// build_tokenizer_json.py, validé par le smoke sandbox) et pré-remplit le
// cache avec ces clés. from_pretrained trouve ensuite tout localement :
// lancements suivants 100 % hors ligne.
// • BCI : petites pièces téléchargées depuis le dépôt HF du port.
// • DYU : petites pièces EMBARQUÉES (mms-dyu-assets.ts) + poids via le
//   proxy /api/voix/dyu-model — les clés de cache restent des URL HF
//   VIRTUELLES (MMS_DYU_MODEL_ID, dépôt inexistant exprès : tout raté de
//   cache = 404 bruyant, jamais des poids distants divergents).
//
// ── Normalisateurs orthographiques (INDISPENSABLES) ───────────────────────
// Les vocab char-level des checkpoints MMS n'ont ni tons ni (pour dyu) de
// chiffres. Non normalisés, chaque caractère hors vocab serait supprimé par
// la whitelist du tokenizer (texte mutilé à l'audio).
// • normalizeBciText() : décompose (NFD), retire les marques de tons, garde
//   ɛ/ɔ et apostrophes, chiffres gardés (traités par spoken-numbers.ts),
//   ponctuation/symboles en pauses.
// • normalizeDyuText() : idem, mais le vocab dyu (32 symboles) N'A AUCUN
//   chiffre ni underscore → les chiffres deviennent des pauses ; les lettres
//   dédiées ŋ ɔ ɛ ɲ sont préservées (non décomposables).
//
// ── MODE-917 — qualité d'écoute (audio-postprocess.ts + spoken-numbers.ts)
// Quatre améliorations mesurées sur échantillons réels (sandbox), sans
// changer les checkpoints ni le contrat de repli :
// 1. SYNTHÈSE PAR PHRASE : le texte est découpé (splitSpeechSegments) et
//    chaque phrase est synthétisée séparément — la ponctuation filtrée par
//    la whitelist ne « mange » plus les pauses : une VRAIE pause (220 ms,
//    modulée par le réglage de vitesse `rate`) est insérée entre les
//    segments ; un dérapage de génération ne touche qu'une phrase.
// 2. CHIFFRES → MOTS : « 5000 » était un trou SILENCIEUX en dioula (vocab
//    sans chiffres) et mutilé en baoulé (vocab sans 0-1/4-9) — les nombres
//    sont désormais écrits en numérales JULA (sources croisées :
//    coastsystems Dyula, omniglot, thèse HAL) et BAOULÉ 1–10 (omniglot,
//    baoule.ci) avant synthèse. Runs > 7 chiffres (téléphones) : non
//    convertis — muet vaut mieux que faux.
// 3. AUDIO : découpage du silence de tête/queue (réactivité — la sortie
//    VITS encadrait chaque phrase de ~0,3–0,6 s de silence), normalisation
//    de crête PAR SEGMENT (niveau homogène et remonté — la sortie brute
//    descendait à ≈ -20 dBFS), fondus anti-clic.
// 4. `rate` n'est plus ignoré : il module les pauses inter-phrases (le
//    graph ONNX n'expose aucune entrée de durée — vérifié sur les deux
//    modèles : seuls input_ids/attention_mask ; la vitesse du VITS est
//    figée, on ne la simule pas par playbackRate qui décalerait la tonie).
//
// ── Garanties (identiques au pattern kokoro-tts.ts / DADR-001) ────────────
// • JAMAIS de téléchargement automatique : seul downloadMms*Voice() touche
//   au réseau, appelé depuis une action utilisateur (réglages voix).
// • mms*Speak() ne télécharge JAMAIS : sans ressources en cache, false
//   immédiat → tataSpeak() enchaîne son repli français habituel.
// • Timeout borne synthèse ET lecture : une narration ne peut rester
//   bloquée (watchdog identique au contrat piper/kokoro).
// • CSP : la production exige 'wasm-unsafe-eval' (déjà en place, piège
//   Task 41) — même dépendance ONNX Runtime Web que Kokoro/Piper.

import {
  MMS_DYU_ADDED_TOKENS,
  MMS_DYU_MODEL_CONFIG,
  MMS_DYU_SPECIAL_TOKENS_MAP,
  MMS_DYU_TOKENIZER_CONFIG,
  MMS_DYU_VOCAB,
} from './mms-dyu-assets'
import { buildSpokenUtterance, splitSpeechSegments } from './audio-postprocess'
import { spellNumbersForBci, spellNumbersForDyu } from './spoken-numbers'
import { notifySpokenChain } from './spoken-chain'
import { clampSpeechPause, clampVoiceRate, VOICE_CONFIG, synthesisTimeoutMs } from './voice-config'
import { logVoiceDiagnostic } from './voice-diagnostics'

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

// ── Configuration par voix ────────────────────────────────────────────────

/** Dépôt Hugging Face du port ONNX du checkpoint pilote baoulé (donor akan). */
export const MMS_MODEL_ID = 'onnx-community/mms-tts-aka-ONNX'
/** Taille approximative du téléchargement baoulé (fp32, voir en-tête), UI. */
export const MMS_MODEL_SIZE_MB = 114

/**
 * Identifiant de cache VIRTUEL de la voix dioula (MODE-914) : aucun dépôt
 * HF de ce nom n'existe (exprès) — downloadMmsDyuVoice() pré-remplit toutes
 * les clés sous cet id, et tout raté de cache donne un 404 BRUYANT plutôt
 * que des poids distants divergents. Poids réels : GitHub Release
 * voix-dyu-mms-v1 (facebook/mms-tts-dyu, port optimum), servis par le
 * proxy /api/voix/dyu-model.
 */
export const MMS_DYU_MODEL_ID = 'julaba-voices/mms-tts-dyu-onnx'
/** Taille du téléchargement dioula (fp32 114 221 861 octets ≈ 114 Mo), UI. */
export const MMS_DYU_MODEL_SIZE_MB = 114
/** Proxy streaming de l'app (GitHub Releases est sans CORS — voir en-tête). */
export const MMS_DYU_MODEL_URL = '/api/voix/dyu-model'

/** Hôte HF — les clés de cache transformers.js v2 sont ces URLs exactes. */
const HF_HOST = 'https://huggingface.co'
const MODEL_ONNX_FILE = 'onnx/model.onnx'

type MmsVoiceConfig = {
  /** Clé d'état du module (une instance de pipeline par voix). */
  voice: 'bci' | 'dyu'
  /** Identifiant de cache (id « repo » vu par transformers.js). */
  modelId: string
  /** URL RÉELLE de téléchargement du poids (≠ clé de cache pour dyu). */
  weightUrl: string
  /** Petits fichiers téléchargés depuis le dépôt HF (voix bci). */
  remoteSmallFiles?: readonly string[]
  /** Petits fichiers embarqués {fichier → contenu JSON} (voix dyu). */
  bundledSmallFiles?: () => Array<{ file: string; json: unknown }>
  /** Normalisateur orthographique du texte avant synthèse. */
  normalize: (input: string) => string
  /** Écriture des nombres en mots de la langue (MODE-917, avant normalize). */
  spellNumbers: (input: string) => string
  /** Libellé humain de la voix (messages d'erreur). */
  label: string
}

const BCI_CONFIG: MmsVoiceConfig = {
  voice: 'bci',
  modelId: MMS_MODEL_ID,
  weightUrl: `${HF_HOST}/${MMS_MODEL_ID}/resolve/main/${MODEL_ONNX_FILE}`,
  remoteSmallFiles: [
    'config.json',
    'vocab.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'added_tokens.json',
  ] as const,
  normalize: normalizeBciText,
  spellNumbers: spellNumbersForBci,
  label: 'baoulé',
}

const DYU_CONFIG: MmsVoiceConfig = {
  voice: 'dyu',
  modelId: MMS_DYU_MODEL_ID,
  weightUrl: MMS_DYU_MODEL_URL,
  bundledSmallFiles: () => [
    { file: 'config.json', json: MMS_DYU_MODEL_CONFIG },
    { file: 'vocab.json', json: MMS_DYU_VOCAB },
    { file: 'tokenizer_config.json', json: MMS_DYU_TOKENIZER_CONFIG },
    { file: 'special_tokens_map.json', json: MMS_DYU_SPECIAL_TOKENS_MAP },
    { file: 'added_tokens.json', json: MMS_DYU_ADDED_TOKENS },
  ],
  normalize: normalizeDyuText,
  spellNumbers: spellNumbersForDyu,
  label: 'dioula',
}

/** Clés de cache (URL HF virtuelles) et fichiers d'une voix. */
function voiceUrls(config: MmsVoiceConfig) {
  const base = `${HF_HOST}/${config.modelId}/resolve/main`
  return {
    base,
    modelUrl: `${base}/${MODEL_ONNX_FILE}`,
    tokenizerUrl: `${base}/tokenizer.json`,
  }
}

// ── État par voix ──────────────────────────────────────────────────────────

type VoiceState = {
  pipeline: MmsPipelineInstance | null
  loadingPromise: Promise<MmsPipelineInstance> | null
}

const voiceStates: Record<'bci' | 'dyu', VoiceState> = {
  bci: { pipeline: null, loadingPromise: null },
  dyu: { pipeline: null, loadingPromise: null },
}

function emptyState(): VoiceState {
  return { pipeline: null, loadingPromise: null }
}

/** Réinitialise l'état module (instances + promesses) — isolation des tests. */
export function resetMmsForTests(): void {
  voiceStates.bci = emptyState()
  voiceStates.dyu = emptyState()
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

/**
 * Jumelle dioula de normalizeBciText (MODE-914). Le vocab du checkpoint dyu
 * (32 symboles) couvre a–z, ŋ ɔ ɛ ɲ, l'espace, l'apostrophe, le tiret et
 * l'underscore — AUCUN chiffre : « 1 500 » deviendrait une pause muette au
 * milieu de la phrase, donc tout ce qui n'est pas une lettre du vocab est
 * transformé en pause. Les montants chiffrés restent hors périmètre de la
 * narration dyu (ils arrivent en toutes lettres via la chaîne conversation →
 * NLLB, comme pour le baoulé).
 */
export function normalizeDyuText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\s'-]/gu, ' ')
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
 *
 * Note MODE-914 : le Replace insère le pad AVANT chaque caractère et une
 * fois en fin — c'est exactement l'entrelacement add_blank=true des
 * checkpoints MMS (le pad est aussi le token « blank »), ce qui reproduit
 * la tokenisation du VitsTokenizer Python utilisé pour la preuve de
 * synthèse dyu.
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

/** Même cache que transformers.js v2 (BrowserCache, dur codé chez Xenova). */
const MMS_CACHE_NAME = 'transformers-cache'

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(MMS_CACHE_NAME)
  } catch {
    return null
  }
}

const fileUrlFor = (config: MmsVoiceConfig, file: string): string =>
  `${voiceUrls(config).base}/${file}`

/** Les ressources critiques sont-elles déjà pré-cachées ? (modèle +
 * tokenizer.json généré — un téléchargement à moitié fait n'est pas « prêt ».) */
async function isVoiceCached(config: MmsVoiceConfig): Promise<boolean> {
  try {
    const cache = await openCache()
    if (!cache) return false
    const urls = voiceUrls(config)
    const [model, tokenizer] = await Promise.all([
      cache.match(urls.modelUrl),
      cache.match(urls.tokenizerUrl),
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
  if (voiceStates.bci.pipeline !== null) return true
  try {
    return await isVoiceCached(BCI_CONFIG)
  } catch {
    return false
  }
}

/** Jumelle dioula de isMmsBciVoiceReady (MODE-914) — même contrat. */
export async function isMmsDyuVoiceReady(): Promise<boolean> {
  if (!isMmsSupported()) return false
  if (voiceStates.dyu.pipeline !== null) return true
  try {
    return await isVoiceCached(DYU_CONFIG)
  } catch {
    return false
  }
}

/** Fetch d'un fichier avec progression basée sur Content-Length. Retourne
 * un ArrayBuffer — la mise en cache se fait ensuite sous la clé demandée. */
async function fetchFile(
  url: string,
  progressFrom: number,
  progressTo: number,
  onProgress?: (percent: number) => void,
): Promise<ArrayBuffer> {
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
 * de la voix pilote baoulé : 5 petits fichiers du dépôt + tokenizer.json
 * GÉNÉRÉ localement (le dépôt n'en fournit pas — voir en-tête) + le poids
 * ONNX fp32 (~114 Mo, progression 10→100 %). Appel UNIQUEMENT depuis une
 * action utilisateur (réglages voix). Retourne false (jamais d'exception)
 * en cas d'échec réseau ou de config inattendue.
 */
export async function downloadMmsBciVoice(
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  return downloadMmsVoice(BCI_CONFIG, onProgress)
}

/**
 * Jumelle dioula (MODE-914) : petits fichiers EMBARQUÉS (aucun fetch),
 * tokenizer.json généré localement, poids 114 Mo téléchargé via le proxy
 * /api/voix/dyu-model (progression 0→100 %). Clés de cache = URLs HF
 * virtuelles de MMS_DYU_MODEL_ID. Mêmes garanties que la voix baoulé.
 */
export async function downloadMmsDyuVoice(
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  return downloadMmsVoice(DYU_CONFIG, onProgress)
}

/** Cœur commun des téléchargements de voix (BCI_CONFIG / DYU_CONFIG). */
async function downloadMmsVoice(
  config: MmsVoiceConfig,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  if (!isMmsSupported()) return false
  const urls = voiceUrls(config)
  try {
    const cache = await openCache()

    // 1. Petits fichiers — téléchargés (bci) ou embarqués (dyu). Le contenu
    // JSON est gardé en mémoire pour l'étape 2 (le Cache API simulé des
    // tests ne restitue pas les corps).
    const smallShare = 10 // 0-10 % pour les petits fichiers
    const smallJson = new Map<string, string>()
    const remoteFiles = config.remoteSmallFiles ?? []
    for (let i = 0; i < remoteFiles.length; i++) {
      const file = remoteFiles[i]
      const buffer = await fetchFile(
        fileUrlFor(config, file),
        Math.round((i / remoteFiles.length) * smallShare),
        Math.round(((i + 1) / remoteFiles.length) * smallShare),
        onProgress,
      )
      smallJson.set(file, new TextDecoder().decode(buffer))
      await putInCache(cache, fileUrlFor(config, file), buffer, 'application/json')
    }
    for (const bundled of config.bundledSmallFiles?.() ?? []) {
      const body = JSON.stringify(bundled.json)
      smallJson.set(bundled.file, body)
      await putInCache(
        cache,
        fileUrlFor(config, bundled.file),
        new TextEncoder().encode(body).buffer as ArrayBuffer,
        'application/json',
      )
    }

    // 2. tokenizer.json GÉNÉRÉ — à partir du vocab et de la config de la voix.
    const vocabJson = smallJson.get('vocab.json')
    const tokenizerConfigJson = smallJson.get('tokenizer_config.json')
    if (!vocabJson || !tokenizerConfigJson) {
      throw new Error(`vocab.json / tokenizer_config.json introuvables pour ${config.modelId}`)
    }
    const vocab = JSON.parse(vocabJson) as VocabMap
    const tokenizerConfig = JSON.parse(tokenizerConfigJson) as TokenizerConfig
    const tokenizerJson = buildMmsTokenizerJson(vocab, tokenizerConfig)
    await putInCache(
      cache,
      urls.tokenizerUrl,
      new TextEncoder().encode(tokenizerJson).buffer as ArrayBuffer,
      'application/json',
    )

    // 3. Poids ONNX (10-100 % de la progression pour bci ; 0-100 pour dyu,
    //    dont les petits fichiers sont embarqués et instantanés).
    const from = config.remoteSmallFiles ? 10 : 0
    const modelBuffer = await fetchFile(config.weightUrl, from, 100, onProgress)
    await putInCache(cache, urls.modelUrl, modelBuffer, 'application/octet-stream')

    onProgress?.(100)
    return true
  } catch (err) {
    console.warn(`[mms-tts] Téléchargement de la voix ${config.label} échoué :`, err)
    return false
  }
}

/** Supprime les fichiers du modèle du cache et décharge l'instance mémoire. */
export async function removeMmsBciVoice(): Promise<void> {
  await removeMmsVoice(BCI_CONFIG)
}

/** Jumelle dioula de removeMmsBciVoice. */
export async function removeMmsDyuVoice(): Promise<void> {
  await removeMmsVoice(DYU_CONFIG)
}

async function removeMmsVoice(config: MmsVoiceConfig): Promise<void> {
  try {
    const cache = await openCache()
    if (cache) {
      const keys = await cache.keys()
      await Promise.all(
        keys
          .filter((request) => request.url.includes(config.modelId))
          .map((request) => cache.delete(request)),
      )
    }
  } catch {
    // Rien à nettoyer ou cache inaccessible — l'état mémoire est réinitialisé quoi qu'il arrive.
  }
  voiceStates[config.voice] = emptyState()
}

async function loadMms(config: MmsVoiceConfig): Promise<MmsPipelineInstance> {
  const state = voiceStates[config.voice]
  if (state.pipeline) return state.pipeline
  if (!state.loadingPromise) {
    const attempt = (async () => {
      // Import dynamique : transformers.js ne doit pas alourdir le bundle
      // initial (même motif que kokoro-js dans kokoro-tts.ts).
      const transformers = (await import('@xenova/transformers')) as unknown as TransformersModule
      const pipe = await transformers.pipeline('text-to-speech', config.modelId, {
        // fp32 (model.onnx) — voir en-tête pour le choix dtype (contrainte v2).
        quantized: false,
      })
      state.pipeline = pipe
      return pipe
    })()
    state.loadingPromise = attempt
    // Un échec doit pouvoir être retenté plus tard (réseau revenu) sans
    // laisser une promesse rejetée en cache module.
    attempt.catch(() => {
      if (state.loadingPromise === attempt) state.loadingPromise = null
      state.pipeline = null
    })
  }
  return state.loadingPromise
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
// WASM qui pend ne peut pas bloquer la narration (mms*Speak retourne false
// et le repli français de tataSpeak s'enclenche). Marge généreuse : le WASM
// du device est plus lent que le backend natif mesuré (RTF 0,33 sandbox).
/** Pause insérée entre deux phrases d'une narration (MODE-917) — divisée
 * par le réglage de vitesse (rate 0,8 → 275 ms, rate 1,2 → 183 ms). */
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
 * Synthétise et lit `text` avec la voix pilote baoulé. Pipeline :
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
  return speakWithMms(BCI_CONFIG, text, options)
}

/**
 * Jumelle dioula de mmsBciSpeak (MODE-914) : le texte entrant est du
 * DIOULA (phrase de test, ou réponse traduite fra→dyu par conversation.ts)
 * — jamais de normalisation française. Mêmes garanties de repli.
 */
export async function mmsDyuSpeak(
  text: string,
  options?: { rate?: number; volume?: number },
): Promise<boolean> {
  return speakWithMms(DYU_CONFIG, text, options)
}

/** Cœur commun de synthèse/lecture (BCI_CONFIG / DYU_CONFIG).
 *
 * MODE-917 : synthèse PAR PHRASE — découpage (splitSpeechSegments),
 * chiffres→mots (spellNumbers), normalisation orthographique, synthèse de
 * chaque segment, post-traitement audio (trim silence, normalisation de
 * crête, fondus) puis assemblage avec pauses modulées par `rate` et
 * lecture UNIQUE. Contrat tout-ou-rien conservé : le moindre segment en
 * échec → false (repli français de tataSpeak) — jamais de narration
 * partielle suivie du repli (double parole). */
async function speakWithMms(
  config: MmsVoiceConfig,
  text: string,
  options?: { rate?: number; volume?: number },
): Promise<boolean> {
  if (!text || !text.trim()) return false
  // Garde-fou anti-téléchargement : une narration ne doit JAMAIS lancer un
  // téléchargement de 114 Mo à l'improviste. Sans ressources en cache ni
  // instance → false immédiat (repli français de tataSpeak).
  if (!(await isVoiceCached(config)) && voiceStates[config.voice].pipeline === null) return false

  // MODE-917 — préparation du texte : une phrase par segment, chiffres
  // écrits en mots de la langue (avant les trous silencieux du vocab),
  // puis normalisation orthographique par segment. Les segments qui
  // deviennent vides (ponctuation pure, chiffres non convertis) sont
  // retirés — ils ne doivent pas créer de pause fantôme.
  const segments = splitSpeechSegments(text)
    .map((segment) => config.normalize(config.spellNumbers(segment)))
    .filter((segment) => segment.length > 0)
  if (segments.length === 0) return false
  const volume = Math.max(0, Math.min(1, options?.volume ?? 1))
  // `rate` module les pauses inter-phrases (le débit du VITS lui-même est
  // figé par le graph ONNX — voir en-tête) ; borné comme Web Speech.
  const rate = clampVoiceRate(options?.rate ?? VOICE_CONFIG.tts.defaultRate)
  const pauseMs = clampSpeechPause(Math.round(VOICE_CONFIG.speech.pauseMs / rate))

  try {
    const synthesizer = await loadMms(config)
    const synthesized: Float32Array[] = []
    let sampleRate = 0
    for (const segment of segments) {
       const timeoutMs = synthesisTimeoutMs(segment.length)
      const raw = await withTimeout(
        synthesizer(segment),
        timeoutMs,
        `Synthèse MMS ${config.label}`,
      )
      const audioData = raw?.audio
      const segmentRate = raw?.sampling_rate
      if (!(audioData instanceof Float32Array) || !segmentRate || audioData.length === 0) {
        return false
      }
      if (!sampleRate) sampleRate = segmentRate
      synthesized.push(audioData)
    }

    // MODE-917 — trim du silence, normalisation de crête par segment,
    // fondus anti-clic, pauses inter-phrases (audio-postprocess.ts).
    const utterance = buildSpokenUtterance(synthesized, sampleRate, { pauseMs })
    if (utterance.length === 0) return false

    unlockMmsAudio()
    if (!audioContext || audioContext.state === 'closed') return false
    if (audioContext.state === 'suspended') await audioContext.resume()

    // Traçabilité (spoken-chain.ts) : déclaré uniquement ici — la synthèse a
    // RÉUSSI et la lecture s'engage (un échec plus haut ne doit pas se
    // déclarer « chaîne utilisée » et déclencherait une légende mensongère).
    notifySpokenChain(config.voice === 'bci' ? 'mms-bci' : 'mms-dyu')

    const buffer = audioContext.createBuffer(1, utterance.length, sampleRate)
    buffer.getChannelData(0).set(utterance)
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
    logVoiceDiagnostic({ kind: 'tts', engine: `mms-${config.voice}`, code: 'mms_failed', message: String(err) })
    return false
  }
}
