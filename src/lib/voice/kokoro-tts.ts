// Kokoro TTS — moteur vocal neuronal OPTIONNEL (4ᵉ moteur), en complément
// de Piper (piper-tts.ts) et du pont natif/Web Speech (tata-tts.ts). Piper
// et le TTS natif restent inchangés et continuent de servir de repli.
//
// ── Voix française : identifiant exact et provenance ──────────────────────
// • Identifiant : 'ff_siwis' — c'est la SEULE voix française fournie par
//   Kokoro-82M (préfixe 'ff_' = French Female ; les autres voix couvrent
//   l'anglais af_/am_/bf_/bm_, l'espagnol ef_, l'hindi hf_, l'italien if_,
//   le japonais jf_/jm_, le portugais pf_/pm_ et le mandarin zf_/zm_).
// • Provenance : voix dérivée du corpus SIWIS (données de parole française
//   dédiées à la synthèse vocale), telle que publiée avec le modèle Kokoro
//   de hexgrad (licence Apache-2.0). Fichier de style vector :
//   https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX —
//   voices/ff_siwis.bin (512 Ko, existence et téléchargement vérifiés E2E).
//
// ── Modèle et runtime ─────────────────────────────────────────────────────
// • Modèle : onnx-community/Kokoro-82M-v1.0-ONNX (Hugging Face), variante
//   QUANTIFIÉE 'q8' (≈ 86 Mo) choisie pour le navigateur — la variante fp32
//   pèse ≈ 326 Mo. Le paramètre 'speed' de generate_from_ids() porte la
//   vitesse. Runtime : kokoro-js (Transformers.js + ONNX Runtime Web en
//   WASM), importé dynamiquement pour ne pas alourdir le bundle initial.
//
// ── ⚠️ Contournement kokoro-js : phonémisation française ─────────────────
// • kokoro-js 1.2.1 embarque une carte de voix figée (VOICES, Object.freeze)
//   qui ne contient AUCUNE voix française : appeler tts.generate(text,
//   {voice:'ff_siwis'}) lève « Voice "ff_siwis" not found » (constaté E2E,
//   le mock des tests ne pouvait pas le révéler).
// • Contournement validé E2E (4,4 s d'audio généré) : la carte n'est
//   consultée que par _validate_voice(), appelé par generate()/stream() —
//   PAS par generate_from_ids(). On phonémise donc le français nous-mêmes
//   puis on appelle tokenizer() + generate_from_ids(), qui télécharge le
//   .bin de la voix directement depuis le dépôt HF (via getVoiceData,
//   mise en cache 'kokoro-voices' du paquet).
// • Phonémisation : espeak-ng compilé en WASM (paquet npm 'espeak-ng').
//   G2P identique au pipeline officiel Python : voix 'fr-fr', sortie IPA
//   (--ipa=3), le format attendu par le tokenizer Kokoro pour les langues
//   non anglaises.
// • Chargement espeak-ng : le GLUE JS (~178 Ko) et le binaire WASM
//   (~18,5 Mo) sont récupérés depuis un CDN versionné (unpkg, repli
//   jsdelivr) PUIS mis en cache dans le Cache API 'julaba-espeak-wasm' —
//   lancements suivants hors ligne. Pourquoi pas un import bundle ? Le
//   glue Emscripten contient un `new URL('./', import.meta.url)` que
//   Turbopack ne sait pas résoudre statiquement (build cassé) ; le
//   chargement via blob-URL dynamique isole totalement le bundler.
// • Quirks espeak-ng WASM documentés (validés en direct) :
//   - les arguments CLI encodés en UTF-8 sont décodés Latin-1 par ce build
//     (« ça » → « a-tilde a ») → le texte passe par le système de fichiers
//     Emscripten (FS.writeFile dans preRun + option -f) qui préserve l'UTF-8 ;
//   - la forme '-b=1' casse le parsing d'options de ce build → ne jamais
//     utiliser d'options « = » (UTF-8 est l'encodage par défaut de -f).
// • Chaque phonémisation instancie le CLI espeak (one-shot, ~1 s) : le
//   runtime est recréé à chaque appel — plus simple et sans fuite ;
//   l'overhead reste négligeable devant la synthèse ONNX.
//
// ── Cache et compatibilité ────────────────────────────────────────────────
// • Après le premier téléchargement, tout est local : le modèle dans le
//   Cache API 'transformers-cache' (géré par Transformers.js), la voix
//   ff_siwis dans 'kokoro-voices' (géré par kokoro-js), espeak-ng dans
//   'julaba-espeak-wasm'. Les lancements suivants fonctionnent hors ligne.
// • Compatibilité : navigateur (WASM) et coquille Capacitor (WebView
//   Android moderne : WASM + Cache API disponibles ; 'webgpu' est
//   volontairement écarté car non fiable dans une WebView).
//
// ── Garanties ─────────────────────────────────────────────────────────────
// • JAMAIS de téléchargement automatique au premier lancement : le modèle
//   (≈ 86 Mo) ET le phonémiseur espeak (≈ 18,5 Mo) ne sont récupérés que
//   par downloadKokoroVoice(), appelé depuis une action utilisateur
//   explicite (réglages voix), exactement comme downloadPiperVoice().
// • kokoroSpeak() ne déclenche JAMAIS de téléchargement : sans instance
//   chargée ni ressources en cache, il retourne false immédiatement pour
//   que tataSpeak() enchaîne son repli (Piper → natif → Web Speech).
// • Un timeout borne phonémisation ET synthèse ET lecture : une narration
//   ne peut jamais rester bloquée (le contrat de résolution « à la fin
//   réelle de la lecture » de piperSpeak() est repris à l'identique,
//   watchdog compris).
//
// NOTE DE VALIDATION : chemin download/phonémisation/synthèse EXERCÉ E2E
// (bun + navigateur) — le modèle réel a été téléchargé depuis Hugging Face
// et 4,4 s d'audio français généré avec ff_siwis. À revalider sur appareil
// Android (mémoire WebView) avant mise en avant large.
import { toSpeechText, spellDigits } from './speech-text'

