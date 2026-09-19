// NLLB — traduction hors-ligne Dioula (dyu_Latn) ↔ Français (fra_Latn).
//
// Cœur de la roadmap « Baoulé phase pilote » (B2), corrigée le 2026-09-20
// après VÉRIFICATION FACTUELLE du tokenizer officiel : NLLB-200 couvre le
// DIOULA (code 'dyu_Latn') mais PAS le baoulé. L'architecture est
//   ENTRÉE ASR {bci,dyu} → [NLLB →fra] → IA « Tata Nanti Lou » (fr) → [NLLB fra→…] → TTS.
// Ce module fournit la primitive de traduction ET la garde d'architecture
// resolveParserInput(), qui garantit que le parseur d'intents français
// (localIntent.parseIntent) ne reçoit JAMAIS de texte baoulé brut.
//
// ── Modèles et provenance (registre vérifié, jamais supposé) ──────────────
// • Modèle dioula : NLLB-200-distilled-600M (Meta — licence CC-BY-NC 4.0),
//   variante ONNX convertie pour Transformers.js : Xenova/nllb-200-distilled-
//   600M. dyu_Latn est bien présent dans son tokenizer (202 codes exacts ;
//   FLORES-200 « Dyula | dyu_Latn ») — vérifié 2026-09-20 en téléchargeant
//   et inspectant le tokenizer officiel ET le port Xenova.
// • ⚠️ BAoulÉ NON COUVERT — correction d'une hypothèse fondatrice erronée :
//   bci_Latn est ABSENT du tokenizer NLLB-200 (zéro occurrence parmi les
//   202 codes, preuves : verifier-nllb/ — tokenizer facebook + Xenova +
//   carte modèle officielle + FLORES-200). Toute traduction bci↔fra avec
//   ce modèle lève à l'exécution « Source language code "bci_Latn" is not
//   valid » (transformers.js tokenizers.js:3347) — échec BRUYANT, jamais
//   silencieux. Le commentaire historique (« NLLB-200 couvre 200 langues
//   dont le baoulé ») était FAUX. La registre NLLB_MODELS ne déclare donc
//   le modèle générique QUE pour dyu↔fra ; la traduction baoulé requiert
//   un modèle spécialisé (finetune communautaire GaindeNdiaye/nllb-baoule-v1
//   — port ONNX en cours, registre Task 84). En attendant, toute paire
//   impliquant bci_Latn lève NLLB_UNSUPPORTED avec un message français
//   honnête (jamais de crash anglais brut à l'écran).
// • Poids du modèle dioula (quantifiés q8 par défaut de Transformers.js v2) :
//   encoder_model_quantized.onnx (400 Mo) + decoder_model_merged_quantized
//   .onnx (454 Mo) + tokenizer.json (17 Mo) ≈ 872 Mo MESURÉS (2026-09-18,
//   voir scripts/smoke-nllb.mjs). C'est la variante LA PLUS LÉGÈRE
//   disponible : q4 (2,2 Go), int8/uint8 statique (1,8 Go) et fp16 (1,7 Go)
//   sont plus lourds — le vocabulaire géant de NLLB (256 206 tokens) gonfle
//   les embeddings.
//   ⚠️ Implication produit : téléchargement OPT-IN obligatoire (jamais
//   embarqué dans l'APK) + Wi-Fi recommandé dans l'UI.
//   Le tokenizer SentencePiece est embarqué dans tokenizer.json — AUCUNE
//   dépendance externe type espeak.
// • Tâche : pipeline('translation') — appel avec { src_lang, tgt_lang }
//   (codes NLLB : 'dyu_Latn', 'fra_Latn'), sortie [{ translation_text }].
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
//   (downloadNllbModel(lang) appelé depuis les réglages), avec progression
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
//   - language 'dyu' → traduit OBLIGATOIREMENT dyu→fra avant le parseur ;
//     si le traducteur est indisponible, lève NLLB_NOT_READY — il est
//     INTERDIT de renvoyer du dioula brut au parseur (test de garde).
//   - language 'bci' → la traduction baoulé requiert le modèle spécialisé ;
//     tant qu'il n'est pas enregistré dans NLLB_MODELS, lève
//     NLLB_UNSUPPORTED avec un message français honnête.
//   - toute autre langue → NLLB_UNSUPPORTED.

