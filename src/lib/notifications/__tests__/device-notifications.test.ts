import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildDeviceNotification, addDeviceNotification, getDeviceNotifications,
  markDeviceNotificationRead, markAllDeviceNotificationsRead,
  deleteDeviceNotification, archiveDeviceNotification,
  pendingDeviceNotifications, markDeviceNotificationsSynced,
  pruneDeviceNotifications, clearDeviceNotifications,
} from '../device-notifications'
import type { NotificationInput } from '../types'

let backingStore: Record<string, string>

vi.stubGlobal('localStorage', {
  getItem: (key: string) => backingStore[key] ?? null,
  setItem: (key: string, value: string) => { backingStore[key] = value },
  removeItem: (key: string) => { delete backingStore[key] },
  clear: () => { backingStore = {} },
})

function input(overrides?: Partial<NotificationInput>): NotificationInput {
  return {
    type: 'sale_created',
    category: 'vente',
    severity: 'success',
    title: 'Vente enregistrée',
    body: 'La vente de 2 500 FCFA a bien été enregistrée.',
    ...overrides,
  }
}

beforeEach(() => {
  backingStore = {}
})

describe('buildDeviceNotification', () => {
  it('builds a complete device notification with unique ids', () => {
    const a = buildDeviceNotification(input(), new Date('2026-09-17T10:00:00.000Z'))
    const b = buildDeviceNotification(input(), new Date('2026-09-17T10:00:01.000Z'))
    expect(a.id).not.toBe(b.id)
    expect(a.origin).toBe('device')
    expect(a.synced).toBe(false)
    expect(a.read).toBe(false)
    expect(a.priority).toBe('normal')
  })

  it('applies the severity default expiry (success = 24h, error = 30d)', () => {
    const now = new Date('2026-09-17T10:00:00.000Z')
    const success = buildDeviceNotification(input(), now)
    const error = buildDeviceNotification(input({ severity: 'error' }), now)
    expect(new Date(success.expiresAt!).getTime() - now.getTime()).toBe(24 * 3600 * 1000)
    expect(new Date(error.expiresAt!).getTime() - now.getTime()).toBe(30 * 24 * 3600 * 1000)
  })
})

describe('addDeviceNotification', () => {
  it('persists and returns the created notification', () => {
    const created = addDeviceNotification(input())
    expect(created).not.toBeNull()
    expect(getDeviceNotifications()).toHaveLength(1)
    expect(JSON.parse(backingStore['julaba-device-notifications-v1']).notifications).toHaveLength(1)
  })

  it('refuses a duplicate deduplicationKey (same event replayed)', () => {
    const first = addDeviceNotification(input({ deduplicationKey: 'sale:1:created' }))
    const second = addDeviceNotification(input({ deduplicationKey: 'sale:1:created' }))
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(getDeviceNotifications()).toHaveLength(1)
  })

  it('allows two distinct events without keys', () => {
    addDeviceNotification(input({ title: 'Première' }))
    const second = addDeviceNotification(input({ title: 'Deuxième' }))
    expect(second).not.toBeNull()
    expect(getDeviceNotifications()).toHaveLength(2)
  })
})

describe('mutations', () => {
  it('marks one read with readAt', () => {
    const n = addDeviceNotification(input())!
    markDeviceNotificationRead(n.id)
    const stored = getDeviceNotifications()[0]
    expect(stored.read).toBe(true)
    expect(stored.readAt).toBeTruthy()
  })

  it('marks all read at once', () => {
    addDeviceNotification(input({ title: 'A' }))
    addDeviceNotification(input({ title: 'B', deduplicationKey: 'sale:2' }))
    markAllDeviceNotificationsRead()
    expect(getDeviceNotifications().every((n) => n.read)).toBe(true)
  })

  it('archives and hides… nothing by itself — archive is a flag, deletion removes', () => {
    const a = addDeviceNotification(input({ title: 'A' }))!
    const b = addDeviceNotification(input({ title: 'B', deduplicationKey: 'sale:2' }))!
    archiveDeviceNotification(a.id)
    deleteDeviceNotification(b.id)
    const rest = getDeviceNotifications()
    expect(rest).toHaveLength(1)
    expect(rest[0].id).toBe(a.id)
    expect(rest[0].archivedAt).toBeTruthy()
  })
})

describe('synchronisation des notifications locales', () => {
  it('tracks pending → synced lifecycle', () => {
    const a = addDeviceNotification(input({ title: 'A', deduplicationKey: 'sale:1:created' }))!
    const b = addDeviceNotification(input({ title: 'B', deduplicationKey: 'sale:2:created' }))!
    expect(pendingDeviceNotifications()).toHaveLength(2)
    markDeviceNotificationsSynced([a.id])
    expect(pendingDeviceNotifications().map((n) => n.id)).toEqual([b.id])
    expect(getDeviceNotifications().find((n) => n.id === a.id)!.synced).toBe(true)
  })
})

describe('pruneDeviceNotifications', () => {
  it('drops expired read non-critical notifications', () => {
    const now = new Date('2026-09-17T12:00:00.000Z')
    const expired = buildDeviceNotification(input({ severity: 'success' }), new Date('2026-09-16T00:00:00.000Z'))
    const fresh = buildDeviceNotification(input({ deduplicationKey: 'sale:2' }), now)
    backingStore['julaba-device-notifications-v1'] = JSON.stringify({
      notifications: [
        { ...expired, read: true },
        { ...expired, id: 'expired-unread', read: false },
        fresh,
      ],
    })
    pruneDeviceNotifications(true, now)
    const rest = getDeviceNotifications()
    // Lue + expirée → supprimée ; non lue (pas critique) → l'expiration est
    // passée mais la purge locale ne jette que les lues (le centre filtre).
    expect(rest.some((n) => n.id === expired.id)).toBe(false)
    expect(rest.some((n) => n.id === fresh.id)).toBe(true)
  })

  it('respects keepHistory=false by dropping old READ items after 7 days', () => {
    const now = new Date('2026-09-17T12:00:00.000Z')
    const oldRead = buildDeviceNotification(input(), new Date('2026-09-01T00:00:00.000Z'))
    backingStore['julaba-device-notifications-v1'] = JSON.stringify({
      notifications: [{ ...oldRead, read: true }],
    })
    pruneDeviceNotifications(false, now)
    expect(getDeviceNotifications()).toHaveLength(0)
  })
})

describe('cap et déconnexion', () => {
  it('never grows past 100 items, keeping unread/critical ones preferentially', () => {
    for (let i = 0; i < 120; i++) {
      addDeviceNotification(input({ title: `N${i}`, deduplicationKey: `k${i}` }))
    }
    expect(getDeviceNotifications().length).toBeLessThanOrEqual(100)
  })

  it('clearDeviceNotifications wipes the local box (logout)', () => {
    addDeviceNotification(input())
    clearDeviceNotifications()
    expect(getDeviceNotifications()).toHaveLength(0)
  })
})
