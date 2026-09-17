import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushNotificationSchema } from '@capacitor/push-notifications'

// Pont natif entièrement simulé — les deux plugins n'existent pas sous Node.
const { fetchNotificationsMock } = vi.hoisted(() => ({ fetchNotificationsMock: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
  },
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(async () => {}),
    addListener: vi.fn(),
  },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: vi.fn(async () => {}),
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    addListener: vi.fn(),
  },
}))

vi.mock('../toast', () => ({
  showNotificationToast: vi.fn(() => true),
  executeNotificationAction: vi.fn(async () => {}),
}))

vi.mock('@/lib/stores/notifications-store', () => ({
  useNotificationsStore: { getState: () => ({ fetchNotifications: fetchNotificationsMock }) },
}))

import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { executeNotificationAction, showNotificationToast } from '../toast'
import {
  handleNotificationTap,
  handlePushReceived,
  initNativeNotifications,
  mapPushPayload,
  registerPushToken,
  syncPendingPushToken,
} from '../native'

const checkPermissionsMock = vi.mocked(PushNotifications.checkPermissions)
const requestPermissionsMock = vi.mocked(PushNotifications.requestPermissions)
const registerMock = vi.mocked(PushNotifications.register)
const pushAddListenerMock = vi.mocked(PushNotifications.addListener)
const localAddListenerMock = vi.mocked(LocalNotifications.addListener)
const createChannelMock = vi.mocked(LocalNotifications.createChannel)
const toastMock = vi.mocked(showNotificationToast)
const actionMock = vi.mocked(executeNotificationAction)

const store = new Map<string, string>()
const fetchMock = vi.fn()
const pushListeners = new Map<string, (payload: never) => void>()
const localListeners = new Map<string, (payload: never) => void>()

