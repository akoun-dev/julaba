import { describe, it, expect, beforeEach, vi } from 'vitest'

// offline-db (localStorage) et notifications ne doivent jamais être
// touchés par ces tests — on ne déclenche que des lectures de config.
vi.mock('@/lib/offline-db', () => ({ queuePendingSync: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/notifications/triggers', () => ({ notify: vi.fn() }))
vi.mock('@/lib/notifications/events', () => ({
  productAddedInput: vi.fn(),
  stockLowInput: vi.fn(),
  stockOutOfStockInput: vi.fn(),
  restockRecordedInput: vi.fn(),
}))

import { useStockStore, DEFAULT_LOW_STOCK_THRESHOLD } from '../stock-store'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

describe('stock-store — configuration stock par produit (STK-806)', () => {
  beforeEach(() => {
    useStockStore.setState({
      products: [],
      unitsByProduct: {},
      thresholdsByProduct: {},
      error: null,
    })
  })

  it('loadStockConfig remplit unités commerciales + seuils par produit', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/stock/units')) {
        return jsonResponse({
          units: [],
          byProduct: {
            'prod-1': [
              { unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true },
              { unitCode: 'kg', conversionToBase: 1, isBase: true, isDefaultSale: false },
            ],
          },
        })
      }
      if (url.includes('/stock/balance')) {
        return jsonResponse({
          balances: [{ productId: 'prod-1', lowStockThreshold: 3 }],
        })
      }
      return jsonResponse({}, false)
    })
    vi.stubGlobal('fetch', fetchMock)

    await useStockStore.getState().loadStockConfig('merchant-1')

    const state = useStockStore.getState()
    expect(state.unitsByProduct['prod-1']).toHaveLength(2)
    expect(state.unitsByProduct['prod-1'][0].unitCode).toBe('sac')
    expect(state.thresholdsByProduct['prod-1']).toBe(3)
    vi.unstubAllGlobals()
  })

  it('getLowStockThreshold : seuil configuré sinon repli 10', async () => {
    useStockStore.setState({ thresholdsByProduct: { 'prod-1': 5 } })
    expect(useStockStore.getState().getLowStockThreshold('prod-1')).toBe(5)
    expect(useStockStore.getState().getLowStockThreshold('prod-inconnu')).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(10)
  })

  it('getLowStockProducts utilise le seuil PAR produit (fini le < 10 gravé)', () => {
    useStockStore.setState({
      products: [
        { id: 'prod-1', name: 'Tomates', category: 'a', priceUnit: 500, stockQty: 7, isActive: true },
        { id: 'prod-2', name: 'Oignons', category: 'a', priceUnit: 400, stockQty: 7, isActive: true },
        { id: 'prod-3', name: 'Riz', category: 'a', priceUnit: 900, stockQty: 42, isActive: true },
      ],
      thresholdsByProduct: { 'prod-1': 10 }, // 7 < 10 → bas
      // prod-2 sans config → repli 10 → 7 < 10 → bas aussi
    })
    const low = useStockStore.getState().getLowStockProducts()
    expect(low.map((p) => p.id)).toEqual(['prod-1', 'prod-2'])
  })

  it('getUnitConfig renvoie null sans config (jamais de fausse conversion)', () => {
    expect(useStockStore.getState().getUnitConfig('prod-inconnu')).toBeNull()
  })

  it('loadStockConfig échec réseau : garde l\'existant, jamais de crash', async () => {
    useStockStore.setState({
      unitsByProduct: { 'prod-1': [{ unitCode: 'sac', conversionToBase: 25, isBase: false, isDefaultSale: true }] },
      thresholdsByProduct: { 'prod-1': 4 },
    })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await useStockStore.getState().loadStockConfig('merchant-1')
    expect(useStockStore.getState().thresholdsByProduct['prod-1']).toBe(4)
    expect(useStockStore.getState().unitsByProduct['prod-1']).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})