/** Identifiant exact de la voix française Kokoro (voir en-tête). */
export const KOKORO_FR_VOICE = 'ff_siwis'
/** Dépôt Hugging Face du modèle ONNX (provenance exacte du poids). */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
/** Variante quantifiée 8 bits (≈ 86 Mo) — la plus légère sans perte majeure. */
export const KOKORO_DTYPE = 'q8'
/** Taille approximative du téléchargement du modèle (q8), pour l'UI des réglages. */
export const KOKORO_MODEL_SIZE_MB = 86

const KOKORO_CACHE_NAME = 'transformers-cache'
const KOKORO_VOICES_CACHE_NAME = 'kokoro-voices'
const ESPEAK_CACHE_NAME = 'julaba-espeak-wasm'
// Glue JS + binaire WASM d'espeak-ng servis depuis un CDN versionné
// (unpkg = contenu immuable par version, jsdelivr en repli) puis mis en
// cache localement. Le glue n'est PAS importé par le bundler (voir en-tête).
const ESPEAK_GLUE_URL = 'https://unpkg.com/espeak-ng@1.0.2/dist/espeak-ng.js'
const ESPEAK_GLUE_URL_FALLBACK = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.js'
const ESPEAK_WASM_URL = 'https://unpkg.com/espeak-ng@1.0.2/dist/espeak-ng.wasm'
const ESPEAK_WASM_URL_FALLBACK = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.wasm'
/** Taille approximative du téléchargement espeak-ng (glue + wasm), pour l'UI. */
export const ESPEAK_WASM_SIZE_MB = 18

type KokoroGenerateResult = {
  audio: Float32Array
  sampling_rate: number
}

type KokoroInputIds = { dims: number[] }

type KokoroTtsInstance = {
  tokenizer: (text: string, options?: { truncation?: boolean }) => { input_ids: KokoroInputIds }
  generate_from_ids: (
    inputIds: KokoroInputIds,
    options: { voice: string; speed?: number },
  ) => Promise<KokoroGenerateResult>
}

