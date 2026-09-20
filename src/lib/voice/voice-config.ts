/** Runtime voice policy shared by STT, TTS and audio post-processing. */
export const VOICE_CONFIG = {
  tts: {
    defaultRate: 0.9,
    minRate: 0.75,
    maxRate: 1.15,
    defaultVolume: 85,
    minVolume: 0,
    maxVolume: 100,
    defaultPitch: 1,
  },
  speech: {
    pauseMs: 220,
    minPauseMs: 120,
    maxPauseMs: 450,
    trimThresholdRatio: 0.02,
    trimMarginMs: 50,
    trimWindowMs: 5,
    peakTarget: 0.82,
    maxNormalizeGain: 6,
    fadeInMs: 12,
    fadeOutMs: 30,
  },
  synthesis: {
    timeoutBaseMs: 15_000,
    timeoutPerCharMs: 60,
    timeoutCapMs: 60_000,
  },
  stt: {
    maxDurationMs: 30_000,
    minConfidenceForAction: 0.72,
    minConfidenceForConfirmation: 0.55,
  },
} as const

export function clampVoiceRate(value: number): number {
  return Math.max(VOICE_CONFIG.tts.minRate, Math.min(VOICE_CONFIG.tts.maxRate, value))
}

export function clampVoiceVolume(value: number): number {
  return Math.max(VOICE_CONFIG.tts.minVolume, Math.min(VOICE_CONFIG.tts.maxVolume, value))
}

export function clampSpeechPause(value: number): number {
  return Math.max(VOICE_CONFIG.speech.minPauseMs, Math.min(VOICE_CONFIG.speech.maxPauseMs, value))
}

export function synthesisTimeoutMs(textLength: number): number {
  return Math.min(
    VOICE_CONFIG.synthesis.timeoutCapMs,
    VOICE_CONFIG.synthesis.timeoutBaseMs + Math.max(0, textLength) * VOICE_CONFIG.synthesis.timeoutPerCharMs,
  )
}
