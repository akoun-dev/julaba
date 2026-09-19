// NLLB-200 — traduction hors-ligne Baoulé (bci_Latn) et Dioula (dyu_Latn) ↔
// Français (fra_Latn).
//
// Cœur de la roadmap « Baoulé phase pilote » (B2), étendu au dioula : le
// MÊME modèle NLLB-200-distilled-600M couvre les deux langues — un seul
// téléchargement (≈ 872 Mo) sert bci↔fra ET dyu↔fra. L'architecture est
//   ENTRÉE ASR {bci,dyu} → [NLLB →fra] → IA « Tata Nanti Lou » (fr) → [NLLB fra→…] → TTS.
// Ce module fournit la primitive de traduction ET la garde d'architecture
// resolveParserInput(), qui garantit que le parseur d'intents français
// (localIntent.parseIntent) ne reçoit JAMAIS de texte baoulé brut.
//
// ── Modèle et provenance ──────────────────────────────────────────────────
// • Modèle : NLLB-200-distilled-600M (Meta — licence CC-BY-NC 4.0), variante
//   ONNX convertie pour Transformers.js : Xenova/nllb-200-distilled-600M.
//   NLLB-200 couvre 200 langues dont le baoulé (code 'bci_Latn') — c'est le
//   seul modèle de traduction couvrant le baoulé utilisable offline.
// • Poids téléchargés (quantifiés q8 par défaut de Transformers.js v2) :
//   encoder_model_quantized.onnx (400 Mo) + decoder_model_merged_quantized.onnx
//   (454 Mo) + tokenizer.json (17 Mo) ≈ 872 Mo MESURÉS (2026-09-18, voir
//   scripts/smoke-nllb.mjs). C'est la variante LA PLUS LÉGÈRE disponible : q4
//   (2,2 Go), int8/uint8 statique (1,8 Go) et fp16 (1,7 Go) sont plus lourds —
//   le vocabulaire géant de NLLB (256 206 tokens) gonfle les embeddings.
//   ⚠️ Implication produit : téléchargement OPT-IN obligatoire (jamais
//   embarqué dans l'APK) + Wi-Fi recommandé dans l'UI.
//   Le tokenizer SentencePiece est embarqué dans tokenizer.json — AUCUNE
//   dépendance externe type espeak.
// • Tâche : pipeline('translation') — appel avec { src_lang, tgt_lang }
//   (codes NLLB : 'bci_Latn', 'fra_Latn'), sortie [{ translation_text }].
// • NOTE SANDBOX (2026-09-18) : le chargement du modèle complet dépasse la
//   RAM du sandbox de build (OOM kill SIGKILL à ~2,3 Go, exit 137) — la
//   mesure de LATENCE se fera sur appareil Android réel (comme B1). Le
//   smoke script est conservé pour re-exécution sur un hôte disposant de
//   ≥ 4 Go de RAM libre.
//
// ── Runtime et CSP ────────────────────────────────────────────────────────
// • Navigateur/WebView : Transformers.js v2 (@xenova/transformers, déjà
//   présent pour nlu-ml.ts) sur ONNX Runtime Web (WASM). La compilation WASM
//   exige 'wasm-unsafe-eval' dans la CSP production — PRÉSENT depuis
//   6c3f77d ; sans lui, l'instanciation échoue APRÈS le téléchargement
//   (piège documenté en tête de kokoro-tts.ts). Ne jamais retirer cette
//   source de la CSP sous prétexte qu'un test en dev passe (devScriptPolicy
//   masque le manque).
// • Node (scripts/smoke-nllb.mjs) : ONNX Runtime Node — utilisé UNIQUEMENT
//   pour mesurer taille/latence du modèle, jamais en production.
//
// ── Cache et garanties (pattern kokoro-tts.ts / DADR-001) ─────────────────
// • Téléchargement UNIQUEMENT sur action utilisateur explicite
//   (downloadNllbModel appelé depuis les réglages), avec progression
//   agrégée sur tous les fichiers (encoder + decoder + tokenizer).
// • translateText ne déclenche JAMAIS de téléchargement : sans instance
//   chargée ni fichiers en cache, il lève NLLB_NOT_READY immédiatement
//   (jamais de repli silencieux — règle de mission).
// • Après le premier téléchargement, tout est local : le Cache API
//   'transformers-cache' (géré par Transformers.js) couvre les lancements
//   hors ligne suivants.
// • Tout échec est typé (NllbError.code) et décrit en français lisible via
//   describeNllbError() — à afficher tel quel dans l'UI (pattern Task 41).
// • Timeout obligatoire sur chaque traduction (NLLB_TIMEOUT_MS) : la
//   génération neuronale ne peut jamais bloquer la conversation ; après un
//   timeout, l'instance reste utilisable (la génération orpheline est
//   simplement ignorée).
//
// ── Garde d'architecture (B2-022) ─────────────────────────────────────────
// • resolveParserInput(transcript, language) est le SEUL point de passage
//   autorisé entre un transcript STT et le parseur d'intents :
//   - language 'fr'  → retourne le transcript tel quel (translated: false) ;
//   - language 'bci' → traduit OBLIGATOIREMENT bci→fra avant le parseur ;
//     si le traducteur est indisponible, lève NLLB_NOT_READY — il est
//     INTERDIT de renvoyer du baoulé brut au parseur (test de garde).
//   - toute autre langue → NLLB_UNSUPPORTED.