type KokoroProgressInfo = {
  status?: string
  file?: string
  loaded?: number
  total?: number
}

type FromPretrainedOptions = {
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  device?: 'wasm' | 'webgpu' | 'cpu' | null
  progress_callback?: (info: KokoroProgressInfo) => void
}

type EspeakRuntime = {
  FS: {
    writeFile: (path: string, data: string, options?: { encoding: string }) => unknown
    readFile: (path: string, options?: { encoding: string }) => string
  }
}

export type EspeakNgModule = {
  default: (options: {
    arguments: string[]
    preRun?: (module: EspeakRuntime) => void
    wasmBinary?: Uint8Array
  }) => Promise<EspeakRuntime>
}

let kokoroInstance: KokoroTtsInstance | null = null
let loadingPromise: Promise<KokoroTtsInstance> | null = null
let espeakModule: EspeakNgModule | null = null

/** Chargeur du glue espeak-ng — injectable pour isoler les tests du
 * chargement blob-URL (impossible à mocker via vi.mock). */
type EspeakGlueLoader = () => Promise<EspeakNgModule>
let espeakGlueLoader: EspeakGlueLoader = loadEspeakGlueFromCache

export function setEspeakGlueLoaderForTests(loader: EspeakGlueLoader): void {
  espeakGlueLoader = loader
}

export function isKokoroSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof caches !== 'undefined'
  )
}

/** Réinitialise l'état module (instance + promesses). Équivalent de
 * resetSherpaStateForTests() : isolation des tests. */
export function resetKokoroForTests(): void {
  kokoroInstance = null
  loadingPromise = null
  espeakModule = null
  espeakGlueLoader = loadEspeakGlueFromCache
}

async function openCache(name: string): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(name)
  } catch {
    return null
  }
}

/** Le modèle ou la voix ff_siwis sont-ils déjà en cache ? */
async function isModelCached(): Promise<boolean> {
  try {
    const cache = await openCache(KOKORO_CACHE_NAME)
    if (!cache) return false
    const keys = await cache.keys()
    if (keys.some((request) => request.url.includes(KOKORO_MODEL_ID))) return true
    // Le fichier de voix ff_siwis.bin vit dans le cache 'kokoro-voices'
    // tenu par kokoro-js (getVoiceData).
    const voicesCache = await openCache(KOKORO_VOICES_CACHE_NAME)
    if (!voicesCache) return false
    const voiceKeys = await voicesCache.keys()
    return voiceKeys.some((request) => request.url.includes(KOKORO_FR_VOICE))
  } catch {
    return false
  }
}

/** Le phonémiseur espeak-ng (glue + wasm) est-il déjà en cache ? */
async function isEspeakCached(): Promise<boolean> {
  try {
    const cache = await openCache(ESPEAK_CACHE_NAME)
    if (!cache) return false
    const glue = await cache.match(ESPEAK_GLUE_URL)
    const wasm = await cache.match(ESPEAK_WASM_URL)
    return glue !== undefined && wasm !== undefined
  } catch {
    return false
  }
}

/**
 * Le moteur français est-il « prêt » sans action de l'utilisateur ?
 * Vrai si les DEUX ressources sont couvertes : le modèle (instance chargée
 * en mémoire OU fichiers en cache) ET le phonémiseur espeak-ng (module
 * chargé OU binaire en cache). Ne télécharge rien.
 */
export async function isKokoroVoiceReady(): Promise<boolean> {
  if (!isKokoroSupported()) return false
  try {
    const modelReady = kokoroInstance !== null || (await isModelCached())
    const espeakReady = espeakModule !== null || (await isEspeakCached())
    return modelReady && espeakReady
  } catch {
    return false
  }
}

