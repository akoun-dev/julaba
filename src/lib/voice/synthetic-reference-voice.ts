import type { VoiceContext } from './voice-pack'

/**
 * Non-personal synthetic reference profile.
 * This is a product preset, not a cloned or validated human Ivorian voice.
 */
export const SYNTHETIC_REFERENCE_VOICE = {
  id: 'fr-ci-synthetic-reference-v1',
  label: 'Voix française ivoirienne de référence (synthétique)',
  locale: 'fr-CI',
  engine: 'system-french-tts',
  attribution: 'Voix synthétique non attribuée à une personne réelle',
  status: 'prototype' as const,
  prosody: {
    defaultRate: 0.92,
    defaultPitch: 1.05,
    defaultVolume: 1,
  },
} as const

export type SyntheticReferenceProsody = {
  rate: number
  pitch: number
  pauseScale: number
}

export function getSyntheticReferenceProsody(
  context: VoiceContext,
  requestedRate?: number,
): SyntheticReferenceProsody {
  const base = requestedRate ?? SYNTHETIC_REFERENCE_VOICE.prosody.defaultRate
  if (context === 'sale_confirmation' || context === 'payment_confirmation' || context === 'credit_balance' || context === 'refund' || context === 'stock_quantity' || context === 'identity_data' || context === 'security_code') {
    return { rate: Math.min(base, 0.86), pitch: 1.02, pauseScale: 1.2 }
  }
  if (context === 'greeting') return { rate: Math.min(base, 0.94), pitch: 1.07, pauseScale: 1.05 }
  if (context === 'encouragement' || context === 'success_non_financial') return { rate: Math.max(base, 0.94), pitch: 1.08, pauseScale: 0.95 }
  return { rate: base, pitch: SYNTHETIC_REFERENCE_VOICE.prosody.defaultPitch, pauseScale: 1 }
}
