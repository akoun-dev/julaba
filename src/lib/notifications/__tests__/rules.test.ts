import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isExpired, deduplicationKeyOf, isDuplicateNotification, mergeNotifications,
  sortForDisplay, isCritical, effectiveCategoryPref, shouldDisplayNotification,
  toastDurationFor, filterNotifications, groupNotificationsByDate,
  groupSimilarNotifications, groupLabel, withDefaultExpiry,
} from '../rules'
import type { InAppNotification, NotificationPrefs } from '../types'

// Fabrique une notification complète avec uniquement les champs qui varient.
function notif(overrides: Partial<InAppNotification> & { id: string }): InAppNotification {
  return {
    type: 'sale_created',
    category: 'vente',
    severity: 'success',
    priority: 'normal',
    title: 'Vente enregistrée',
    body: 'La vente a bien été enregistrée.',
    data: null,
    read: false,
    createdAt: '2026-09-17T10:00:00.000Z',
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    deduplicationKey: null,
    actionLabel: null,
    actionRoute: null,
    actionData: null,
    metadata: null,
    origin: 'server',
    ...overrides,
  }
}

function defaultPrefs(): NotificationPrefs {
  const categories = {} as NotificationPrefs['categories']
  for (const key of ['vente', 'caisse', 'stock', 'depense', 'commande', 'tontine', 'keiwa', 'production', 'formation', 'synchronisation', 'securite', 'systeme'] as const) {
    categories[key] = 'on'
  }
  return { categories, toastsEnabled: true, keepHistory: true, silentUntil: null }
}

describe('isExpired', () => {
  const now = new Date('2026-09-17T12:00:00.000Z')

  it('is false without expiresAt', () => {
    expect(isExpired(notif({ id: 'a' }), now)).toBe(false)
  })

  it('is true past the expiry date', () => {
    expect(isExpired(notif({ id: 'a', expiresAt: '2026-09-17T11:59:59.000Z' }), now)).toBe(true)
  })

  it('is false before the expiry date', () => {
    expect(isExpired(notif({ id: 'a', expiresAt: '2026-09-17T12:00:01.000Z' }), now)).toBe(false)
  })

  it('never expires an UNREAD critical notification before it is read', () => {
    const n = notif({ id: 'a', priority: 'critical', read: false, expiresAt: '2026-09-17T11:00:00.000Z' })
    expect(isExpired(n, now)).toBe(false)
  })

  it('expires a critical notification once it has been read', () => {
    const n = notif({ id: 'a', priority: 'critical', read: true, expiresAt: '2026-09-17T11:00:00.000Z' })
    expect(isExpired(n, now)).toBe(true)
  })

  it('never expires an unread security notification', () => {
    const n = notif({ id: 'a', category: 'securite', read: false, expiresAt: '2026-09-17T11:00:00.000Z' })
    expect(isExpired(n, now)).toBe(false)
  })
})

describe('withDefaultExpiry', () => {
  it('keeps an explicitly provided expiry', () => {
    const input = { type: 'x', category: 'vente' as const, severity: 'info' as const, title: 'T', body: 'B', expiresAt: '2030-01-01T00:00:00.000Z' }
    expect(withDefaultExpiry(input, new Date('2026-01-01')).expiresAt).toBe('2030-01-01T00:00:00.000Z')
  })

  it('gives success a short 24h expiry and security a 90-day one', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const success = withDefaultExpiry({ type: 'x', category: 'vente', severity: 'success', title: 'T', body: 'B' }, now)
    const security = withDefaultExpiry({ type: 'x', category: 'securite', severity: 'info', title: 'T', body: 'B' }, now)
    expect(new Date(success.expiresAt!).getTime() - now.getTime()).toBe(24 * 3600 * 1000)
    expect(new Date(security.expiresAt!).getTime() - now.getTime()).toBe(90 * 24 * 3600 * 1000)
  })
})

