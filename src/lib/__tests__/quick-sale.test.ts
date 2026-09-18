import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { completeQuickSale, planQuickSale } from '../quick-sale'
import { parseIntent } from '@/lib/voice/localIntent'
import type { Product } from '@/lib/stores/stock-store'

// Tests VOCAL-603/604 — quick-sale : le montant DICTÉ fait loi, la
// persistance est bornée dans le temps et le stock n'est décrémenté
// qu'après un verdict.

const { addTodaySaleMock, incrementTodaySalesCountMock, queuePendingSyncMock, updateProductMock } = vi.hoisted(() => ({
  addTodaySaleMock: vi.fn(),
  incrementTodaySalesCountMock: vi.fn(),
  queuePendingSyncMock: vi.fn(),
  updateProductMock: vi.fn(),
}))

vi.mock('@/lib/stores/app-store', () => ({
  useAppStore: { getState: () => ({ merchantId: 'M-TEST' }) },
}))

vi.mock('@/lib/stores/caisse-store', () => ({
  useCaisseStore: {
    getState: () => ({
      addTodaySale: addTodaySaleMock,
      incrementTodaySalesCount: incrementTodaySalesCountMock,
    }),
  },
}))

vi.mock('@/lib/stores/stock-store', () => ({
  useStockStore: { getState: () => stockStateMock },
}))

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: queuePendingSyncMock,
}))

let stockStateMock: {
  products: Product[]
  updateProduct: typeof updateProductMock
}

// planQuickSale ne lit que id / name / priceUnit / stockQty — cast minimal.
function product(overrides: Partial<{ id: string; name: string; priceUnit: number; stockQty: number }> = {}) {
  return { id: 'p1', name: 'Tomates', priceUnit: 500, stockQty: 10, ...overrides } as Product
}

describe('planQuickSale — le montant dicté fait loi (audit P0-2)', () => {
  beforeEach(() => {
    stockStateMock = { products: [], updateProduct: updateProductMock }
  })

  it('scénario 1 : « tomates 2000 » avec tomates à 500 au stock → 2000 (plus jamais 500)', () => {
    const intent = parseIntent('tomates 2000')
    const plan = planQuickSale(intent, product({ priceUnit: 500 }))
    expect(plan).not.toBeNull()
    expect(plan!.total).toBe(2000)       // montant dicté — avant : 500
    expect(plan!.unitPrice).toBe(2000)   // 2000 / 1
    expect(plan!.quantity).toBe(1)
    expect(plan!.productId).toBe('p1')
    expect(plan!.stockShort).toBe(false)
  })

  it('scénario 2 : « trois sacs de riz 2000 » avec riz à 5000 → total 2000, prix unitaire 667', () => {
    const intent = parseIntent('trois sacs de riz 2000')
    expect(intent.quantity).toBe(3)
    const plan = planQuickSale(intent, product({ id: 'p2', name: 'Riz', priceUnit: 5000 }))
    expect(plan!.total).toBe(2000)       // montant dicté — avant : 15000
    expect(plan!.unitPrice).toBe(667)    // round(2000/3)
    expect(plan!.quantity).toBe(3)
  })

  it('scénario 3 : « j\'ai vendu 3 tomates à 500 » → 1500 (qty × prix unitaire, pas 500)', () => {
    const intent = parseIntent("j'ai vendu 3 tomates à 500")
    expect(intent.type).toBe('sale')
    expect(intent.amount).toBe(1500)     // avant : 500 (dernier nombre = total)
    expect(intent.quantity).toBe(3)
    expect(intent.unitPrice).toBe(500)
    const plan = planQuickSale(intent, product())
    expect(plan!.total).toBe(1500)
    expect(plan!.unitPrice).toBe(500)
  })

  it('scénario 4 : « tomates 2000 » sans produit au stock → 2000, pas de productId', () => {
    const intent = parseIntent('tomates 2000')
    const plan = planQuickSale(intent, undefined)
    expect(plan!.total).toBe(2000)
    expect(plan!.productId).toBeUndefined()
    expect(plan!.stockShort).toBe(false)
  })

  it('signale la survente (stock restant < quantité) sans la bloquer', () => {
    const intent = parseIntent('cinq sacs de tomates 2000')
    const plan = planQuickSale(intent, product({ stockQty: 2 }))
    expect(plan!.quantity).toBe(5)
    expect(plan!.total).toBe(2000)
    expect(plan!.stockShort).toBe(true)
  })

  it('retourne null sans montant', () => {
    expect(planQuickSale({ product: 'tomates', amount: 0, quantity: 1 }, product())).toBeNull()
  })
})

describe('completeQuickSale — persistance bornée et stock après verdict', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    stockStateMock = {
      products: [product()],
      updateProduct: updateProductMock,
    }
    queuePendingSyncMock.mockReset().mockResolvedValue({ ok: true })
    updateProductMock.mockReset()
    addTodaySaleMock.mockReset()
    incrementTodaySalesCountMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('succès réseau : vente synchronisée, stock décrémenté après coup, caisse mise à jour', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, total: 2000, productId: 'p1' })
    expect(result).toEqual({ ok: true, synced: true, stockShort: false })
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(updateProductMock).toHaveBeenCalledWith('p1', { stockQty: 9 })
    expect(addTodaySaleMock).toHaveBeenCalledWith(2000)   // total dicté, pas qty × priceUnit
    expect(incrementTodaySalesCountMock).toHaveBeenCalledTimes(1)
  })

  it('échec réseau + file OK : vente en file, stock quand même décrémenté (verdict = file)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 2, unitPrice: 1000, productId: 'p1' })
    expect(result).toEqual({ ok: true, synced: false, stockShort: false })
    expect(queuePendingSyncMock).toHaveBeenCalledTimes(1)
    expect(queuePendingSyncMock.mock.calls[0][0]).toBe('sale')
    expect(updateProductMock).toHaveBeenCalledWith('p1', { stockQty: 8 })
    expect(addTodaySaleMock).toHaveBeenCalledWith(2000)
  })

  it('échec réseau + file KO : vente refusée et stock NON décrémenté', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    queuePendingSyncMock.mockResolvedValue({ ok: false, error: 'Stockage indisponible' })
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, productId: 'p1' })
    expect(result).toEqual({ ok: false, synced: false })
    expect(updateProductMock).not.toHaveBeenCalled()
    expect(addTodaySaleMock).not.toHaveBeenCalled()
  })

  it('serveur suspendu : timeout 10 s → bascule en file offline (plus de processing figé)', async () => {
    vi.useFakeTimers()
    // fetch réel : rejette quand le signal abort — sinon la promesse ne
    // se settle jamais et le timeout ne peut pas jouer.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, productId: 'p1' })
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await pending
    expect(result).toEqual({ ok: true, synced: false, stockShort: false })
    expect(queuePendingSyncMock).toHaveBeenCalledTimes(1)
    expect(updateProductMock).toHaveBeenCalledWith('p1', { stockQty: 9 })
  })

  it('survente signalée dans le résultat', async () => {
    stockStateMock.products = [product({ stockQty: 2 })]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 5, unitPrice: 400, productId: 'p1' })
    expect(result.ok).toBe(true)
    expect(result.stockShort).toBe(true)
    expect(updateProductMock).toHaveBeenCalledWith('p1', { stockQty: 0 }) // écrêté, annoncé
  })
})
