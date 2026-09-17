import { describe, expect, it } from 'vitest'
import {
  CRITICAL_CHANNEL_ID,
  IMPORTANT_CHANNEL_ID,
  INFO_CHANNEL_ID,
  NOTIFICATION_CHANNELS,
  channelIdFor,
} from '../channels'

describe('canaux de notification Android', () => {
  it('expose exactement les 3 canaux avec des ids uniques et des noms FR', () => {
    expect(NOTIFICATION_CHANNELS).toHaveLength(3)
    const ids = NOTIFICATION_CHANNELS.map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual([CRITICAL_CHANNEL_ID, IMPORTANT_CHANNEL_ID, INFO_CHANNEL_ID])
    for (const channel of NOTIFICATION_CHANNELS) {
      expect(channel.name.trim()).not.toBe('')
      expect(channel.description.trim()).not.toBe('')
    }
  })

  it('ordonne l\u2019importance : critique > important > info', () => {
    const byId = new Map(NOTIFICATION_CHANNELS.map((c) => [c.id, c]))
    expect(byId.get(CRITICAL_CHANNEL_ID)!.importance).toBe(4) // heads-up
    expect(byId.get(IMPORTANT_CHANNEL_ID)!.importance).toBe(3) // son
    expect(byId.get(INFO_CHANNEL_ID)!.importance).toBe(2) // silencieux
    expect(byId.get(CRITICAL_CHANNEL_ID)!.vibration).toBe(true)
    expect(byId.get(INFO_CHANNEL_ID)!.vibration).toBe(false)
  })

  it('route erreur et priorité critique vers le canal critique', () => {
    expect(channelIdFor('error')).toBe(CRITICAL_CHANNEL_ID)
    expect(channelIdFor('info', 'critical')).toBe(CRITICAL_CHANNEL_ID)
    expect(channelIdFor('warning', 'critical')).toBe(CRITICAL_CHANNEL_ID)
  })

  it('route avertissements et rappels vers le canal important', () => {
    expect(channelIdFor('warning')).toBe(IMPORTANT_CHANNEL_ID)
    expect(channelIdFor('reminder')).toBe(IMPORTANT_CHANNEL_ID)
  })

  it('route succès et infos vers le canal info', () => {
    expect(channelIdFor('info')).toBe(INFO_CHANNEL_ID)
    expect(channelIdFor('success')).toBe(INFO_CHANNEL_ID)
  })
})
