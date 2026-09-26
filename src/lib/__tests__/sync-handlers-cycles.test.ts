import { describe, it, expect, vi } from 'vitest'

// MODE-935 — handlers de file des cycles culturaux (I-02 : l'absence du
// handler 'cycle-create' droppait les cycles créés hors ligne au flush).
// offline-db est mocké : on teste les HANDLERS, pas la file.
const handlers = new Map<string, (payload: unknown) => Promise<void>>()
vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  SyncConflictError: class SyncConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SyncConflictError'
    }
  },
}))

import { registerAllSyncHandlers } from '../sync-handlers'

describe('sync-handlers — cycles culturaux (MODE-935, I-02/I-03)', () => {
  registerAllSyncHandlers()

  it("enregistre 'cycle-create' et 'cycle-update'", () => {
    expect(handlers.has('cycle-create')).toBe(true)
    expect(handlers.has('cycle-update')).toBe(true)
  })

  it('cycle-create rejoue le MÊME POST /api/producteur/cycles (verbatim)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      id: 'cycle-1727000000000',
      producteurId: 'prod-1',
      produit: 'Maïs',
      parcelle: 'Champ Nord',
      dateSemis: '2026-09-01',
      dateRecoltePrevue: '2026-12-15',
    }
    await handlers.get('cycle-create')!(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/producteur/cycles',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('cycle-update rejoue le MÊME PATCH /api/producteur/cycles (clôture)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      id: 'cycle-1727000000000',
      producteurId: 'prod-1',
      statut: 'termine',
      quantiteRecolteeKg: 320,
    }
    await handlers.get('cycle-update')!(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/producteur/cycles',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('sale rejoue une vente hors catalogue avec productName et sans productId', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      merchantId: 'M-TEST',
      clientId: 'sale-offline-charbon-1',
      items: [{ productName: 'Charbon', quantity: 2, unitPrice: 1500 }],
      amountReceived: 3000,
    }

    await handlers.get('sale')!(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/marchand/sales',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual(payload)
    expect(JSON.parse(init.body).items[0].productId).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('un rejet définitif (409 un-seul-cycle-en-cours) devient un conflit, jamais une boucle', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      handlers.get('cycle-create')!({ id: 'c1', producteurId: 'p1', produit: 'Riz', dateSemis: '2026-01-01', dateRecoltePrevue: '2026-04-01' })
    ).rejects.toThrow('Rejet définitif')
    vi.unstubAllGlobals()
  })
})
