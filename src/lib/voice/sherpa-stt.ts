import { registerPlugin } from '@capacitor/core'

/**
 * Bridge to the native SherpaStt plugin (Android: SherpaSttPlugin.java,
 * iOS: SherpaSttPlugin.swift — a local plugin, not an npm package, see
 * those files for why). Fully offline speech-to-text as required by the
 * Jùlaba spec, distinct from src/lib/voice/stt.ts's Web Speech API wrapper,
 * which works inside the WebView but needs a network round-trip and isn't
 * available at all in some native WebView configurations.
 *
 * See SHERPA_ONNX.md (repo root) for exactly what's still missing to make
 * this real: the native dependency, model, audio capture loop, and event
 * wiring this interface doesn't have yet (e.g. no addListener('sttResult')
 * below — the plugin can't stream results back without it).
 *
 * NOT FUNCTIONAL YET: isAvailable() always resolves { available: false }
 * until the native sherpa-onnx integration (JNI bindings + bundled model)
 * is completed — see the native plugin files for the exact TODOs. Calling
 * initModel/startRecognition/stopRecognition before that rejects.
 *
 * Once the native side is real, the intended call sequence is:
 *   const { available } = await SherpaStt.isAvailable()
 *   if (available) {
 *     await SherpaStt.initModel({ modelPath: '...' })
 *     await SherpaStt.startRecognition()
 *     // ...listen for 'sttResult' events...
 *     await SherpaStt.stopRecognition()
 *   }
 */
export interface SherpaSttPlugin {
  isAvailable(): Promise<{ available: boolean; modelLoaded: boolean }>
  initModel(options: { modelPath: string }): Promise<void>
  startRecognition(): Promise<void>
  stopRecognition(): Promise<void>
}

export const SherpaStt = registerPlugin<SherpaSttPlugin>('SherpaStt')
