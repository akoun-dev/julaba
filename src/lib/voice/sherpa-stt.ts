import { registerPlugin } from '@capacitor/core'

/**
 * Bridge to the native SherpaStt plugin (Android: SherpaSttPlugin.java,
 * iOS: SherpaSttPlugin.swift — a local plugin, not an npm package, see
 * those files for why). Fully offline speech-to-text as required by the
 * Jùlaba spec, distinct from src/lib/voice/stt.ts's Web Speech API wrapper,
 * which works inside the WebView but needs a network round-trip and isn't
 * available at all in some native WebView configurations.
 *
 * The intended call sequence is:
 *   const { available } = await SherpaStt.isAvailable()
 *   if (available) {
 *     await SherpaStt.initModel({ modelPath: '...' })
 *     await SherpaStt.startRecognition()
 *     // ...listen for 'sttResult' events via addListener...
 *     await SherpaStt.stopRecognition()
 *   }
 */
export interface SherpaSttPlugin {
  isAvailable(): Promise<{ available: boolean; modelLoaded: boolean }>
  initModel(options: { modelPath: string }): Promise<void>
  startRecognition(): Promise<void>
  stopRecognition(): Promise<void>
  addListener(event: 'sttResult', handler: (data: { transcript: string; isFinal: boolean }) => void): Promise<import('@capacitor/core').PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const SherpaStt = registerPlugin<SherpaSttPlugin>('SherpaStt')