/**
 * Dépôt Hugging Face du modèle ONNX (provenance exacte des poids).
 */
export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M'
/** Taille mesurée du téléchargement (poids q8 + tokenizer), pour l'UI des réglages. */
export const NLLB_MODEL_SIZE_MB = 872
/** Budget de génération par appel (phrases de marché) — borne anti-blocage. */
export const NLLB_TIMEOUT_MS = 20_000
/** Limite de tokens générés : couvre les phrases longues sans dériver. */
export const NLLB_MAX_NEW_TOKENS = 128

/** Codes NLLB-200 supportés en phase pilote (baoulé + dioula + pivot fr). */
export type NllbLanguage = 'bci_Latn' | 'dyu_Latn' | 'fra_Latn'

export const NLLB_LANGUAGES = {
  bci: 'bci_Latn',
  dyu: 'dyu_Latn',
  fra: 'fra_Latn',
} as const satisfies Record<string, NllbLanguage>

/** Langues de session (store voice-language) → codes NLLB. */
export type SessionVoiceLanguage = 'fr' | 'bci' | 'dyu'

export type NllbErrorCode =
  | 'NLLB_UNSUPPORTED'
  | 'NLLB_NOT_READY'
  | 'NLLB_EMPTY_INPUT'
  | 'NLLB_TIMEOUT'
  | 'NLLB_EMPTY_OUTPUT'
  | 'NLLB_DOWNLOAD_FAILED'
  | 'NLLB_ENGINE_ERROR'

/** Erreur typée — jamais avalée, jamais de fallback silencieux. */
export class NllbError extends Error {
  readonly code: NllbErrorCode
  constructor(code: NllbErrorCode, message: string) {
    super(message)
    this.name = 'NllbError'
    this.code = code
  }
}

/** Message français explicite pour l'UI (pattern Task 41 — erreurs affichées). */
export function describeNllbError(error: unknown): string {
  if (error instanceof NllbError) return error.message
  if (error instanceof Error) {
    return `Traduction impossible : ${error.message}`
  }
  return 'Traduction impossible : erreur inconnue du traducteur.'
}

type NllbProgressInfo = {
  status?: string
  file?: string
  loaded?: number
  total?: number
}

type NllbTranslateResult = { translation_text?: string } | string

type NllbTranslatorInstance = (
  text: string,
  options: { src_lang: NllbLanguage; tgt_lang: NllbLanguage; max_new_tokens?: number },
) => Promise<NllbTranslateResult[]>

type NllbPipelineFactory = (
  task: 'translation',
  modelId: string,
  options?: { progress_callback?: (info: NllbProgressInfo) => void },
) => Promise<NllbTranslatorInstance>

let nllbTranslator: NllbTranslatorInstance | null = null
let loadingPromise: Promise<NllbTranslatorInstance> | null = null

/** Chargeur du pipeline — injectable pour isoler les tests de l'import réel. */
type NllbPipelineLoader = () => Promise<{ pipeline: NllbPipelineFactory }>
let nllbPipelineLoader: NllbPipelineLoader = async () => {
  const mod = await import('@xenova/transformers')
  // La TranslationPipeline réelle est compatible au runtime avec
  // NllbTranslatorInstance (appel (text, options) → Promise<results>) ; le
  // cast borne la surface typée utilisée par ce module.
  return { pipeline: mod.pipeline as unknown as NllbPipelineFactory }
}

