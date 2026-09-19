import { describe, it, expect, vi, beforeEach } from 'vitest'

// offline-db (localStorage) est mocké : on teste les HANDLERS, pas la file.
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
import { stockOperationClientId } from '@/lib/voice/voice-stock'

describe('sync-handlers — entités stock offline (STK-808, §2.8)', () => {
  // registerAllSyncHandlers garde un flag module-level : on l'appelle UNE
  // fois (comme le SyncFlusher) et le registre reste stable.
  registerAllSyncHandlers()

  it('enregistre stock-movement, stock-count et stock-purchase', () => {
    expect(handlers.has('stock-movement')).toBe(true)
    expect(handlers.has('stock-count')).toBe(true)
    expect(handlers.has('stock-purchase')).toBe(true)
  })

  it('stock-movement rejoue le MÊME POST /api/marchand/stock/movements', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      merchantId: 'm1', productId: 'p1', movementType: 'LOSS',
      quantityBase: 5, reason: 'PERTE_VOCALE', clientId: 'perte-123-abc',
    }
    await handlers.get('stock-movement')!(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/marchand/stock/movements',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual(payload)
    vi.unstubAllGlobals()
  })

  it('stock-count rejoue POST /api/marchand/stock/count', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('stock-count')!({ merchantId: 'm1', productId: 'p1', countedQuantityBase: 30 })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/marchand/stock/count')
    vi.unstubAllGlobals()
  })

  it('stock-purchase rejoue POST /api/marchand/purchases', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('stock-purchase')!({ merchantId: 'm1', items: [], clientId: 'achat-123' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/marchand/purchases')
    vi.unstubAllGlobals()
  })

  it('422 (stock insuffisant) = rejet DÉFINITIF (SyncConflictError), jamais un retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422 })))
    await expect(handlers.get('stock-movement')!({ merchantId: 'm1' })).rejects.toThrow(/Rejet définitif/)
    vi.unstubAllGlobals()
  })

  it("erreur réseau = TRANSITOIRE (Error simple, l'entrée reste en file)", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(handlers.get('stock-movement')!({ merchantId: 'm1' })).rejects.toThrow('Réseau indisponible')
    vi.unstubAllGlobals()
  })
})

describe('idempotence offline — clientId lisible → UUID déterministe (§31-32)', () => {
  it('le clientId généré localement est stable et lisible : rejeu = même id', () => {
    // Le contrat : le payload queue porte un clientId lisible ; la route
    // le convertit via operationUuid (md5 déterministe). Deux rejeux du
    // MÊME payload produisent donc le MÊME operation_id serveur — c'est
    // la propriété testée côté stock-service (operationUuid).
    const payload = { clientId: stockOperationClientId('perte') }
    expect(payload.clientId).toMatch(/^perte-\d+-[a-z0-9]+$/)
    // Même objet rejoué → même id (par construction, le payload est immuable).
    expect(JSON.parse(JSON.stringify(payload)).clientId).toBe(payload.clientId)
  })
})
