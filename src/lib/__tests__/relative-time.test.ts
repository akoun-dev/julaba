import { describe, expect, it } from 'vitest'
import { dayGroupOf, formatAbsoluteShort, formatRelativeTime } from '@/lib/relative-time'

// Référence fixe : mercredi 17 septembre 2026, 14:30 locale.
const NOW = new Date(2026, 8, 17, 14, 30, 0).getTime()

describe('formatRelativeTime', () => {
  it('rend « à l’instant » sous une minute', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('à l’instant')
  })

  it('rend les minutes (« il y a 12 min »)', () => {
    expect(formatRelativeTime(NOW - 12 * 60_000, NOW)).toBe('il y a 12 min')
  })

  it('rend les heures du même jour (« il y a 3 h »)', () => {
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe('il y a 3 h')
  })

  it('rend « hier à HH:MM »', () => {
    expect(formatRelativeTime(new Date(2026, 8, 16, 10, 45).getTime(), NOW)).toBe('hier à 10:45')
  })

  it('rend les jours (« il y a 4 j »)', () => {
    expect(formatRelativeTime(NOW - 4 * 24 * 60 * 60_000, NOW)).toBe('il y a 4 j')
  })

  it('rend la date courte au-delà d’une semaine', () => {
    expect(formatRelativeTime(new Date(2026, 8, 5, 8, 0).getTime(), NOW)).toBe('5 sept.')
  })

  it('tolère un timestamp absent', () => {
    expect(formatRelativeTime(undefined, NOW)).toBe('')
  })
})

describe('dayGroupOf', () => {
  it('classe aujourd’hui', () => {
    expect(dayGroupOf(NOW - 60_000, NOW)?.key).toBe('today')
    expect(dayGroupOf(NOW - 60_000, NOW)?.label).toBe('AUJOURD’HUI')
  })

  it('classe hier', () => {
    const hier = new Date(2026, 8, 16, 9, 0).getTime()
    expect(dayGroupOf(hier, NOW)?.key).toBe('yesterday')
    expect(dayGroupOf(hier, NOW)?.label).toBe('HIER')
  })

  it('formate les jours plus anciens (jeudi 10 sept. 2026 → « JEU. 10 SEPT. »)', () => {
    const older = new Date(2026, 8, 10, 9, 0).getTime()
    expect(dayGroupOf(older, NOW)).toEqual({ key: 'older', label: 'JEU. 10 SEPT.' })
  })

  it('rend null sans timestamp', () => {
    expect(dayGroupOf(undefined, NOW)).toBeNull()
  })
})

describe('formatAbsoluteShort', () => {
  it('formate « 16 sept. à 10:14 »', () => {
    expect(formatAbsoluteShort(new Date(2026, 8, 16, 10, 14).getTime())).toBe('16 sept. à 10:14')
  })

  it('rend chaîne vide sans timestamp', () => {
    expect(formatAbsoluteShort(undefined)).toBe('')
  })
})
