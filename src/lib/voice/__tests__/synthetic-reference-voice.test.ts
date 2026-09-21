import { describe, expect, it } from 'vitest'
import {
  getSyntheticReferenceProsody,
  SYNTHETIC_REFERENCE_VOICE,
} from '../synthetic-reference-voice'

describe('synthetic reference voice', () => {
  it('is explicitly a non-personal prototype', () => {
    expect(SYNTHETIC_REFERENCE_VOICE.status).toBe('prototype')
    expect(SYNTHETIC_REFERENCE_VOICE.attribution).toContain('non attribuée')
  })

  it('slows and lowers sensitive confirmations for clarity', () => {
    const prosody = getSyntheticReferenceProsody('payment_confirmation', 1)
    expect(prosody.rate).toBeLessThanOrEqual(0.86)
    expect(prosody.pauseScale).toBeGreaterThan(1)
  })

  it('keeps encouragement warmer and more energetic', () => {
    const prosody = getSyntheticReferenceProsody('encouragement', 0.9)
    expect(prosody.rate).toBeGreaterThanOrEqual(0.94)
    expect(prosody.pitch).toBeGreaterThan(1)
  })
})
