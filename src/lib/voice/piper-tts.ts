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

let audioEl: HTMLAudioElement | null = null

/**
 * Synthesizes and plays `text` with the downloaded Piper voice. Returns
 * false (never throws) if the model isn't ready or synthesis fails, so
 * callers can fall back to Web Speech.
 */
export async function piperSpeak(text: string): Promise<boolean> {
  if (!(await isPiperVoiceReady())) return false
  try {
    const { predict } = await import('@mintplex-labs/piper-tts-web')
    const blob = await predict({ text, voiceId: PIPER_FR_VOICE })
    const url = URL.createObjectURL(blob)
    if (!audioEl) audioEl = new Audio()
    audioEl.src = url
    audioEl.onended = () => URL.revokeObjectURL(url)
    await audioEl.play()
    return true
  } catch (err) {
    console.warn('[piper-tts] Synthèse échouée:', err)
    return false
  }
}

export function piperStop(): void {
  audioEl?.pause()
}
