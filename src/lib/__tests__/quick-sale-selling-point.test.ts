import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { completeQuickSale } from '../quick-sale'

// MODE-908 (§18) — l'étiquette du point de vente actif suit la vente
// rapide : passée en OPTIONS (arguments, sens unique — quick-sale n'importe
// jamais le store), elle voyage dans le payload SEULEMENT si fournie
// (payload historique byte-identique sinon) et alimente le journal local
// (addTodaySale avec le snapshot du point).

const { addTodaySaleMock, incrementTodaySalesCountMock, journalTodaySaleMock, queuePendingSyncMock, adjustLocalStockMock } = vi.hoisted(() => ({
  addTodaySaleMock: vi.fn(),
  incrementTodaySalesCountMock: vi.fn(),
  // MODE-909 — journal des ventes du jour (annulation) : surface du mock
  // étendue au contrat étendu de completeQuickSale, assertions intactes.
  journalTodaySaleMock: vi.fn(),
  queuePendingSyncMock: vi.fn(),
  adjustLocalStockMock: vi.fn(),
}))

vi.mock('@/lib/stores/app-store', () => ({
  useAppStore: { getState: () => ({ merchantId: 'M-TEST' }) },
}))

vi.mock('@/lib/stores/caisse-store', () => ({
  useCaisseStore: {
    getState: () => ({
      addTodaySale: addTodaySaleMock,
      incrementTodaySalesCount: incrementTodaySalesCountMock,
      journalTodaySale: journalTodaySaleMock,
    }),
  },
}))

vi.mock('@/lib/stores/stock-store', () => ({
  useStockStore: { getState: () => ({ products: [], adjustLocalStock: adjustLocalStockMock }) },
}))

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: queuePendingSyncMock,
}))

const ITEM = { name: 'Tomates', quantity: 2, unitPrice: 500, total: 1000 }
const POINT = { clientId: '0f1e2d3c-4b5a-4948-8787-aabbccddeeff', name: 'Marché Treichville' }

describe('completeQuickSale — étiquette du point de vente (MODE-908, §18)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }) as unknown as Response))
    addTodaySaleMock.mockClear()
    incrementTodaySalesCountMock.mockClear()
    queuePendingSyncMock.mockClear()
    adjustLocalStockMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('le point actif fourni voyage dans le payload (client_id + nom en snapshot)', async () => {
    const result = await completeQuickSale(ITEM, {
      sellingPointClientId: POINT.clientId,
      sellingPointName: POINT.name,
    })
    expect(result.ok).toBe(true)

    const fetchMock = vi.mocked(globalThis.fetch)
    const init = fetchMock.mock.calls[0][1] as { body: string }
    const payload = JSON.parse(init.body) as Record<string, unknown>
    expect(payload.sellingPointClientId).toBe(POINT.clientId)
    expect(payload.sellingPointName).toBe('Marché Treichville')
  })

  it('sans point fourni : payload SANS les clés (historique identique) et journal à un argument', async () => {
    const result = await completeQuickSale(ITEM)
    expect(result.ok).toBe(true)

    const fetchMock = vi.mocked(globalThis.fetch)
    const init = fetchMock.mock.calls[0][1] as { body: string }
    const payload = JSON.parse(init.body) as Record<string, unknown>
    expect(payload).not.toHaveProperty('sellingPointClientId')
    expect(payload).not.toHaveProperty('sellingPointName')

    expect(addTodaySaleMock).toHaveBeenCalledWith(1000)
  })

  it('avec point fourni : le journal local porte le snapshot (clientId + nom)', async () => {
    await completeQuickSale(ITEM, {
      sellingPointClientId: POINT.clientId,
      sellingPointName: POINT.name,
    })
    expect(addTodaySaleMock).toHaveBeenCalledWith(1000, { clientId: POINT.clientId, name: 'Marché Treichville' })
  })
})