async function loadKokoro(onProgress?: (percent: number) => void): Promise<KokoroTtsInstance> {  if (kokoroInstance) return kokoroInstance
  if (!loadingPromise) {
    const attempt = (async () => {
      const { KokoroTTS } = await import('kokoro-js')
      const loadOptions: FromPretrainedOptions = {
        dtype: KOKORO_DTYPE,
        device: 'wasm',
        progress_callback: (info: KokoroProgressInfo) => {
          if (!onProgress) return
          if (info?.status !== 'progress' || typeof info.total !== 'number' || info.total <= 0) return
          const loaded = typeof info.loaded === 'number' && info.loaded >= 0 ? info.loaded : 0
          onProgress(Math.min(100, Math.round((loaded / info.total) * 100)))
        },
      }
      const tts = (await KokoroTTS.from_pretrained(
        KOKORO_MODEL_ID,
        loadOptions,
      )) as unknown as KokoroTtsInstance
      kokoroInstance = tts
      return tts
    })()
    loadingPromise = attempt
    // Un échec doit pouvoir être retenté plus tard (réseau revenu) sans
    // laisser une promesse rejetée en cache module.
    attempt.catch(() => {
      if (loadingPromise === attempt) loadingPromise = null
      kokoroInstance = null
    })
  }
  return loadingPromise
}

/** Récupère une ressource espeak-ng : cache local d'abord, CDN ensuite
 * (unpkg puis jsdelivr), avec mise en cache après un fetch réseau réussi. */