export function setNllbPipelineLoaderForTests(loader: NllbPipelineLoader): void {
  nllbPipelineLoader = loader
}

/** Environnement capable d'exécuter le traducteur (WASM + Cache API). */
export function isNllbSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof caches !== 'undefined'
  )
}

/** Réinitialise l'état module (instance + promesse). Isolation des tests. */
export function resetNllbForTests(): void {
  nllbTranslator = null
  loadingPromise = null
  nllbPipelineLoader = async () => {
    const mod = await import('@xenova/transformers')
    return { pipeline: mod.pipeline as unknown as NllbPipelineFactory }
  }
}

async function openCache(name: string): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(name)
  } catch {
    return null
  }
}

/** Le modèle est-il déjà en cache local (Cache API de Transformers.js) ? */
async function isModelCached(): Promise<boolean> {
  try {
    const cache = await openCache('transformers-cache')
    if (!cache) return false
    const keys = await cache.keys()
    return keys.some((request) => request.url.includes(NLLB_MODEL_ID))
  } catch {
    return false
  }
}

/**
 * Le traducteur est-il « prêt » sans action de l'utilisateur ? Vrai si
 * l'instance est chargée en mémoire OU les fichiers sont en cache. Ne
 * télécharge rien — ne lève jamais (contrat de sonde, comme isKokoroVoiceReady).
 */
export async function isNllbModelReady(): Promise<boolean> {
  if (!isNllbSupported()) return false
  try {
    return nllbTranslator !== null || (await isModelCached())
  } catch {
    return false
  }
}

async function loadNllb(onProgress?: (percent: number) => void): Promise<NllbTranslatorInstance> {
  if (nllbTranslator) return nllbTranslator
  if (!loadingPromise) {
    const attempt = (async () => {
      const { pipeline } = await nllbPipelineLoader()
      // Progression agrégée sur TOUS les fichiers (encoder + decoder +
      // tokenizer) : un pourcentage unique et monotone pour l'UI.
      const fileTotals = new Map<string, { loaded: number; total: number }>()
      const emit = (info: NllbProgressInfo) => {
        if (!onProgress) return
        if (info?.status !== 'progress' || typeof info.total !== 'number' || info.total <= 0) return
        const key = info.file ?? ''
        const entry = fileTotals.get(key) ?? { loaded: 0, total: info.total }
        entry.loaded = typeof info.loaded === 'number' && info.loaded >= 0 ? info.loaded : entry.loaded
        entry.total = info.total
        fileTotals.set(key, entry)
        let loadedSum = 0
        let totalSum = 0
        for (const f of fileTotals.values()) {
          loadedSum += f.loaded
          totalSum += f.total
        }
        onProgress(Math.min(100, Math.round((loadedSum / totalSum) * 100)))
      }
      const translator = await pipeline('translation', NLLB_MODEL_ID, {
        progress_callback: emit,
      })
      nllbTranslator = translator
      return translator
    })()
    loadingPromise = attempt
    // Un échec doit pouvoir être retenté plus tard (réseau revenu) sans
    // laisser une promesse rejetée en cache module.
    attempt.catch(() => {
      if (loadingPromise === attempt) loadingPromise = null
      nllbTranslator = null
    })
  }
  return loadingPromise
}

/**
 * Télécharge le modèle (≈ 370 Mo) et charge le pipeline. À appeler
 * UNIQUEMENT depuis une action utilisateur explicite (réglages voix).
 * Retourne true en cas de succès ; lève NllbError typée sinon.
 */
export async function downloadNllbModel(onProgress?: (percent: number) => void): Promise<boolean> {
  if (!isNllbSupported()) {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      "La traduction (baoulé/dioula) nécessite un navigateur avec WebAssembly. Ce contexte n'est pas pris en charge.",
    )
  }
  try {
    await loadNllb(onProgress)
    return true
  } catch (error) {
    if (error instanceof NllbError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new NllbError(
      'NLLB_DOWNLOAD_FAILED',
      `Téléchargement du traducteur (baoulé/dioula) impossible (${detail}). Vérifiez la connexion puis réessayez.`,
    )
  }
}