describe('déduplication', () => {
  it('dedups on a stable deduplicationKey', () => {
    const a = { deduplicationKey: 'sale:1:created', type: 'x', title: 'T', createdAt: '2026-09-17T10:00:00.000Z' }
    const b = { deduplicationKey: 'sale:1:created', type: 'y', title: 'Other', createdAt: '2026-09-17T11:00:00.000Z' }
    expect(isDuplicateNotification(b, [a])).toBe(true)
  })

  it('does not dedup different sale ids', () => {
    const a = { deduplicationKey: 'sale:1:created', type: 'x', title: 'T', createdAt: '2026-09-17T10:00:00.000Z' }
    const b = { deduplicationKey: 'sale:2:created', type: 'x', title: 'T', createdAt: '2026-09-17T10:00:00.000Z' }
    expect(isDuplicateNotification(b, [a])).toBe(false)
  })

  it('falls back to type|title|second for legacy rows without a key', () => {
    const a = { deduplicationKey: null, type: 'x', title: 'T', createdAt: '2026-09-17T10:00:00.123Z' }
    const b = { deduplicationKey: null, type: 'x', title: 'T', createdAt: '2026-09-17T10:00:00.999Z' }
    expect(deduplicationKeyOf(b)).toBe(deduplicationKeyOf(a))
    expect(isDuplicateNotification(b, [a])).toBe(true)
  })

  it('mergeNotifications prefers the server row and keeps device-only ones', () => {
    const server = [notif({ id: 's1', deduplicationKey: 'sale:1:created', title: 'Du serveur' })]
    const device = [
      notif({ id: 'd1', deduplicationKey: 'sale:1:created', title: 'Du device', origin: 'device' }),
      notif({ id: 'd2', deduplicationKey: 'stock:3:low', title: 'Stock local', origin: 'device', category: 'stock' }),
    ]
    const merged = mergeNotifications(server, device)
    expect(merged).toHaveLength(2)
    expect(merged[0].title).toBe('Du serveur')
    expect(merged[1].title).toBe('Stock local')
  })
})

describe('tri et priorités', () => {
  it('sorts critical first regardless of date, then newest first', () => {
    const list = [
      notif({ id: 'normal-recent', createdAt: '2026-09-17T11:00:00.000Z' }),
      notif({ id: 'critical-old', priority: 'critical', createdAt: '2026-09-17T09:00:00.000Z' }),
      notif({ id: 'normal-older', createdAt: '2026-09-17T10:00:00.000Z' }),
    ]
    expect(sortForDisplay(list).map((n) => n.id)).toEqual(['critical-old', 'normal-recent', 'normal-older'])
  })

  it('flags critical priorities and security errors as critical', () => {
    expect(isCritical(notif({ id: 'a', priority: 'critical' }))).toBe(true)
    expect(isCritical(notif({ id: 'b', category: 'securite', severity: 'error' }))).toBe(true)
    expect(isCritical(notif({ id: 'c', severity: 'warning' }))).toBe(false)
  })
})

describe('shouldDisplayNotification (préférences)', () => {
  it('hides a category set to off', () => {
    const prefs = defaultPrefs()
    prefs.categories.stock = 'off'
    expect(shouldDisplayNotification({ category: 'stock', severity: 'info', priority: 'normal' }, prefs)).toBe(false)
    expect(shouldDisplayNotification({ category: 'vente', severity: 'info', priority: 'normal' }, prefs)).toBe(true)
  })

  it('with "important" keeps only high priority and errors', () => {
    const prefs = defaultPrefs()
    prefs.categories.vente = 'important'
    expect(shouldDisplayNotification({ category: 'vente', severity: 'success', priority: 'normal' }, prefs)).toBe(false)
    expect(shouldDisplayNotification({ category: 'vente', severity: 'error', priority: 'low' }, prefs)).toBe(true)
    expect(shouldDisplayNotification({ category: 'vente', severity: 'info', priority: 'high' }, prefs)).toBe(true)
  })

  it('never lets security go fully silent — off degrades to important', () => {
    const prefs = defaultPrefs()
    prefs.categories.securite = 'off'
    expect(effectiveCategoryPref(prefs, 'securite')).toBe('important')
    expect(shouldDisplayNotification({ category: 'securite', severity: 'error', priority: 'high' }, prefs)).toBe(true)
    expect(shouldDisplayNotification({ category: 'securite', severity: 'info', priority: 'low' }, prefs)).toBe(false)
  })

  it('always shows critical notifications even in a muted category', () => {
    const prefs = defaultPrefs()
    prefs.categories.vente = 'off'
    expect(shouldDisplayNotification({ category: 'vente', severity: 'error', priority: 'critical' }, prefs)).toBe(true)
  })

  it('silences toasts during silent mode but keeps the center — criticals pass anyway', () => {
    const prefs = defaultPrefs()
    prefs.silentUntil = '2099-01-01T00:00:00.000Z'
    expect(shouldDisplayNotification({ category: 'vente', severity: 'success', priority: 'normal' }, prefs, { forToast: true })).toBe(false)
    expect(shouldDisplayNotification({ category: 'vente', severity: 'success', priority: 'normal' }, prefs, { forToast: false })).toBe(true)
    expect(shouldDisplayNotification({ category: 'vente', severity: 'error', priority: 'critical' }, prefs, { forToast: true })).toBe(true)
  })
})