/**
 * Codes NLLB-200 visés par la mission (baoulé + dioula + pivot fr).
 * ⚠️ Un code listé ici ne garantit PAS sa couverture par un modèle : voir
 * NLLB_MODELS (registre vérifié).
 */
export type NllbLanguage = 'bci_Latn' | 'dyu_Latn' | 'fra_Latn'

export const NLLB_LANGUAGES = {
  bci: 'bci_Latn',
  dyu: 'dyu_Latn',
  fra: 'fra_Latn',
} as const satisfies Record<string, NllbLanguage>

/** Langues de session (store voice-language) → codes NLLB. */
export type SessionVoiceLanguage = 'fr' | 'bci' | 'dyu'

/**
 * Descripteur d'un modèle de traduction réellement disponible. Un modèle ne
 * couvre que les codes PRÉSENTS dans son tokenizer (vérifiés, jamais
 * supposés) : la paire demandée doit être couverte ENTIÈREMENT par UN modèle.
 */
export type NllbModelDescriptor = {
  /** Identifiant de modèle : dépôt Hugging Face, ou chemin servi par le hub local. */
  id: string
  /** Codes de langue couverts par CE modèle (vérifiés sur son tokenizer). */
  languages: readonly NllbLanguage[]
  /**
   * true = fichiers servis par notre proxy same-origin `/api/voix/<id>/…`
   * (GitHub Release relayée — GitHub n'envoie aucun en-tête CORS) ;
   * false = téléchargement direct depuis Hugging Face.
   */
  localHub: boolean
}

/** Dépôt Hugging Face du modèle dioula (seul modèle NLLB couvrant dyu_Latn). */
export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M'

/**
 * ⚠️ bci_Latn N'EST PAS déclaré ici : le modèle générique ne le couvre pas
 * (tokenizer vérifié 2026-09-20 — voir en-tête). La traduction baoulé attend
 * le modèle spécialisé (Task 84) ; jusqu'à son intégration, toute paire
 * impliquant bci_Latn lève NLLB_UNSUPPORTED avec NLLB_BCI_NOT_COVERED_MESSAGE.
 */
export const NLLB_MODELS: readonly NllbModelDescriptor[] = [
  { id: NLLB_MODEL_ID, languages: ['dyu_Latn', 'fra_Latn'], localHub: false },
]

/** Message français honnête pour toute paire baoulé (aucun modèle disponible). */
export const NLLB_BCI_NOT_COVERED_MESSAGE =
  'La traduction du baoulé n’est pas encore disponible : Tata ne peut pas encore comprendre ni parler baoulé. Réessayez en français ou en dioula.'

/** Le modèle couvre-t-il la paire entière ? (null = aucun modèle unique) */
function modelForPair(src: NllbLanguage, tgt: NllbLanguage): NllbModelDescriptor | null {
  return NLLB_MODELS.find((m) => m.languages.includes(src) && m.languages.includes(tgt)) ?? null
}

/** Message français pour une paire sans modèle — précis quand le baoulé est en cause. */
function describeUnsupportedPair(src: NllbLanguage, tgt: NllbLanguage): string {
  if (src === NLLB_LANGUAGES.bci || tgt === NLLB_LANGUAGES.bci) {
    return NLLB_BCI_NOT_COVERED_MESSAGE
  }
  return `Paire de langues non prise en charge (${src} → ${tgt}).`
}

/** Modèles servant la langue de session vers le français (et l'inverse). */
function modelsForLanguage(language: SessionVoiceLanguage): readonly NllbModelDescriptor[] {
  if (language === 'fr') return []
  const lang = language === 'bci' ? NLLB_LANGUAGES.bci : NLLB_LANGUAGES.dyu
  return NLLB_MODELS.filter(
    (m) => m.languages.includes(lang) && m.languages.includes(NLLB_LANGUAGES.fra),
  )
}

