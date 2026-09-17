import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mapServerRow, isDuplicateNotification, mergeNotifications, fetchNotificationFeed,
  type ServerNotificationRow,
} from '../client'
import type { InAppNotification } from '../types'

// Tests du service client : mapping DB→app, dédup et merge, et le chemin
// hors ligne (fetch échoué → le feed tombe back sur les notifications
// locales sans crash).

let backingStore: Record<string, string>

vi.stubGlobal('localStorage', {
  getItem: (key: string) => backingStore[key] ?? null,
  setItem: (key: string, value: string) => { backingStore[key] = value },
  removeItem: (key: string) => { delete backingStore[key] },
  clear: () => { backingStore = {} },
})

// Les préférences lisent l'app-store — simulé (rôle marchand, phone connu).
vi.mock('@/lib/stores/app-store', () => ({
  useAppStore: {
    getState: () => ({
      userRole: 'marchand',
      merchantPhone: '0701020304',
      merchantId: 'm1',
      isAuthenticated: true,
    }),
  },
}))

function row(overrides: Partial<ServerNotificationRow>): ServerNotificationRow {
  return {
    id: 'srv-1',
    type: 'bienvenue',
    title: 'Bienvenue sur Jùlaba',
    body: 'Votre compte est prêt.',
    data: null,
    read: false,
    created_at: '2026-09-17T09:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  backingStore = {}
})

describe('mapServerRow', () => {
  it('maps the enriched row with defaults for unknown severities', () => {
    const n = mapServerRow(row({
      category: 'vente',
      severity: 'success',
      priority: 'high',
      deduplication_key: 'sale:1:created',
      action_label: 'Voir la vente',
      action_route: 'ventes',
      expires_at: '2026-10-17T09:00:00.000Z',
    }))
    expect(n.category).toBe('vente')
    expect(n.severity).toBe('success')
    expect(n.priority).toBe('high')
    expect(n.deduplicationKey).toBe('sale:1:created')
    expect(n.actionLabel).toBe('Voir la vente')
    expect(n.origin).toBe('server')
  })

  it('falls back to info/normal/systeme for legacy rows (no new columns)', () => {
    const n = mapServerRow(row({}))
    expect(n.category).toBe('systeme')
    expect(n.severity).toBe('info')
    expect(n.priority).toBe('normal')
  })
})

describe('feed hors ligne', () => {
  it('falls back to device notifications when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network Error') }))
    // Ajoute une notification locale via le module device (localStorage).
    const { buildDeviceNotification } = await import('../device-notifications')
    const local = buildDeviceNotification({
      type: 'sale_created', category: 'vente', severity: 'warning',
      title: 'Vente enregistrée hors ligne',
      body: 'La vente sera envoyée dès le retour de la connexion.',
      deduplicationKey: 'sale:9:queued',
    })
    backingStore['julaba-device-notifications-v1'] = JSON.stringify({ notifications: [local] })

    await expect(fetchNotificationFeed()).rejects.toThrow('Network Error')
    // Le service jette (le store affiche l'état d'erreur) mais les données
    // locales sont intactes — rien n'est perdu à la fermeture de l'app.
    expect(backingStore['julaba-device-notifications-v1']).toContain('Vente enregistrée hors ligne')
  })

  it('merges a server fetch with device-only notifications without duplicates', async () => {
    const { buildDeviceNotification, addDeviceNotification } = await import('../device-notifications')
    const serverRow = mapServerRow(row({ id: 'srv-1', deduplication_key: 'sale:1:created' }))
    const deviceCopy = buildDeviceNotification({
      type: 'bienvenue', category: 'securite', severity: 'info',
      title: 'Bienvenue sur Jùlaba', body: 'Votre compte est prêt.',
      deduplicationKey: 'sale:1:created',
    })
    const deviceOnly = buildDeviceNotification({
      type: 'stock_low', category: 'stock', severity: 'warning',
      title: 'Stock faible', body: 'Il reste 3 tomates.',
      deduplicationKey: 'stock:3:low',
    })
    void serverRow
    addDeviceNotification({ ...deviceCopy, id: undefined } as never) // via la vraie API
    addDeviceNotification({ ...deviceOnly, id: undefined } as never)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ notifications: [row({ id: 'srv-1', deduplication_key: 'sale:1:created' })], unreadCount: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    const feed = await fetchNotificationFeed()
    const merged: InAppNotification[] = mergeNotifications(feed.server, feed.device)
    const titles = merged.map((n) => n.title)
    expect(titles.filter((t) => t === 'Bienvenue sur Jùlaba')).toHaveLength(1) // dédup
    expect(titles).toContain('Stock faible') // device-only conservé
    expect(feed.unreadCount).toBe(1)
  })

  it('still detects duplicates across server and device rows', () => {
    const a = mapServerRow(row({ deduplication_key: 'sale:1:created' }))
    const b = { deduplicationKey: 'sale:1:created', type: 'x', title: 'y', createdAt: '2026-09-17T10:00:00.000Z' }
    expect(isDuplicateNotification(b, [a])).toBe(true)
  })
})
