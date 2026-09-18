import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { completeQuickSale, planQuickSale } from '../quick-sale'
import { parseIntent } from '@/lib/voice/localIntent'
import type { Product } from '@/lib/stores/stock-store'

// Tests VOCAL-603/604 — quick-sale : le montant DICTÉ fait loi, la
// persistance est bornée dans le temps et le stock n'est décrémenté
// qu'après un verdict.
// Tests STK-805 — « IMPOSSIBLE DE VENDRE SANS STOCK » (§3, NON
// NÉGOCIABLE) : la survente est REFUSÉE (plus jamais d'écrêtage à 0),
// en local comme au serveur ; le stock n'est plus jamais une valeur
// absolue calculée côté client (delta local, vérité serveur).

const { addTodaySaleMock, incrementTodaySalesCountMock, queuePendingSyncMock, adjustLocalStockMock } = vi.hoisted(() => ({
  addTodaySaleMock: vi.fn(),
  incrementTodaySalesCountMock: vi.fn(),
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
  adjustLocalStock: typeof adjustLocalStockMock
}

// planQuickSale ne lit que id / name / priceUnit / stockQty — cast minimal.
function product(overrides: Partial<{ id: string; name: string; priceUnit: number; stockQty: number }> = {}) {
  return { id: 'p1', name: 'Tomates', priceUnit: 500, stockQty: 10, ...overrides } as Product
}

/** Réponse 422 façon route ventes basculée (payload INSUFFICIENT_STOCK §36). */
function insufficientResponse(available: number, requested: number): Response {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      erreur: 'Stock insuffisant',
      code: 'INSUFFICIENT_STOCK',
      available,
      requested,
      unit: 'kg',
      product: 'Tomates',
    }),
  } as unknown as Response
}

describe('planQuickSale — le montant dicté fait loi (audit P0-2)', () => {
  beforeEach(() => {
    stockStateMock = { products: [], adjustLocalStock: adjustLocalStockMock }
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

  it('STK-805 : le dépassement de stock est signalé pour REFUS (plus un simple avertissement)', () => {
    const intent = parseIntent('cinq sacs de tomates 2000')
    const plan = planQuickSale(intent, product({ stockQty: 2 }))
    expect(plan!.quantity).toBe(5)
    expect(plan!.total).toBe(2000)
    expect(plan!.stockShort).toBe(true) // completeQuickSale refusera cette vente
  })

  it('retourne null sans montant', () => {
    expect(planQuickSale({ product: 'tomates', amount: 0, quantity: 1 }, product())).toBeNull()
  })
})

describe('completeQuickSale — refus strict stock insuffisant (STK-805, §3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    stockStateMock = {
      products: [product()],
      adjustLocalStock: adjustLocalStockMock,
    }
    queuePendingSyncMock.mockReset().mockResolvedValue({ ok: true })
    adjustLocalStockMock.mockReset()
    addTodaySaleMock.mockReset()
    incrementTodaySalesCountMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('survente : REFUS immédiat en local — rien n\'est envoyé, décrémenté ni encaissé', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    stockStateMock.products = [product({ stockQty: 2 })]
    const result = await completeQuickSale({ name: 'Tomates', quantity: 5, unitPrice: 400, productId: 'p1' })
    expect(result.ok).toBe(false)
    expect(result.refusal).toEqual({
      code: 'INSUFFICIENT_STOCK',
      product: 'Tomates',
      available: 2,
      requested: 5,
    })
    expect(fetchMock).not.toHaveBeenCalled()          // rien envoyé au serveur
    expect(queuePendingSyncMock).not.toHaveBeenCalled() // rien mis en file
    expect(adjustLocalStockMock).not.toHaveBeenCalled() // stock intact
    expect(addTodaySaleMock).not.toHaveBeenCalled()     // caisse intacte
    expect(incrementTodaySalesCountMock).not.toHaveBeenCalled()
  })

  it('stock NUL : refus avec available 0 — jamais de stock négatif', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    stockStateMock.products = [product({ stockQty: 0 })]
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 500, productId: 'p1' })
    expect(result.ok).toBe(false)
    expect(result.refusal!.available).toBe(0)
    expect(result.refusal!.requested).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('vente EXACTEMENT au stock (§19 : =) : autorisée, delta local −qty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
    stockStateMock.products = [product({ stockQty: 3 })]
    const result = await completeQuickSale({ name: 'Tomates', quantity: 3, unitPrice: 500, total: 1500, productId: 'p1' })
    expect(result).toEqual({ ok: true, synced: true, stockShort: false })
    expect(adjustLocalStockMock).toHaveBeenCalledWith('p1', -3)
    expect(addTodaySaleMock).toHaveBeenCalledWith(1500)
  })

  it('article sans produit suivi (pas de productId) : aucun contrôle de stock (D7)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
    const result = await completeQuickSale({ name: 'Article', quantity: 1, unitPrice: 2000, total: 2000 })
    expect(result.ok).toBe(true)
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
    expect(addTodaySaleMock).toHaveBeenCalledWith(2000)
  })

  it('stock local périmé : le refus INSUFFICIENT_STOCK du SERVEUR fait foi (jamais en file)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => insufficientResponse(7, 15)))
    stockStateMock.products = [product({ stockQty: 20 })] // croit avoir assez
    const result = await completeQuickSale({ name: 'Tomates', quantity: 15, unitPrice: 400, productId: 'p1' })
    expect(result.ok).toBe(false)
    expect(result.refusal).toEqual({
      code: 'INSUFFICIENT_STOCK',
      available: 7,
      requested: 15,
      unit: 'kg',
      product: 'Tomates',
    })
    expect(queuePendingSyncMock).not.toHaveBeenCalled() // rejouer ne réussira jamais
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
    expect(addTodaySaleMock).not.toHaveBeenCalled()
  })

  it('succès réseau : caisse mise à jour, delta local après verdict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, total: 2000, productId: 'p1' })
    expect(result).toEqual({ ok: true, synced: true, stockShort: false })
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(adjustLocalStockMock).toHaveBeenCalledWith('p1', -1)
    expect(addTodaySaleMock).toHaveBeenCalledWith(2000)   // total dicté, pas qty × priceUnit
    expect(incrementTodaySalesCountMock).toHaveBeenCalledTimes(1)
  })

  it('échec réseau + file OK : vente en file, delta local (verdict = file)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 2, unitPrice: 1000, productId: 'p1' })
    expect(result).toEqual({ ok: true, synced: false, stockShort: false })
    expect(queuePendingSyncMock).toHaveBeenCalledTimes(1)
    expect(queuePendingSyncMock.mock.calls[0][0]).toBe('sale')
    expect(adjustLocalStockMock).toHaveBeenCalledWith('p1', -2)
    expect(addTodaySaleMock).toHaveBeenCalledWith(2000)
  })

  it('échec réseau + file KO : vente refusée et stock NON touché', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    queuePendingSyncMock.mockResolvedValue({ ok: false, error: 'Stockage indisponible' })
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, productId: 'p1' })
    expect(result).toEqual({ ok: false, synced: false })
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
    expect(addTodaySaleMock).not.toHaveBeenCalled()
  })

  it('refus serveur définitif non-stock (ex. 400) : pas de file, vente refusée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 }) as Response))
    const result = await completeQuickSale({ name: 'Tomates', quantity: 1, unitPrice: 2000, productId: 'p1' })
    expect(result.ok).toBe(false)
    expect(result.refusal).toBeUndefined()
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
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
    expect(adjustLocalStockMock).toHaveBeenCalledWith('p1', -1)
  })
})
