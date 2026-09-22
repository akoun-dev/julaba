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

// ── MODE-977 (AUDIT-007 G9) — les DÉCISIONS de gestion en file ────────────
// Rejeu verbatim : l'id cible voyage dans le payload, le handler reconstruit
// l'URL EXACTE du live (y compris le query string du DELETE membres).
describe('sync-handlers — décisions coopérative offline (MODE-977, G9)', () => {
  registerAllSyncHandlers()

  it('enregistre les 7 entités de décision', () => {
    expect(handlers.has('cooperative-membre-ajout')).toBe(true)
    expect(handlers.has('cooperative-membre-statut')).toBe(true)
    expect(handlers.has('cooperative-membre-role')).toBe(true)
    expect(handlers.has('cooperative-membre-exclusion')).toBe(true)
    expect(handlers.has('cooperative-transaction-statut')).toBe(true)
    expect(handlers.has('cooperative-besoin-traitement')).toBe(true)
    expect(handlers.has('cooperative-besoins-consolidation')).toBe(true)
  })

  it('cooperative-membre-statut rejoue PATCH /api/cooperatives/membres/:id (URL reconstruite du payload)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { cooperateurId: 'c1', membreId: 'adh-42', statut: 'actif', motif: undefined }
    await handlers.get('cooperative-membre-statut')!(payload)
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/membres/adh-42')
    expect((init as { method: string }).method).toBe('PATCH')
    expect(JSON.parse((init as { body: string }).body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('cooperative-membre-role rejoue PATCH /api/cooperatives/membres/:id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-membre-role')!({ cooperateurId: 'c1', membreId: 'adh-7', role: 'president' })
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/membres/adh-7')
    expect((init as { method: string }).method).toBe('PATCH')
    vi.unstubAllGlobals()
  })

  it('cooperative-membre-exclusion rejoue DELETE /membres/:id?cooperateurId=… (QUERY string, comme le live)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-membre-exclusion')!({ cooperateurId: 'c1', membreId: 'adh-9' })
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/membres/adh-9?cooperateurId=c1')
    expect((init as { method: string }).method).toBe('DELETE')
    vi.unstubAllGlobals()
  })

  it('cooperative-transaction-statut rejoue PATCH /api/cooperatives/tresorerie/:id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-transaction-statut')!({ cooperateurId: 'c1', transactionId: 'tx-5', statut: 'validee' })
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/tresorerie/tx-5')
    expect((init as { method: string }).method).toBe('PATCH')
    expect(JSON.parse((init as { body: string }).body)).toEqual({ cooperateurId: 'c1', transactionId: 'tx-5', statut: 'validee' })
    vi.unstubAllGlobals()
  })

  it('cooperative-besoin-traitement rejoue PATCH /api/cooperatives/besoins/:id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-besoin-traitement')!({ cooperateurId: 'c1', besoinId: 'b-3', statut: 'en_cours', quantiteAttribuee: 5 })
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/besoins/b-3')
    expect((init as { method: string }).method).toBe('PATCH')
    vi.unstubAllGlobals()
  })

  it('cooperative-besoins-consolidation rejoue POST /api/cooperatives/besoins/consolider', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('cooperative-besoins-consolidation')!({ cooperateurId: 'c1', produit: 'Huile', unite: 'L' })
    const [url, init] = fetchMock.mock.calls[0] as unknown[]
    expect(String(url)).toBe('/api/cooperatives/besoins/consolider')
    expect((init as { method: string }).method).toBe('POST')
    vi.unstubAllGlobals()
  })

  it('un id manquant au rejeu produit une URL vide encodée (jamais un crash, le 404 sera un conflit propre)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(handlers.get('cooperative-transaction-statut')!({}))
      .rejects.toBeInstanceOf(Error)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/cooperatives/tresorerie/')
    vi.unstubAllGlobals()
  })
})