async function fetchEspeakResource(url: string, fallbackUrl: string): Promise<Response> {
  const cache = await openCache(ESPEAK_CACHE_NAME)
  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit) return hit
    } catch {
      // Cache illisible — on retente via le réseau.
    }
  }
  const sources: Array<{ url: string; cacheIt: boolean }> = [
    { url, cacheIt: true },
    { url: fallbackUrl, cacheIt: false },
  ]
  let lastError: unknown = null
  for (const source of sources) {
    try {
      const response = await fetch(source.url)
      if (!response.ok) throw new Error(`HTTP ${response.status} pour ${source.url}`)
      const body = await response.arrayBuffer()
      if (body.byteLength === 0) throw new Error(`Réponse vide pour ${source.url}`)
      const cached = new Response(body, { headers: response.headers })
      if (cache && source.cacheIt) {
        try {
          await cache.put(url, cached.clone())
        } catch {
          // Quota dépassé ou cache indisponible : la synthèse reste possible
          // pour cette session, le re-téléchargement retentera plus tard.
        }
      }
      return cached
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Ressource espeak-ng indisponible')
}

/** Charge le module espeak-ng : glue JS (texte) importé dynamiquement via
 * blob-URL — aucune implication du bundler (voir en-tête). */
async function loadEspeakGlueFromCache(): Promise<EspeakNgModule> {
  if (espeakModule) return espeakModule
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Blob URL indisponible pour charger espeak-ng')
  }
  const glueResponse = await fetchEspeakResource(ESPEAK_GLUE_URL, ESPEAK_GLUE_URL_FALLBACK)
  // Patch du glue : dans un module chargé via blob-URL, `import.meta.url`
  // vaut « blob:… » et Emscripten calcule scriptDirectory avec
  // new URL('.', import.meta.url) → TypeError "Invalid URL" (constaté E2E).
  // document.baseURI est toujours une URL https valide dans le WebView ;
  // ces occurrences ne servent qu'à localiser le .wasm, que l'on fournit
  // de toute façon via wasmBinary.
  const glueText = (await glueResponse.text()).replace(/import\.meta\.url/g, 'document.baseURI')
  const blobUrl = URL.createObjectURL(new Blob([glueText], { type: 'text/javascript' }))
  try {
    const mod = (await import(/* turbopackIgnore: true */ blobUrl)) as unknown as EspeakNgModule
    if (typeof mod?.default !== 'function') {
      throw new Error('Module espeak-ng inattendu (export default absent)')
    }
    espeakModule = mod
    return mod
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Phonémise un texte français avec espeak-ng (G2P identique au pipeline
 * officiel Kokoro). Une instance one-shot par appel ; le texte transite par
 * le FS Emscripten (arguments CLI corrompus en UTF-8 sur ce build — voir
 * en-tête). Retourne une chaîne IPA (lignes jointes par des espaces).
 */
export async function phonemizeFrench(text: string): Promise<string> {
  if (!text || !text.trim()) return ''
  const espeak = await espeakGlueLoader()
  // Mémorise le module retourné (le loader par défaut le fait déjà ; un
  // loader injecté en tests doit produire le même effet de session).
  espeakModule = espeak
  const wasmResponse = await fetchEspeakResource(ESPEAK_WASM_URL, ESPEAK_WASM_URL_FALLBACK)
  const wasmBytes = new Uint8Array(await wasmResponse.arrayBuffer())
  const runtime = await espeak.default({
    arguments: ['--phonout', 'julaba-phonemes', '-q', '--ipa=3', '-v', 'fr-fr', '-f', 'julaba-input.txt'],
    wasmBinary: wasmBytes,
    preRun: (module) => {
      module.FS.writeFile('julaba-input.txt', text, { encoding: 'utf8' })
    },
  })
  const raw = runtime.FS.readFile('julaba-phonemes', { encoding: 'utf8' })
  return raw.replace(/\n+/g, ' ').trim()
}

/**
 * Télécharge (une fois) et prépare TOUTES les ressources Kokoro : le modèle
 * ONNX (≈ 86 Mo, progression 0–85 %) puis le phonémiseur espeak-ng
 * (≈ 18,5 Mo, 85–100 %). Doit être appelé depuis une action utilisateur
 * (réglages voix), jamais automatiquement. Retourne false (jamais
 * d'exception) si l'un des téléchargements échoue.
 */
export async function downloadKokoroVoice(onProgress?: (percent: number) => void): Promise<boolean> {
  if (!isKokoroSupported()) return false
  try {
    await loadKokoro((percent) => onProgress?.(Math.round(percent * 0.85)))
    // Phonémiseur : glue JS puis binaire WASM (~18,5 Mo) — même contrat
    // « téléchargé uniquement ici, jamais pendant une narration ».
    await fetchEspeakResource(ESPEAK_GLUE_URL, ESPEAK_GLUE_URL_FALLBACK)
    await fetchEspeakResource(ESPEAK_WASM_URL, ESPEAK_WASM_URL_FALLBACK)
    onProgress?.(100)
    return true
  } catch (err) {
    console.warn('[kokoro-tts] Téléchargement des ressources Kokoro échoué :', err)
    kokoroInstance = null
    loadingPromise = null
    return false
  }
}

/** Supprime les fichiers du modèle, de la voix et du phonémiseur des caches,
 * et décharge les instances mémoire. */
export async function removeKokoroVoice(): Promise<void> {
  try {
    const modelCache = await openCache(KOKORO_CACHE_NAME)
    if (modelCache) {
      const keys = await modelCache.keys()
      await Promise.all(
        keys.filter((request) => request.url.includes(KOKORO_MODEL_ID)).map((request) => modelCache.delete(request)),
      )
    }
  } catch {
    // Rien à nettoyer ou cache inaccessible — l'état mémoire est réinitialisé quoi qu'il arrive.
  }
  try {
    const voicesCache = await openCache(KOKORO_VOICES_CACHE_NAME)
    if (voicesCache) {
      const keys = await voicesCache.keys()
      await Promise.all(
        keys.filter((request) => request.url.includes(KOKORO_FR_VOICE)).map((request) => voicesCache.delete(request)),
      )
    }
  } catch {
    // Idem.
  }
  try {
    const espeakCache = await openCache(ESPEAK_CACHE_NAME)
    if (espeakCache) {
      await espeakCache.delete(ESPEAK_GLUE_URL)
      await espeakCache.delete(ESPEAK_WASM_URL)
    }
  } catch {
    // Idem.
  }
  kokoroInstance = null
  loadingPromise = null
}

let audioContext: AudioContext | null = null
let audioSource: AudioBufferSourceNode | null = null

export function unlockKokoroAudio(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    // Le navigateur peut n'exposer aucune sortie audio exploitable.
  }
}

/** Arrête la lecture Kokoro en cours (no-op si aucune). */
export function kokoroStop(): void {
  try { audioSource?.stop() } catch { /* déjà arrêtée */ }
  audioSource = null
}

// Timeout de synthèse : base + marge par caractère (même formule que le
// watchdog du pont natif) — une génération WASM qui pend ne peut pas
// bloquer la narration, kokoroSpeak retourne false et le repli s'enclenche.
// La phonémisation espeak a son propre plafond (instanciation one-shot ~1 s).
const SYNTHESIS_TIMEOUT_BASE_MS = 30_000
const SYNTHESIS_TIMEOUT_PER_CHAR_MS = 80
const SYNTHESIS_TIMEOUT_CAP_MS = 120_000
const PHONEMIZE_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const raced = Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`[kokoro-tts] ${label} dépassé (${ms} ms)`)), ms)
    }),
  ])
  return raced.finally(() => clearTimeout(timer))
}

