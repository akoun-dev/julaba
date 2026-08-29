/**
 * STT Factory — decides between Sherpa-ONNX (offline) and Web Speech API (online).
 * Provides a unified interface for all STT consumers in the app.
 */

import { SherpaStt } from './sherpa-stt'
import { createSingleShotSTT, createContinuousSTT, isSTTAvailable, type STTCallbacks, type STTSession } from './stt'

// Re-export STTSession type for consumers
export type { STTSession } from './stt'

// Sherpa model path on device (bundled in assets)
const SHERPA_MODEL_PATH = 'models/sherpa-onnx-streaming-zipformer-fr-2023-04-14-int8'

let _sherpaAvailable: boolean | null = null
let _sherpaModelLoaded = false

/**
 * Check if Sherpa-ONNX is available and the model is loaded.
 * Caches the result after the first call.
 */
export async function isSherpaAvailable(): Promise<boolean> {
  if (_sherpaAvailable !== null) return _sherpaAvailable
  try {
    const result = await SherpaStt.isAvailable()
    _sherpaAvailable = result.available
    _sherpaModelLoaded = result.modelLoaded
    return result.available
  } catch {
    _sherpaAvailable = false
    return false
  }
}

/**
 * Initialize the Sherpa model if not already loaded.
 * Returns true if successful.
 */
export async function initSherpaModel(): Promise<boolean> {
  if (_sherpaModelLoaded) return true
  try {
    await SherpaStt.initModel({ modelPath: SHERPA_MODEL_PATH })
    _sherpaModelLoaded = true
    _sherpaAvailable = true
    return true
  } catch (err) {
    console.warn('[stt-factory] Failed to init Sherpa model:', err)
    _sherpaAvailable = false
    return false
  }
}

/**
 * Sherpa-backed STT session (fully offline).
 */
function createSherpaSingleShotSTT(
  callbacks: STTCallbacks,
  _options?: { lang?: string; maxAlternatives?: number }
): STTSession {
  let listening = false
  let removeListener: (() => Promise<void>) | null = null

  const start = async () => {
    if (listening) return
    listening = true
    try {
      const handle = await SherpaStt.addListener('sttResult', (data) => {
        if (data.isFinal && data.transcript) {
          callbacks.onResult({
            transcript: data.transcript,
            confidence: 0.9,
            isFinal: true,
          })
          callbacks.onEnd?.()
          listening = false
        }
      })
      removeListener = () => handle.remove()
      await SherpaStt.startRecognition()
    } catch (err) {
      listening = false
      callbacks.onError?.(`Sherpa STT error: ${err}`)
      callbacks.onEnd?.()
    }
  }

  const stop = async () => {
    if (!listening) return
    listening = false
    try {
      await SherpaStt.stopRecognition()
    } catch { /* already stopped */ }
    if (removeListener) {
      await removeListener()
      removeListener = null
    }
  }

  const abort = () => {
    stop()
  }

  return {
    start: () => { start() },
    stop,
    abort,
    isListening: () => listening,
  }
}

/**
 * Create a single-shot STT session, preferring Sherpa (offline) when available.
 * Falls back to Web Speech API if Sherpa is not available.
 */
export async function createSmartSingleShotSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string; maxAlternatives?: number }
): Promise<STTSession> {
  // Try Sherpa first (offline-capable)
  if (await isSherpaAvailable()) {
    return createSherpaSingleShotSTT(callbacks, options)
  }

  // Try to init Sherpa model if not yet loaded
  if (await initSherpaModel()) {
    return createSherpaSingleShotSTT(callbacks, options)
  }

  // Fallback to Web Speech API (requires network)
  if (isSTTAvailable()) {
    return createSingleShotSTT(callbacks, options)
  }

  // Neither available
  return {
    start: () => { callbacks.onError?.('Aucun moteur STT disponible') },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}

/**
 * Create a continuous STT session, preferring Sherpa (offline) when available.
 * Falls back to Web Speech API if Sherpa is not available.
 */
export async function createSmartContinuousSTT(
  callbacks: STTCallbacks,
  options?: { lang?: string; maxAlternatives?: number; interimResults?: boolean }
): Promise<STTSession> {
  // Try Sherpa first (offline-capable)
  if (await isSherpaAvailable()) {
    return createSherpaSingleShotSTT(callbacks, options) // Sherpa uses single-shot for now
  }

  // Try to init Sherpa model if not yet loaded
  if (await initSherpaModel()) {
    return createSherpaSingleShotSTT(callbacks, options)
  }

  // Fallback to Web Speech API (requires network)
  if (isSTTAvailable()) {
    return createContinuousSTT(callbacks, options)
  }

  // Neither available
  return {
    start: () => { callbacks.onError?.('Aucun moteur STT disponible') },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}

/**
 * Synchronous check: is any STT engine available right now?
 * This checks Web Speech API availability (Sherpa may still be loading).
 */
export function isAnySTTAvailable(): boolean {
  return isSTTAvailable()
}