describe('toastDurationFor', () => {
  it('is longer for errors than successes and infinite for criticals', () => {
    expect(toastDurationFor({ severity: 'error', priority: 'normal' })).toBeGreaterThan(toastDurationFor({ severity: 'success', priority: 'normal' }))
    expect(toastDurationFor({ severity: 'error', priority: 'critical' })).toBe(Infinity)
  })
})

describe('filtrage du centre', () => {
  const now = new Date('2026-09-17T12:00:00.000Z')
  const list = [
    notif({ id: '1', category: 'vente', read: false }),
    notif({ id: '2', category: 'stock', read: true }),
    notif({ id: '3', category: 'vente', read: true }),
    notif({ id: '4', category: 'caisse', read: false, archivedAt: now.toISOString() }),
    notif({ id: '5', category: 'caisse', read: false, expiresAt: '2026-09-17T11:00:00.000Z' }),
  ]

  it('filters by category', () => {
    expect(filterNotifications(list, 'vente', undefined).map((n) => n.id)).toEqual(['1', '3'])
  })

  it('filters unread only', () => {
    expect(filterNotifications(list, 'unread', undefined).map((n) => n.id)).toEqual(['1'])
  })

  it('excludes archived and expired rows in every filter', () => {
    expect(filterNotifications(list, 'all', undefined).map((n) => n.id).sort()).toEqual(['1', '2', '3'])
  })
})

describe('regroupement', () => {
  const now = new Date('2026-09-17T15:00:00.000Z')

  it('groups by Aujourd hui / Hier / date lisible', () => {
    const list = [
      notif({ id: 'today', createdAt: '2026-09-17T09:00:00.000Z' }),
      notif({ id: 'yesterday', createdAt: '2026-09-16T09:00:00.000Z' }),
      notif({ id: 'older', createdAt: '2026-09-10T09:00:00.000Z' }),
    ]
    const groups = groupNotificationsByDate(list, now)
    expect(groups.map((g) => g.label)).toEqual(['Aujourd\u2019hui', 'Hier', '10 septembre'])
  })

  it('groups similar stock-low events with a plural title but never criticals', () => {
    const list = [
      notif({ id: 's1', category: 'stock', severity: 'warning', deduplicationKey: 'stock:1:low:2026-09-17', title: 'Stock faible', metadata: { groupTitlePlural: '{count} produits ont atteint le seuil de stock faible' } }),
      notif({ id: 's2', category: 'stock', severity: 'warning', deduplicationKey: 'stock:2:low:2026-09-17', title: 'Stock faible', metadata: { groupTitlePlural: '{count} produits ont atteint le seuil de stock faible' } }),
      notif({ id: 's3', category: 'stock', severity: 'warning', deduplicationKey: 'stock:3:low:2026-09-17', title: 'Stock faible', metadata: { groupTitlePlural: '{count} produits ont atteint le seuil de stock faible' } }),
      notif({ id: 'crit1', category: 'securite', severity: 'error', priority: 'critical', deduplicationKey: 'sec:1' }),
      notif({ id: 'crit2', category: 'securite', severity: 'error', priority: 'critical', deduplicationKey: 'sec:2' }),
    ]
    const grouped = groupSimilarNotifications(list)
    expect(grouped).toHaveLength(3) // 1 groupe stock + 2 critiques non fusionnées
    const stockGroup = grouped.find((g) => g.representative.category === 'stock')!
    expect(stockGroup.count).toBe(3)
    expect(groupLabel(stockGroup)).toBe('3 produits ont atteint le seuil de stock faible')
  })

  it('shows the plain title for a single item', () => {
    const [single] = groupSimilarNotifications([notif({ id: 'x' })])
    expect(groupLabel(single)).toBe('Vente enregistrée')
  })
})