function stubGlobals(): void {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('fetch', fetchMock)
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  store.clear()
  pushListeners.clear()
  localListeners.clear()
  fetchMock.mockReset()
  fetchNotificationsMock.mockClear()
  stubGlobals()

  // Les mocks sont déclarés une fois par module : réinitialise TOUT le
  // comptage entre les tests (sinon un appel du test précédent « fuite »).
  createChannelMock.mockClear()
  pushAddListenerMock.mockClear()
  localAddListenerMock.mockClear()
  checkPermissionsMock.mockClear()
  requestPermissionsMock.mockClear()
  registerMock.mockClear()
  toastMock.mockClear()
  actionMock.mockClear()

  pushAddListenerMock.mockImplementation(async (event, cb) => {
    pushListeners.set(event as string, cb as never)
    return { remove: async () => {} }
  })
  localAddListenerMock.mockImplementation(async (event, cb) => {
    localListeners.set(event as string, cb as never)
    return { remove: async () => {} }
  })
  checkPermissionsMock.mockResolvedValue({ receive: 'granted' })
  requestPermissionsMock.mockResolvedValue({ receive: 'granted' })
  fetchMock.mockResolvedValue(okResponse({ ok: true, stored: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function pushPayload(overrides: Partial<PushNotificationSchema> & { data?: Record<string, unknown> }): PushNotificationSchema {
  return {
    title: 'Titre système',
    subtitle: '',
    body: 'Corps système',
    id: 'native-id',
    tag: undefined,
    badge: undefined,
    notification: undefined,
    click_action: undefined,
    link: undefined,
    group: undefined,
    groupSummary: undefined,
    ...overrides,
  } as PushNotificationSchema
}

async function init(): Promise<() => void> {
  const cleanup = initNativeNotifications()
  await vi.waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
  return cleanup
}

describe('initNativeNotifications', () => {
  it('crée les 3 canaux, pose les listeners et enregistre auprès de FCM', async () => {
    const cleanup = await init()

    const channelIds = createChannelMock.mock.calls.map((c) => c[0].id)
    expect(channelIds).toEqual(['julaba-critical', 'julaba-important', 'julaba-info'])
    expect(pushListeners.has('registration')).toBe(true)
    expect(pushListeners.has('pushNotificationReceived')).toBe(true)
    expect(pushListeners.has('pushNotificationActionPerformed')).toBe(true)
    expect(localListeners.has('localNotificationActionPerformed')).toBe(true)
    cleanup()
  })

  it('demande la permission Android 13+ quand elle est en prompt', async () => {
    checkPermissionsMock.mockResolvedValue({ receive: 'prompt' })
    const cleanup = await init()
    expect(requestPermissionsMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('n\u2019enregistre pas FCM si la permission est refusée', async () => {
    checkPermissionsMock.mockResolvedValue({ receive: 'denied' })
    const cleanup = initNativeNotifications()
    await new Promise((r) => setTimeout(r, 10))
    expect(registerMock).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('token push → /api/push-tokens', () => {
  it('envoie le token au serveur lors de l\u2019événement registration', async () => {
    const cleanup = await init()
    const onRegistration = pushListeners.get('registration') as unknown as (t: { value: string }) => void
    onRegistration({ value: 'fcm-token-123' })
    // Attend la FIN du POST : le passage pending:false se fait après res.json().
    await vi.waitFor(() => {
      const stored = JSON.parse(store.get('julaba-push-token-v1')!) as { pending: boolean } | null
      expect(stored?.pending).toBe(false)
    })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/push-tokens')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'fcm-token-123', platform: 'ios' })
    const stored = JSON.parse(store.get('julaba-push-token-v1')!) as { token: string; pending: boolean }
    expect(stored.token).toBe('fcm-token-123')
    cleanup()
  })

  it('garde le token en attente si le serveur est injoignable, puis syncPendingPushToken repart', async () => {
    const cleanup = await init()
    fetchMock.mockRejectedValue(new Error('offline'))
    const onRegistration = pushListeners.get('registration') as unknown as (t: { value: string }) => void
    onRegistration({ value: 'fcm-token-123' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect((JSON.parse(store.get('julaba-push-token-v1')!) as { pending: boolean }).pending).toBe(true)

    // Retour réseau : le token repart.
    fetchMock.mockResolvedValue(okResponse({ ok: true, stored: true }))
    fetchMock.mockClear()
    await syncPendingPushToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((JSON.parse(store.get('julaba-push-token-v1')!) as { pending: boolean }).pending).toBe(false)
    cleanup()
  })

  it('table absente (stored:false) : synchronisation considérée faite, pas de retry perpétuel', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true, stored: false }))
    await registerPushToken('tok')
    expect((JSON.parse(store.get('julaba-push-token-v1')!) as { pending: boolean }).pending).toBe(false)
    expect(syncPendingPushToken()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rien à renvoyer quand aucun token en attente', async () => {
    await syncPendingPushToken()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mapPushPayload', () => {
  it('mappe le contrat julaba (data prioritaire sur le bloc notification)', () => {
    const mapped = mapPushPayload(pushPayload({
      title: 'Titre FCM',
      body: 'Corps FCM',
      data: {
        type: 'sale_created',
        category: 'vente',
        severity: 'success',
        priority: 'high',
        title: 'Vente enregistrée',
        body: '1 500 FCFA encaissés',
        deduplicationKey: 'sale:s1:created',
        actionLabel: 'Voir la vente',
        actionRoute: 'caisse',
        createdAt: '2026-09-18T10:00:00.000Z',
        id: 'srv-1',
      },
    }))
    expect(mapped).not.toBeNull()
    expect(mapped!.input).toMatchObject({
      type: 'sale_created',
      category: 'vente',
      severity: 'success',
      priority: 'high',
      title: 'Vente enregistrée',
      body: '1 500 FCFA encaissés',
      deduplicationKey: 'sale:s1:created',
      actionRoute: 'caisse',
    })
    expect(mapped!.serverId).toBe('srv-1')
    expect(mapped!.createdAt).toBe('2026-09-18T10:00:00.000Z')
  })

  it('accepte les clés snake_case (serveur) et retombe sur le bloc FCM', () => {
    const mapped = mapPushPayload(pushPayload({
      title: 'Rappel',
      data: { deduplication_key: 'tontine:t1:due:2026-09-19', action_route: 'tontines' },
    }))
    expect(mapped!.input.title).toBe('Rappel')
    expect(mapped!.input.body).toBe('Corps système')
    expect(mapped!.input.deduplicationKey).toBe('tontine:t1:due:2026-09-19')
    expect(mapped!.input.actionRoute).toBe('tontines')
    expect(mapped!.input.category).toBe('systeme')
    expect(mapped!.input.severity).toBe('info')
  })

  it('rejette un push sans aucun contenu lisible', () => {
    expect(mapPushPayload(pushPayload({ title: '', body: '', data: {} }))).toBeNull()
  })
})

describe('handlePushReceived', () => {
  it('intègre un push avec titre au feed (marqué synchronisé) SANS toast (pas de double bandeau)', async () => {
    handlePushReceived(pushPayload({
      title: 'Vente enregistrée',
      body: '1 500 FCFA encaissés',
      data: { deduplicationKey: 'sale:s1:created', category: 'vente', severity: 'success' },
    }))

    const box = JSON.parse(store.get('julaba-device-notifications-v1')!) as { notifications: Array<{ deduplicationKey: string; synced: boolean; origin: string }> }
    expect(box.notifications).toHaveLength(1)
    expect(box.notifications[0].deduplicationKey).toBe('sale:s1:created')
    expect(box.notifications[0].synced).toBe(true)
    expect(box.notifications[0].origin).toBe('device')
    expect(toastMock).not.toHaveBeenCalled()
    // Le rafraîchissement du feed passe par un import dynamique : attendre
    // la micro-tâche avant d'affirmer.
    await vi.waitFor(() => expect(fetchNotificationsMock).toHaveBeenCalledTimes(1))
  })

  it('affiche le toast pour un push data-only (rien affiché par le système)', () => {
    handlePushReceived(pushPayload({
      title: '',
      body: '',
      data: { title: 'Stock faible', body: 'Riz local : 8 sachets restants', deduplicationKey: 'stock:p1:low:2026-09-18' },
    }))
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0][0].title).toBe('Stock faible')
  })

  it('ignore un push vide (silencieux)', async () => {
    handlePushReceived(pushPayload({ title: '', body: '', data: {} }))
    await new Promise((r) => setTimeout(r, 5))
    expect(toastMock).not.toHaveBeenCalled()
    expect(fetchNotificationsMock).not.toHaveBeenCalled()
  })
})

describe('tap sur notification', () => {
  it('push tap avec actionRoute → navigation via executeNotificationAction', async () => {
    const cleanup = await init()
    const onTap = pushListeners.get('pushNotificationActionPerformed') as unknown as (a: { notification: { data: unknown } }) => void
    onTap({ notification: { data: { actionRoute: 'stock', deduplicationKey: 'x' } } })
    expect(actionMock).toHaveBeenCalledTimes(1)
    expect(actionMock.mock.calls[0][0].actionRoute).toBe('stock')
    cleanup()
  })

  it('tap local avec extra.actionRoute → même chemin', async () => {
    const cleanup = await init()
    const onTap = localListeners.get('localNotificationActionPerformed') as unknown as (a: { notification: { extra: unknown } }) => void
    onTap({ notification: { extra: { actionRoute: 'caisse' } } })
    expect(actionMock).toHaveBeenCalledTimes(1)
    expect(actionMock.mock.calls[0][0].actionRoute).toBe('caisse')
    cleanup()
  })

  it('payload sans route → aucune navigation', () => {
    handleNotificationTap(null)
    handleNotificationTap({ actionRoute: '' })
    handleNotificationTap('nonsense')
    expect(actionMock).not.toHaveBeenCalled()
  })
})
