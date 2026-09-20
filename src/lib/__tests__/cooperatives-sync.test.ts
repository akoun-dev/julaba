import { describe, it, expect, vi } from 'vitest'

// offline-db (localStorage) est mocké : on teste les HANDLERS coopérative,
// pas la file (même convention que sync-handlers-stock.test.ts).
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

describe('sync-handlers — entités coopérative offline (MODE-921)', () => {
  registerAllSyncHandlers()

  it('enregistre les 5 entités coopérative', () => {
    expect(handlers.has('cooperative-transaction')).toBe(true)
    expect(handlers.has('cooperative-stock-apport')).toBe(true)
    expect(handlers.has('cooperative-besoin')).toBe(true)
    expect(handlers.has('cooperative-cotisation')).toBe(true)
    expect(handlers.has('cooperative-adhesion')).toBe(true)
  })

  it('cooperative-transaction rejoue POST /api/cooperatives/tresorerie', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { cooperateurId: 'c1', type: 'sortie', montant: 5000, description: 'Transport' }
    await handlers.get('cooperative-transaction')!(payload)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/cooperatives/tresorerie')
    expect(JSON.parse(((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('cooperative-stock-apport rejoue POST /api/cooperatives/stock (avec clientId)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { merchantId: 'm1', clientId: 'uuid-1', produit: 'Riz', quantite: 10, unite: 'kg' }
    await handlers.get('cooperative-stock-apport')!(payload)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/cooperatives/stock')
    expect(JSON.parse(((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('cooperative-besoin rejoue POST /api/cooperatives/besoins', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-besoin')!({ merchantId: 'm1', produit: 'Huile', quantite: 5, unite: 'L' })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/cooperatives/besoins')
    vi.unstubAllGlobals()
  })

  it('cooperative-cotisation rejoue POST /api/cooperatives/cotisation', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-cotisation')!({ merchantId: 'm1', montant: 25000 })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/cooperatives/cotisation')
    vi.unstubAllGlobals()
  })

  it('cooperative-adhesion rejoue POST /api/cooperatives/rejoindre', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-adhesion')!({ merchantId: 'm1', cooperativeId: 'uuid-9' })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/api/cooperatives/rejoindre')
    vi.unstubAllGlobals()
  })

  it('un rejet 4xx définitif lève SyncConflictError (pas de boucle de rejeu)', async () => {
    const { SyncConflictError } = await import('@/lib/offline-db')
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ erreur: 'Adhésion déjà en attente' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(handlers.get('cooperative-adhesion')!({ merchantId: 'm1', cooperativeId: 'x' }))
      .rejects.toBeInstanceOf(SyncConflictError)
    vi.unstubAllGlobals()
  })

  it('une erreur serveur 500 est transitoire (rejet lisible, pas conflit)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(handlers.get('cooperative-transaction')!({ cooperateurId: 'c1', type: 'entree', montant: 100, description: 'x' }))
      .rejects.toThrow(/500/)
    vi.unstubAllGlobals()
  })
})
