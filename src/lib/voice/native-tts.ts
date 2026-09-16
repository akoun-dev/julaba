import { registerPlugin, Capacitor } from '@capacitor/core'

/**
 * Bridge to the native TataTts plugin (Android: TataTtsPlugin.java wrapping
 * android.speech.tts.TextToSpeech, iOS: TataTtsPlugin.swift wrapping
 * AVSpeechSynthesizer — a local plugin, not an npm package, see those files).
 *
 * WHY THIS EXISTS: the Android WebView does not implement the Web Speech API
 * (speechSynthesis), so every tataSpeak() in the native app was a silent
 * no-op — the exact complaint "on n'entend pas la voix du onboarding à la
 * navigation marchand". The STT side already solved the same WebView
 * limitation with a native bridge (SherpaSttPlugin); this is the output
 * counterpart. The system TTS engine ships with French on virtually all
 * Android devices and works fully offline.
 *
 * Contract: speak() resolves exactly once per utterance — { spoken: true }
 * when the system engine finished speaking, { spoken: false } when it
 * failed/was interrupted. This maps 1:1 to tataSpeak's single 'done'/'error'
 * callback (see tata-tts.ts).
 */
export interface TataTtsPluginInterface {
  isAvailable(): Promise<{ available: boolean; ready: boolean }>
  speak(options: {
    text: string
    rate?: number
    volume?: number
    pitch?: number
  }): Promise<{ spoken: boolean; reason?: string }>
  stop(): Promise<void>
}

export const TataTts = registerPlugin<TataTtsPluginInterface>('TataTts')

/** True only inside the native shell (Android/iOS), where the system TTS
 * engine is the only reliable output. Never true in a plain browser. */
export function isNativeTtsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