/** Taille mesurée du téléchargement du modèle dioula (poids q8 + tokenizer). */
export const NLLB_MODEL_SIZE_MB = 872
/** Budget de génération par appel (phrases de marché) — borne anti-blocage. */
export const NLLB_TIMEOUT_MS = 20_000
/** Limite de tokens générés : couvre les phrases longues sans dériver. */
export const NLLB_MAX_NEW_TOKENS = 128

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

/**
 * Erreur brute de Transformers.js quand un code de langue est absent du
 * tokenizer chargé (tokenizers.js:3347) — le cas baoulé exact.
 */
const RAW_LANG_CODE_ERROR = /Source language code "([^"]+)" is not valid/

/** Message français explicite pour l'UI (pattern Task 41 — erreurs affichées). */
export function describeNllbError(error: unknown): string {
  if (error instanceof NllbError) return error.message
  if (error instanceof Error) {
    const raw = error.message.match(RAW_LANG_CODE_ERROR)
    if (raw) {
      return `Le modèle de traduction installé ne connaît pas la langue « ${raw[1]} » : téléchargez le modèle adapté dans les réglages de la voix.`
    }
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

/** Tranche d'env de Transformers.js — surchargeable pour un modèle hébergé localement. */
type NllbModuleEnv = { remoteHost: string; remotePathTemplate: string }

type NllbPipelineFactory = (
  task: 'translation',
  modelId: string,
  options?: { progress_callback?: (info: NllbProgressInfo) => void },
) => Promise<NllbTranslatorInstance>

let nllbTranslators = new Map<string, NllbTranslatorInstance>()
let loadingPromises = new Map<string, Promise<NllbTranslatorInstance>>()

/**
 * Sérialise les créations de pipelines : la surcharge du host (modèles
 * hébergés localement) est une mutation globale de env — deux créations ne
 * doivent JAMAIS se chevaucher (un seul téléchargement à la fois).
 */
let pipelineCreationChain: Promise<unknown> = Promise.resolve()

/** Chargeur du pipeline — injectable pour isoler les tests de l'import réel. */
type NllbPipelineLoader = () => Promise<{ pipeline: NllbPipelineFactory; env?: NllbModuleEnv }>
let nllbPipelineLoader: NllbPipelineLoader = async () => {
  const mod = await import('@xenova/transformers')
  // La TranslationPipeline réelle est compatible au runtime avec
  // NllbTranslatorInstance (appel (text, options) → Promise<results>) ; le
  // cast borne la surface typée utilisée par ce module.
  return {
    pipeline: mod.pipeline as unknown as NllbPipelineFactory,
    env: mod.env as unknown as NllbModuleEnv,
  }
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

/** Réinitialise l'état module (instances + promesses). Isolation des tests. */
export function resetNllbForTests(): void {
  nllbTranslators = new Map()
  loadingPromises = new Map()
  pipelineCreationChain = Promise.resolve()
  nllbPipelineLoader = async () => {
    const mod = await import('@xenova/transformers')
    return {
      pipeline: mod.pipeline as unknown as NllbPipelineFactory,
      env: mod.env as unknown as NllbModuleEnv,
    }
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

/** Fragment identifiant les fichiers du modèle dans le Cache API. */
function modelCacheFragment(model: NllbModelDescriptor): string {
  // Hub local : URLs same-origin `/api/voix/<id>/resolve/main/<fichier>` ;
  // Hugging Face : l'identifiant du dépôt est dans chaque URL.
  return model.localHub ? `/api/voix/${model.id}/` : model.id
}

/** Le modèle est-il déjà en cache local (Cache API de Transformers.js) ? */
async function isModelCached(model: NllbModelDescriptor): Promise<boolean> {
  try {
    const cache = await openCache('transformers-cache')
    if (!cache) return false
    const fragment = modelCacheFragment(model)
    const keys = await cache.keys()
    return keys.some((request) => request.url.includes(fragment))
  } catch {
    return false
  }
}

/**
 * Surcharge le host Transformers.js pour un modèle servi par notre hub
 * local (proxy same-origin — GitHub n'envoie aucun en-tête CORS). No-op
 * pour un modèle hébergé sur Hugging Face, ou si l'env n'est pas exposée
 * (tests). Restaure TOUJOURS les valeurs précédentes (finally).
 */
function withModelHostScope<T>(
  env: NllbModuleEnv | undefined,
  model: NllbModelDescriptor,
  run: () => Promise<T>,
): Promise<T> {
  if (!model.localHub || !env) return run()
  const previousHost = env.remoteHost
  const previousTemplate = env.remotePathTemplate
  env.remoteHost = `${globalThis.location?.origin ?? ''}/api/voix/`
  env.remotePathTemplate = '{model}/resolve/main/'
  return run().finally(() => {
    env.remoteHost = previousHost
    env.remotePathTemplate = previousTemplate
  })
}

async function loadNllb(
  model: NllbModelDescriptor,
  onProgress?: (percent: number) => void,
): Promise<NllbTranslatorInstance> {
  const existing = nllbTranslators.get(model.id)
  if (existing) return existing
  const pending = loadingPromises.get(model.id)
  if (pending) return pending

  const attempt = pipelineCreationChain.then(async () => {
    const { pipeline, env } = await nllbPipelineLoader()
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
    const translator = await withModelHostScope(env, model, () =>
      pipeline('translation', model.id, { progress_callback: emit }),
    )
    nllbTranslators.set(model.id, translator)
    return translator
  })
  loadingPromises.set(model.id, attempt)
  // Le chainage continue même après un échec (retentement possible plus
  // tard — réseau revenu — sans promesse rejetée en cache module).
  pipelineCreationChain = attempt.catch(() => {})
  attempt.catch(() => {
    if (loadingPromises.get(model.id) === attempt) loadingPromises.delete(model.id)
  })
  return attempt
}

/**
 * Le traducteur est-il « prêt » sans action de l'utilisateur ? Vrai si une
 * instance couvrant la langue est chargée en mémoire OU si ses fichiers
 * sont en cache. Ne télécharge rien — ne lève jamais (contrat de sonde,
 * comme isKokoroVoiceReady).
 *
 * • language omis → au moins un modèle enregistré est prêt ;
 * • 'fr' → true (aucune traduction requise) ;
 * • 'bci' → modèle spécialisé baoulé prêt (false tant qu'il n'est pas
 *   enregistré dans NLLB_MODELS) ;
 * • 'dyu' → modèle NLLB dioula prêt.
 */
export async function isNllbModelReady(language?: SessionVoiceLanguage): Promise<boolean> {
  if (!isNllbSupported()) return false
  if (language === 'fr') return true
  try {
    const models = language === undefined ? NLLB_MODELS : modelsForLanguage(language)
    for (const model of models) {
      if (nllbTranslators.has(model.id)) return true
      if (await isModelCached(model)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Télécharge le modèle de la langue choisie (dioula ≈ 872 Mo — Wi-Fi
 * recommandé) et charge le pipeline. À appeler UNIQUEMENT depuis une action
 * utilisateur explicite (réglages voix). Retourne true en cas de succès ;
 * lève NllbError typée sinon.
 */
export async function downloadNllbModel(
  onProgress?: (percent: number) => void,
  language: SessionVoiceLanguage = 'dyu',
): Promise<boolean> {
  if (!isNllbSupported()) {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      "La traduction (dioula) nécessite un navigateur avec WebAssembly. Ce contexte n'est pas pris en charge.",
    )
  }
  if (language === 'fr') {
    throw new NllbError(
      'NLLB_UNSUPPORTED',
      'Aucun traducteur à télécharger en session française.',
    )
  }
  const models = modelsForLanguage(language)
  if (models.length === 0) {
    // Baoulé : aucun modèle enregistré (vérification 2026-09-20 — bci_Latn
    // absent du tokenizer NLLB-200). Message honnête, jamais de faux
    // téléchargement du modèle dioula derrière une carte « baoulé ».
    throw new NllbError('NLLB_UNSUPPORTED', NLLB_BCI_NOT_COVERED_MESSAGE)
  }
  try {
    for (const model of models) {
      await loadNllb(model, onProgress)
    }
    return true
  } catch (error) {
    if (error instanceof NllbError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    const label = language === 'bci' ? 'baoulé' : 'dioula'
    throw new NllbError(
      'NLLB_DOWNLOAD_FAILED',
      `Téléchargement du traducteur (${label}) impossible (${detail}). Vérifiez la connexion puis réessayez.`,
    )
  }
}

/** Supprime les fichiers des modèles du cache local (libère l'espace). */
export async function removeNllbModel(modelId?: string): Promise<void> {
  const targets = modelId ? NLLB_MODELS.filter((m) => m.id === modelId) : NLLB_MODELS
  for (const model of targets) {
    nllbTranslators.delete(model.id)
    loadingPromises.delete(model.id)
  }
  if (modelId === undefined) {
    nllbTranslators.clear()
    loadingPromises.clear()
  }
  try {
    const cache = await openCache('transformers-cache')
    if (!cache) return
    const keys = await cache.keys()
    await Promise.all(
      keys
        .filter((request) =>
          targets.some((model) => request.url.includes(modelCacheFragment(model))),
        )
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
 * Traduit un texte dyu ↔ fra, 100 % hors ligne après le premier
 * téléchargement. Ne télécharge JAMAIS implicitement (NLLB_NOT_READY si le
 * modèle n'est ni chargé ni en cache). Lève NllbError typée à chaque échec
 * — notamment NLLB_UNSUPPORTED pour toute paire baoulé (bci_Latn absent du
 * tokenizer du modèle générique : vérification 2026-09-20).
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

  // Registre : la paire doit être couverte ENTIÈREMENT par UN modèle. Une
  // paire baoulé sans modèle spécialisé échoue ICI (erreur française
  // honnête) bien avant le moteur — jamais « Source language code… » brut.
  const model = modelForPair(options.src, options.tgt)
  if (!model) {
    throw new NllbError('NLLB_UNSUPPORTED', describeUnsupportedPair(options.src, options.tgt))
  }

  const ready = nllbTranslators.has(model.id) || (await isModelCached(model))
  if (!ready) {
    throw new NllbError(
      'NLLB_NOT_READY',
      'Le traducteur n’est pas encore téléchargé. Téléchargez-le dans les réglages de la voix.',
    )
  }

  const translator = await loadNllb(model, options.onProgress)

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
    // Défense en profondeur : si un modèle mal déclaré passait quand même
    // au moteur, l'erreur « code de langue invalide » de Transformers.js
    // est reclassée en NLLB_UNSUPPORTED avec un message français lisible
    // (jamais l'erreur anglaise brute à l'écran).
    if (RAW_LANG_CODE_ERROR.test(detail)) {
      throw new NllbError(
        'NLLB_UNSUPPORTED',
        'Le modèle de traduction chargé ne couvre pas cette paire de langues : téléchargez le modèle adapté dans les réglages de la voix.',
      )
    }
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
 * transcript STT et le parseur d'intents français. En dioula, la traduction
 * est OBLIGATOIRE — si le traducteur est indisponible, cette fonction lève
 * (NLLB_NOT_READY) plutôt que de laisser passer du texte brut au parseur.
 * En baoulé, aucun modèle n'étant encore enregistré, l'erreur
 * NLLB_UNSUPPORTED (message français honnête) est levée AVANT tout appel
 * moteur.
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
  if (language === 'bci' && !modelForPair(NLLB_LANGUAGES.bci, NLLB_LANGUAGES.fra)) {
    throw new NllbError('NLLB_UNSUPPORTED', NLLB_BCI_NOT_COVERED_MESSAGE)
  }
  const text = await translateText(transcript, {
    src: NLLB_LANGUAGES[language],
    tgt: NLLB_LANGUAGES.fra,
    timeoutMs: options?.timeoutMs,
  })
  return { text, translated: true }
}
