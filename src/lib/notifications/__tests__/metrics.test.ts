import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  trackNotificationMetric, getNotificationMetrics, summarizeNotificationMetrics,
  categoryUsageMetrics,
} from '../metrics'

let backingStore: Record<string, string>

vi.stubGlobal('localStorage', {
  getItem: (key: string) => backingStore[key] ?? null,
  setItem: (key: string, value: string) => { backingStore[key] = value },
  removeItem: (key: string) => { delete backingStore[key] },
  clear: () => { backingStore = {} },
})

beforeEach(() => {
  backingStore = {}
})

describe('trackNotificationMetric', () => {
  it('records events with context and a timestamp', () => {
    trackNotificationMetric('created', { category: 'vente', severity: 'success' })
    const metrics = getNotificationMetrics()
    expect(metrics.entries).toHaveLength(1)
    expect(metrics.entries[0].event).toBe('created')
    expect(metrics.entries[0].category).toBe('vente')
    expect(metrics.entries[0].at).toBeTruthy()
  })

  it('caps the journal (no unbounded growth)', () => {
    for (let i = 0; i < 600; i++) trackNotificationMetric('displayed')
    expect(getNotificationMetrics().entries.length).toBeLessThanOrEqual(500)
  })
})

describe('summarizeNotificationMetrics', () => {
  it('computes read delay and open rate without storing any content', () => {
    const createdAt = '2026-09-17T10:00:00.000Z'
    trackNotificationMetric('created', { category: 'vente' })
    trackNotificationMetric('displayed', { category: 'vente' })
    // Lecture 60 s après création.
    vi.setSystemTime(new Date('2026-09-17T10:01:00.000Z'))
    trackNotificationMetric('read', { category: 'vente', createdAt })
    trackNotificationMetric('opened', { category: 'vente' })
    vi.useRealTimers?.()
    vi.setSystemTime(new Date('2026-09-17T10:02:00.000Z'))

    const summary = summarizeNotificationMetrics()
    expect(summary.created).toBe(1)
    expect(summary.read).toBe(1)
    expect(summary.opened).toBe(1)
    expect(summary.averageReadDelaySeconds).toBeCloseTo(60, 0)
    expect(summary.openRate).toBe(1)
    // PRIVA : aucune entrée ne stocke de titre, de corps ou d'identifiant.
    const raw = backingStore['julaba-notif-metrics-v1']
    expect(raw).not.toContain('Vente')
    expect(raw).not.toContain('sale-42')
    expect(raw).not.toContain('pin')
  })
})

describe('categoryUsageMetrics', () => {
  it('ranks categories by openings', () => {
    trackNotificationMetric('opened', { category: 'stock' })
    trackNotificationMetric('opened', { category: 'stock' })
    trackNotificationMetric('opened', { category: 'vente' })
    trackNotificationMetric('read', { category: 'stock' })
    const usage = categoryUsageMetrics()
    expect(usage[0].category).toBe('stock')
    expect(usage[0].opened).toBe(2)
    expect(usage[0].read).toBe(1)
  })
})