/** Supprime les fichiers du modèle du cache local (libère ≈ 370 Mo). */
export async function removeNllbModel(): Promise<void> {
  nllbTranslator = null
  loadingPromise = null
  try {
    const cache = await openCache('transformers-cache')
    if (!cache) return
    const keys = await cache.keys()
    await Promise.all(
      keys
        .filter((request) => request.url.includes(NLLB_MODEL_ID))
        .map((request) => cache.delete(request)),
    )
  } catch {
    // Cache illisible : rien de critique — le modèle est déchargé de la
    // session en cours et le cache sera purgable au prochain téléchargement.
  }
}

function assertLanguagePair(src: NllbLanguage, tgt: NllbLanguage): void {
  const valid = Object.values(NLLB_LANGUAGES) as NllbLanguage[]
  if (!valid.includes(src) || !valid.includes(tgt)) {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      `Paire de langues non prise en charge (${src} → ${tgt}). Phase pilote : baoulé/dioula ↔ français.`,
    )
  }
  if (src === tgt) {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      'Traduction inutile : les langues source et cible sont identiques.',
    )
  }
}

/**
 * Traduit un texte bci ↔ fra, 100 % hors ligne après le premier
 * téléchargement. Ne télécharge JAMAIS implicitement (NLLB_NOT_READY si le
 * modèle n'est ni chargé ni en cache). Lève NllbError typée à chaque échec.
 */
export async function translateText(
  text: string,
  options: {
    src: NllbLanguage
    tgt: NllbLanguage
    timeoutMs?: number
    onProgress?: (percent: number) => void
  },
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new NllbError('NLLB_EMPTY_INPUT', 'Aucun texte à traduire.')
  }
  assertLanguagePair(options.src, options.tgt)

  const ready = nllbTranslator !== null || (await isModelCached())
  if (!ready) {
    throw new NllbError(
      'NLLB_NOT_READY',
      'Le traducteur (baoulé/dioula) n’est pas encore téléchargé. Téléchargez-le dans les réglages de la voix.',
    )
  }

  const translator = await loadNllb(options.onProgress)

  const timeoutMs = options.timeoutMs ?? NLLB_TIMEOUT_MS
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const generation = translator(trimmed, {
    src_lang: options.src,
    tgt_lang: options.tgt,
    max_new_tokens: NLLB_MAX_NEW_TOKENS,
  })
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new NllbError(
          'NLLB_TIMEOUT',
          'La traduction a pris trop de temps. Réessayez avec une phrase plus courte.',
        ),
      )
    }, timeoutMs)
  })

  let outputs: NllbTranslateResult[]
  try {
    outputs = await Promise.race([generation, timeout])
  } catch (error) {
    if (error instanceof NllbError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new NllbError('NLLB_ENGINE_ERROR', `Le moteur de traduction a échoué (${detail}).`)
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }

  const first = outputs?.[0]
  const translated =
    typeof first === 'string' ? first.trim() : (first?.translation_text ?? '').trim()
  if (!translated) {
    throw new NllbError('NLLB_EMPTY_OUTPUT', 'Le traducteur n’a produit aucun texte. Réessayez.')
  }
  return translated
}

/**
 * GARDE D'ARCHITECTURE (B2-022) : point de passage UNIQUE entre un
 * transcript STT et le parseur d'intents français. En baoulé ET en dioula,
 * la traduction est OBLIGATOIRE — si le traducteur est indisponible, cette
 * fonction lève (NLLB_NOT_READY) plutôt que de laisser passer du texte
 * brut au parseur.
 */
export async function resolveParserInput(
  transcript: string,
  language: SessionVoiceLanguage,
  options?: { timeoutMs?: number },
): Promise<{ text: string; translated: boolean }> {
  if (language === 'fr') {
    return { text: transcript, translated: false }
  }
  if (language !== 'bci' && language !== 'dyu') {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      `Langue de session inconnue : ${String(language)}. Phase pilote : français, baoulé ou dioula.`,
    )
  }
  const text = await translateText(transcript, {
    src: NLLB_LANGUAGES[language],
    tgt: NLLB_LANGUAGES.fra,
    timeoutMs: options?.timeoutMs,
  })
  return { text, translated: true }
}
