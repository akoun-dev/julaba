import { WebPlugin } from '@capacitor/core'

import type {
  VoiceEngineStatus,
  VoiceInitializeOptions,
  VoiceModelAvailability,
  VoiceServicePlugin,
  VoiceStartRecordingOptions,
  VoiceStopRecordingResult,
  VoiceRecognitionResult,
  VoiceTranscribeOptions,
} from './definitions'

/**
 * Implémentation web du plugin VoiceService — aucune reconnaissance
 * vocale native n'existe dans un navigateur : le VoiceService n'a de sens
 * que sur la coque native Android (voir VoiceServicePlugin.java).
 *
 * Comportement volontairement doux :
 *   - initialize()/isReady() résolvent avec ready:false (permet aux écrans
 *     de statut de sonder le plugin sans try/catch) ;
 *   - toute autre méthode rejette avec `unavailable()` (message explicite)
 *     afin que la couche haut niveau src/lib/voice/voice-service.ts bascule
 *     proprement vers son fallback Web Speech.
 */
export class VoiceServiceWeb extends WebPlugin implements VoiceServicePlugin {
  private readonly unavailableMessage =
    'VoiceService requiert la coque native Android (plugin local VoiceServicePlugin)'

  async initialize(_options?: VoiceInitializeOptions): Promise<VoiceEngineStatus & { initialized: boolean }> {
    return { ready: false, language: null, engine: null, initialized: false }
  }

  async isReady(): Promise<VoiceEngineStatus> {
    return { ready: false, language: null, engine: null }
  }

  async isModelAvailable(_options?: { language?: string }): Promise<VoiceModelAvailability> {
    // Sonde douce (comme isReady) : aucun modèle STT natif n'existe dans un
    // navigateur — available:false honnête, sans throw.
    return { available: false, source: 'none' }
  }

  async startRecording(_options?: VoiceStartRecordingOptions): Promise<{ started: boolean; maxDurationMs: number }> {
    throw this.unavailable(this.unavailableMessage)
  }

  async stopRecording(): Promise<VoiceStopRecordingResult> {
    throw this.unavailable(this.unavailableMessage)
  }

  async transcribe(_options?: VoiceTranscribeOptions): Promise<VoiceRecognitionResult> {
    throw this.unavailable(this.unavailableMessage)
  }

  async release(): Promise<{ released: boolean }> {
    return { released: true }
  }
}
