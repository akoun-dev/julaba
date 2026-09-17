// Opt-in "voix haute qualité" upgrade over the default Web Speech API,
// using Piper (VITS) neural TTS running fully on-device via WASM/ONNX
// Runtime (@mintplex-labs/piper-tts-web).
//
// This is NOT the default and is never auto-enabled: the voice model is
// tens of megabytes and must be explicitly downloaded once by the user
// (download() below), then it's cached in OPFS for reuse. If the
// download fails for any reason (offline, storage quota, the model host
// being unreachable on a given network) callers must fall back to
// tataSpeak's existing Web Speech path — see setTtsEngine()/piperSpeak()
// usage in tata-tts.ts.
//
// Model provenance: fetched at runtime from
// https://huggingface.co/diffusionstudio/piper-voices (hardcoded inside
// the @mintplex-labs/piper-tts-web package itself, not something this
// file controls). That host was not reachable from this sandbox's
// network policy during development, so the download/predict path below
// is implemented against the package's real, documented API but has not
// been exercised end-to-end here — test it on a real device/network
// before enabling it by default for any user segment.
import type { VoiceId, Progress } from '@mintplex-labs/piper-tts-web'

export const PIPER_FR_VOICE: VoiceId = 'fr_FR-siwis-low'
const PIPER_ONNX_WASM_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/'

// Some Piper voices have a 130-entry phoneme embedding table. The phonemizer
// can emit IDs outside that table for digits, symbols, and unnormalised text.
// Keep this transformation local to Piper: Web Speech/native TTS should still
// receive the original text so it can read amounts and punctuation naturally.
const FRENCH_DIGITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']

export function sanitizeForPiper(text: string): string {
  const withSpokenDigits = text.replace(/\d/g, (digit) => ` ${FRENCH_DIGITS[Number(digit)]} `)
  return withSpokenDigits
    .normalize('NFC')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^\p{L}\p{M}\s.,!?;:'’-]/gu, ' ')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function configurePiperWasm() {
  const { TtsSession } = await import('@mintplex-labs/piper-tts-web')
  // Piper 1.0.5 defaults to an obsolete cdnjs path for the ONNX .mjs file.
  // Override its shared locations before the first session is created.
  TtsSession.WASM_LOCATIONS.onnxWasm = PIPER_ONNX_WASM_URL
}

export function isPiperSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  )
}

export async function isPiperVoiceReady(): Promise<boolean> {
  if (!isPiperSupported()) return false
  try {
    const { stored } = await import('@mintplex-labs/piper-tts-web')
    const ids = await stored()
    return ids.includes(PIPER_FR_VOICE)
  } catch {
    return false
  }
}

/**
 * Explicitly triggers the (large, one-time) voice model download. Must be
 * called from a user action (e.g. a settings toggle), never automatically.
 */
export async function downloadPiperVoice(onProgress?: (percent: number) => void): Promise<boolean> {
  if (!isPiperSupported()) return false
  try {
    const { download } = await import('@mintplex-labs/piper-tts-web')
    await download(PIPER_FR_VOICE, (p: Progress) => {
      if (p.total > 0) onProgress?.(Math.round((p.loaded / p.total) * 100))
    })
    return true
  } catch (err) {
    console.warn('[piper-tts] Téléchargement du modèle vocal échoué:', err)
    return false
  }
}

export async function removePiperVoice(): Promise<void> {
  try {
    const { remove } = await import('@mintplex-labs/piper-tts-web')
    await remove(PIPER_FR_VOICE)
  } catch {
    // Nothing to clean up.
  }
}

let audioContext: AudioContext | null = null
let audioSource: AudioBufferSourceNode | null = null

export function unlockPiperAudio(): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    // The browser can expose no usable audio output in a restricted WebView.
  }
}

/**
 * Synthesizes and plays `text` with the downloaded Piper voice. Returns
 * false (never throws) if the model isn't ready or synthesis fails, so
 * callers can fall back to Web Speech.
 *
 * Resolves only once PLAYBACK HAS FINISHED (not when playback starts):
 * tataSpeak() pipes this straight into its single 'done' callback, and
 * every caller chains a follow-up action on it (close modal → navigate).
 * Firing at start made "speak then act" chains act while Tata was still
 * talking — the exact bug class the other two engines (native, Web Speech)
 * already guard against. A watchdog releases the promise even if the
 * buffer's onended event never fires on a broken WebView.
 */
export async function piperSpeak(text: string): Promise<boolean> {
  if (!(await isPiperVoiceReady())) return false
  const navigatorObject = typeof navigator !== 'undefined' ? navigator : null
  const hadOwnConcurrency = navigatorObject
    ? Object.prototype.hasOwnProperty.call(navigatorObject, 'hardwareConcurrency')
    : false
  const previousConcurrency = navigatorObject && hadOwnConcurrency
    ? Object.getOwnPropertyDescriptor(navigatorObject, 'hardwareConcurrency')
    : undefined
  try {
    // Piper's web package uses navigator.hardwareConcurrency for ONNX WASM
    // threads. The app is not cross-origin isolated, so SharedArrayBuffer
    // cannot support that value reliably; force a safe single-thread runtime
    // instead of emitting a warning and attempting an unsupported setup.
    if (navigatorObject && navigatorObject.hardwareConcurrency > 1) {
      Object.defineProperty(navigatorObject, 'hardwareConcurrency', {
        configurable: true,
        value: 1,
      })
    }
    const { predict } = await import('@mintplex-labs/piper-tts-web')
    await configurePiperWasm()
    const piperText = sanitizeForPiper(text)
    if (!piperText) return false
    const blob = await predict({ text: piperText, voiceId: PIPER_FR_VOICE })
    unlockPiperAudio()
    if (!audioContext) return false
    if (audioContext.state === 'suspended') await audioContext.resume()
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    audioSource?.stop()
    audioSource = audioContext.createBufferSource()
    audioSource.buffer = buffer
    audioSource.connect(audioContext.destination)
    // Wait for real end of playback (or piperStop()/tataStop() stopping the
    // source, which also fires onended), with a watchdog just in case.
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
  } catch {
    return false
  } finally {
    if (navigatorObject) {
      try {
        if (hadOwnConcurrency && previousConcurrency) {
          Object.defineProperty(navigatorObject, 'hardwareConcurrency', previousConcurrency)
        } else {
          Reflect.deleteProperty(navigatorObject, 'hardwareConcurrency')
        }
      } catch {
        // Some browsers expose navigator as non-configurable; keep the
        // temporary value rather than turning a successful synthesis into an
        // application error.
      }
    }
  }
}

export function piperStop(): void {
  try { audioSource?.stop() } catch { /* Already stopped. */ }
  audioSource = null
}
