import { describe, it, expect, vi, beforeEach } from 'vitest'

// MODE-901/902 — store du Mode Marché. Le store est la SEULE porte entre la
// caisse et la file offline pour le contexte de journée (§7-8) : tant que le
// Mode Marché n'est pas activé, aucune session marché n'est construite ni
// mise en file (comportement historique intact) ; une fois activé, chaque
// ouverture/fermeture de caisse produit un enregistrement résumé idempotent.

/** Stockage en mémoire fidèle à l'API localStorage (vitest environment node). */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

vi.stubGlobal('localStorage', fakeStorage())

const queueMock = vi.hoisted(() => ({ queuePendingSync: vi.fn(async () => ({ ok: true } as const)) }))
vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: queueMock.queuePendingSync,
}))

import { useMarketModeStore } from '../market-mode-store'

beforeEach(() => {
  queueMock.queuePendingSync.mockClear()
  useMarketModeStore.setState({
    activated: false,
    market: { name: null, locationMode: 'none' },
    lastPosition: null,
    gpsStatus: 'idle',
    lastSession: null,
  })
})

describe('useMarketModeStore — activation (§4-5)', () => {
  it('démarré inactif avec une configuration vide', () => {
    const s = useMarketModeStore.getState()
    expect(s.activated).toBe(false)
    expect(s.market.locationMode).toBe('none')
    expect(s.market.name).toBeNull()
    expect(s.lastSession).toBeNull()
  })

  it('activateMarketMode enregistre le marché choisi et active le mode', () => {
    useMarketModeStore.getState().activateMarketMode({
      marketName: "Marché d'Adjamé",
      locationMode: 'select',
    })
    const s = useMarketModeStore.getState()
    expect(s.activated).toBe(true)
    expect(s.market).toEqual({ name: "Marché d'Adjamé", locationMode: 'select' })
  })

  it('deactivate repasse inactif et efface la session courante', () => {
    const store = useMarketModeStore.getState()
    store.activateMarketMode({ marketName: null, locationMode: 'none' })
    store.onSessionOpened({
      merchantId: 'm1',
      sessionId: 's1',
      fondDeCaisse: 1000,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    expect(useMarketModeStore.getState().lastSession).not.toBeNull()
    useMarketModeStore.getState().deactivate()
    expect(useMarketModeStore.getState().activated).toBe(false)
    expect(useMarketModeStore.getState().lastSession).toBeNull()
  })
})

describe('useMarketModeStore — sessions ignorées tant que non activé', () => {
  it('onSessionOpened/onSessionClosed ne mettent RIEN en file avant activation', () => {
    const store = useMarketModeStore.getState()
    store.onSessionOpened({
      merchantId: 'm1',
      sessionId: 's1',
      fondDeCaisse: 1000,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    store.onSessionClosed({
      sessionId: 's1',
      closedAt: '2026-09-19T18:00:00.000Z',
      countedCash: null,
      salesTotal: 500,
      expensesTotal: 0,
    })
    expect(queueMock.queuePendingSync).not.toHaveBeenCalled()
    expect(useMarketModeStore.getState().lastSession).toBeNull()
  })
})

describe('useMarketModeStore — session marché (§7-8)', () => {
  beforeEach(() => {
    useMarketModeStore.getState().activateMarketMode({
      marketName: "Marché d'Adjamé",
      locationMode: 'select',
    })
  })

  it('ouverture → enregistrement open en file (clientId = sessionId)', async () => {
    await useMarketModeStore.getState().onSessionOpened({
      merchantId: 'merchant-1',
      sessionId: 'sess-abc',
      fondDeCaisse: 10_000,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    expect(queueMock.queuePendingSync).toHaveBeenCalledTimes(1)
    const [entity, payload] = (queueMock.queuePendingSync.mock.calls as unknown as [string, Record<string, unknown>][])[0]
    expect(entity).toBe('market-session')
    expect(payload).toMatchObject({
      merchantId: 'merchant-1',
      clientId: 'sess-abc',
      marketName: "Marché d'Adjamé",
      locationMode: 'select',
      startingCash: 10_000,
      status: 'open',
    })
    expect(useMarketModeStore.getState().lastSession?.status).toBe('open')
  })

  it('fermeture → MÊME clientId, statut closed, caisse estimée calculée', async () => {
    const store = useMarketModeStore.getState()
    await store.onSessionOpened({
      merchantId: 'merchant-1',
      sessionId: 'sess-abc',
      fondDeCaisse: 10_000,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    await store.onSessionClosed({
      sessionId: 'sess-abc',
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: null,
      salesTotal: 84_500,
      expensesTotal: 8_000,
    })
    expect(queueMock.queuePendingSync).toHaveBeenCalledTimes(2)
    const [, closePayload] = (queueMock.queuePendingSync.mock.calls as unknown as [string, Record<string, unknown>][])[1]
    expect(closePayload).toMatchObject({
      clientId: 'sess-abc',
      status: 'closed',
      endingCash: 10_000 + 84_500 - 8_000,
      salesTotal: 84_500,
      expensesTotal: 8_000,
    })
    expect(useMarketModeStore.getState().lastSession?.status).toBe('closed')
  })

  it('caisse comptée prioritaire sur l\'estimation', async () => {
    const store = useMarketModeStore.getState()
    await store.onSessionOpened({
      merchantId: 'm1',
      sessionId: 's2',
      fondDeCaisse: 5_000,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    await store.onSessionClosed({
      sessionId: 's2',
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: 6_100,
      salesTotal: 2_000,
      expensesTotal: 1_000,
    })
    const [, closePayload] = (queueMock.queuePendingSync.mock.calls as unknown as [string, Record<string, unknown>][])[1]
    expect(closePayload).toMatchObject({ endingCash: 6_100 })
  })

  it('session d\'un autre id ignorée à la fermeture (garde de cohérence)', async () => {
    const store = useMarketModeStore.getState()
    await store.onSessionOpened({
      merchantId: 'm1',
      sessionId: 's1',
      fondDeCaisse: 0,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    queueMock.queuePendingSync.mockClear()
    await store.onSessionClosed({
      sessionId: 'AUTRE',
      closedAt: '2026-09-19T18:30:00.000Z',
      countedCash: null,
      salesTotal: 0,
      expensesTotal: 0,
    })
    expect(queueMock.queuePendingSync).not.toHaveBeenCalled()
    expect(useMarketModeStore.getState().lastSession?.status).toBe('open')
  })
})

describe('useMarketModeStore — position (§6)', () => {
  it('setPosition stocke la dernière position connue', () => {
    useMarketModeStore.getState().setPosition({
      lat: 5.36,
      lng: -4.01,
      accuracy: 8,
      timestamp: 1_700_000_000_000,
    })
    expect(useMarketModeStore.getState().lastPosition?.lat).toBe(5.36)
    expect(useMarketModeStore.getState().gpsStatus).toBe('captured')
  })

  it('markGpsRefused / markGpsUnavailable reflètent l\'état sans bloquer', () => {
    useMarketModeStore.getState().markGpsRefused()
    expect(useMarketModeStore.getState().gpsStatus).toBe('refused')
    useMarketModeStore.getState().markGpsUnavailable()
    expect(useMarketModeStore.getState().gpsStatus).toBe('unavailable')
  })

  it('ouverture en mode gps attache la position si disponible', async () => {
    useMarketModeStore.setState({
      market: { name: null, locationMode: 'gps' },
      lastPosition: { lat: 5.36, lng: -4.01, accuracy: 8, timestamp: 1_700_000_000_000 },
    })
    useMarketModeStore.getState().activateMarketMode({ marketName: null, locationMode: 'gps' })
    useMarketModeStore.getState().setPosition({ lat: 5.36, lng: -4.01, accuracy: 8, timestamp: 1_700_000_000_000 })
    await useMarketModeStore.getState().onSessionOpened({
      merchantId: 'm1',
      sessionId: 's3',
      fondDeCaisse: 0,
      openedAt: '2026-09-19T08:00:00.000Z',
    })
    const [, payload] = (queueMock.queuePendingSync.mock.calls as unknown as [string, Record<string, unknown>][])[0]
    expect(payload).toMatchObject({ latitude: 5.36, longitude: -4.01, accuracyM: 8 })
  })
})
