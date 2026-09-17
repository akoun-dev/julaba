// Kokoro TTS — moteur vocal neuronal OPTIONNEL (3ᵉ moteur), en complément
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
//   de hexgrad (licence Apache-2.0).
//
// ── Modèle et runtime ─────────────────────────────────────────────────────
// • Modèle : onnx-community/Kokoro-82M-v1.0-ONNX (Hugging Face), variante
//   QUANTIFIÉE 'q8' (≈ 86 Mo) choisie pour le navigateur — la variante fp32
//   pèse ≈ 326 Mo. Le paramètre 'speed' de generate() porte la vitesse.
// • Runtime : kokoro-js (Transformers.js + ONNX Runtime Web en WASM),
//   importé dynamiquement pour ne pas alourdir le bundle initial.
// • Cache : après le premier téléchargement, Transformers.js conserve les
//   fichiers dans le Cache API du navigateur ('transformers-cache') — les
//   lancements suivants fonctionnent hors ligne.
// • Compatibilité : navigateur (WASM) et coquille Capacitor (WebView
//   Android moderne : WASM + Cache API disponibles ; 'webgpu' est volontairement
//   écarté car non fiable dans une WebView).
//
// ── Garanties ─────────────────────────────────────────────────────────────
// • JAMAIS de téléchargement automatique au premier lancement : le modèle
//   (≈ 86 Mo) n'est récupéré que par downloadKokoroVoice(), appelé depuis
//   une action utilisateur explicite (réglages voix), exactement comme
//   downloadPiperVoice().
// • kokoroSpeak() ne déclenche JAMAIS de téléchargement : sans instance
//   chargée ni cache, il retourne false immédiatement pour que tataSpeak()
//   enchaîne son repli (Piper → natif → Web Speech).
// • Un timeout borne synthèse ET lecture : une narration ne peut jamais
//   rester bloquée (le contrat de résolution « à la fin réelle de la
//   lecture » de piperSpeak() est repris à l'identique, watchdog compris).
//
// NOTE DE VALIDATION : l'hôte Hugging Face n'était pas joignable depuis le
// réseau de développement de ce sandbox (même contrainte que Piper) — le
// chemin download/generate est implémenté contre l'API réelle documentée de
// kokoro-js 1.2.1 et mocké dans les tests. À valider E2E sur appareil réel
// avant d'exposer le moteur dans les réglages.
import { toSpeechText } from './speech-text'

/** Identifiant exact de la voix française Kokoro (voir en-tête). */
export const KOKORO_FR_VOICE = 'ff_siwis'
/** Dépôt Hugging Face du modèle ONNX (provenance exacte du poids). */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
/** Variante quantifiée 8 bits (≈ 86 Mo) — la plus légère sans perte majeure. */
export const KOKORO_DTYPE = 'q8'
/** Taille approximative du téléchargement (q8), pour l'UI des réglages. */
export const KOKORO_MODEL_SIZE_MB = 86

const KOKORO_CACHE_NAME = 'transformers-cache'

type KokoroGenerateResult = {
  audio: Float32Array
  sampling_rate: number
}

type KokoroTtsInstance = {
  generate: (
    text: string,
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

let kokoroInstance: KokoroTtsInstance | null = null
let loadingPromise: Promise<KokoroTtsInstance> | null = null

export function isKokoroSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof caches !== 'undefined'
  )
}

/** Réinitialise l'état module (instance + promesse de chargement).
 * Équivalent de resetSherpaStateForTests() : isolation des tests. */
export function resetKokoroForTests(): void {
  kokoroInstance = null
  loadingPromise = null
}

async function openKokoroCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(KOKORO_CACHE_NAME)
  } catch {
    return null
  }
}

/**
 * Le modèle français est-il « prêt » sans action de l'utilisateur ?
 * Vrai si une instance est déjà chargée en mémoire OU si le modèle est
 * présent dans le Cache API (téléchargé précédemment). Ne télécharge rien.
 */
export async function isKokoroVoiceReady(): Promise<boolean> {
  if (kokoroInstance) return true
  if (!isKokoroSupported()) return false
  try {
    const cache = await openKokoroCache()
    if (!cache) return false
    const keys = await cache.keys()
    return keys.some((request) => request.url.includes(KOKORO_MODEL_ID))
  } catch {
    return false
  }
}

async function loadKokoro(onProgress?: (percent: number) => void): Promise<KokoroTtsInstance> {
  if (kokoroInstance) return kokoroInstance
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

/**
 * Télécharge (une fois) et charge le modèle Kokoro. Doit être appelé
 * depuis une action utilisateur (réglages voix), jamais automatiquement.
 * Retourne false (jamais d'exception) si le téléchargement échoue.
 */
export async function downloadKokoroVoice(onProgress?: (percent: number) => void): Promise<boolean> {
  if (!isKokoroSupported()) return false
  try {
    await loadKokoro(onProgress)
    return true
  } catch (err) {
    console.warn('[kokoro-tts] Téléchargement du modèle Kokoro échoué :', err)
    kokoroInstance = null
    loadingPromise = null
    return false
  }
}

/** Supprime les fichiers du modèle du cache et décharge l'instance. */
export async function removeKokoroVoice(): Promise<void> {
  try {
    const cache = await openKokoroCache()
    if (cache) {
      const keys = await cache.keys()
      await Promise.all(
        keys.filter((request) => request.url.includes(KOKORO_MODEL_ID)).map((request) => cache.delete(request)),
      )
    }
  } catch {
    // Rien à nettoyer ou cache inaccessible — l'état mémoire est réinitialisé quoi qu'il arrive.
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
const SYNTHESIS_TIMEOUT_BASE_MS = 30_000
const SYNTHESIS_TIMEOUT_PER_CHAR_MS = 80
const SYNTHESIS_TIMEOUT_CAP_MS = 120_000

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
 * Synthétise et lit `text` avec la voix française Kokoro. Retourne false
 * (jamais d'exception) si le modèle n'est pas disponible/chargé ou si la
 * synthèse/lecture échoue, pour que tataSpeak() enchaîne son repli.
 *
 * Résout uniquement quand LA LECTURE EST TERMINÉE (onended + watchdog),
 * même contrat que piperSpeak() : les chaînes « parle puis agis » de
 * tataSpeak() restent correctes.
 *
 * Les montants sont verbalisés via toSpeechText() (« 1 500 FCFA » →
 * « mille cinq cents francs CFA ») ; PIN, téléphones et codes restent
 * tels quels (aucune devise détectée → aucune transformation).
 */
export async function kokoroSpeak(
  text: string,
  options?: { rate?: number; volume?: number },
): Promise<boolean> {
  if (!text || !text.trim()) return false
  // Garde-fou anti-téléchargement : une narration ne doit JAMAIS lancer
  // un téléchargement de 86 Mo à l'improviste. Sans instance ni cache →
  // échec immédiat et silencieux (le repli tataSpeak prend le relais).
  if (!kokoroInstance && !(await isKokoroVoiceReady())) return false

  const spokenText = toSpeechText(text)
  const speed = options?.rate ?? 0.9
  const volume = Math.max(0, Math.min(1, options?.volume ?? 1))

  try {
    const tts = await loadKokoro()
    const timeoutMs = Math.min(
      SYNTHESIS_TIMEOUT_CAP_MS,
      SYNTHESIS_TIMEOUT_BASE_MS + spokenText.length * SYNTHESIS_TIMEOUT_PER_CHAR_MS,
    )
    const raw = await withTimeout(
      tts.generate(spokenText, { voice: KOKORO_FR_VOICE, speed }),
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