/**
 * Synthétise et lit `text` avec la voix française Kokoro (ff_siwis).
 * Pipeline : normalisation montants → épellation chiffres restants →
 * phonémisation espeak fr-fr → tokenizer → generate_from_ids (contourne la
 * carte de voix figée de kokoro-js, voir en-tête). Retourne false (jamais
 * d'exception) si les ressources ne sont pas disponibles ou si une étape
 * échoue, pour que tataSpeak() enchaîne son repli.
 *
 * Résout uniquement quand LA LECTURE EST TERMINÉE (onended + watchdog),
 * même contrat que piperSpeak() : les chaînes « parle puis agis » de
 * tataSpeak() restent correctes.
 */
export async function kokoroSpeak(
  text: string,
  options?: { rate?: number; volume?: number },
): Promise<boolean> {
  if (!text || !text.trim()) return false
  // Garde-fou anti-téléchargement : une narration ne doit JAMAIS lancer
  // un téléchargement de 100 Mo à l'improviste. Sans ressources en cache
  // ni instance → échec immédiat et silencieux (le repli tataSpeak prend
  // le relais).
  if (!(await isKokoroVoiceReady())) return false

  const spokenText = spellDigits(toSpeechText(text))
    // L'épellation insère un espace AVANT la ponctuation suivante
    // (« zéro , ») — inoffensif pour espeak mais laid dans les tests et
    // les logs ; on recolle virgule et point uniquement (l'espace avant
    // ? ! : ; est la typographie française correcte). Ne concerne que
    // Kokoro : Piper a son propre nettoyage.
    .replace(/\s+([,.])/g, '$1')
  const speed = options?.rate ?? 0.9
  const volume = Math.max(0, Math.min(1, options?.volume ?? 1))

  try {
    const [tts, phonemes] = await Promise.all([
      loadKokoro(),
      withTimeout(phonemizeFrench(spokenText), PHONEMIZE_TIMEOUT_MS, 'Phonémisation espeak'),
    ])
    if (!phonemes) return false
    const { input_ids } = tts.tokenizer(phonemes, { truncation: true })
    const timeoutMs = Math.min(
      SYNTHESIS_TIMEOUT_CAP_MS,
      SYNTHESIS_TIMEOUT_BASE_MS + phonemes.length * SYNTHESIS_TIMEOUT_PER_CHAR_MS,
    )
    const raw = await withTimeout(
      tts.generate_from_ids(input_ids, { voice: KOKORO_FR_VOICE, speed }),
      timeoutMs,
      'Synthèse Kokoro',
    )
    const audioData = raw?.audio
    const sampleRate = raw?.sampling_rate
    if (!(audioData instanceof Float32Array) || !sampleRate || audioData.length === 0) return false

    unlockKokoroAudio()
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

    // Attendre la fin RÉELLE de la lecture (ou kokoroStop(), ou watchdog
    // de secours sur WebView cassée), comme piperSpeak().
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
    console.warn('[kokoro-tts] Synthèse/lecture Kokoro en échec :', err)
    return false
  }
}
