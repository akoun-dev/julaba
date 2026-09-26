import { describe, it, expect, vi, beforeEach } from 'vitest'

// offline-db est mocké : on teste les HANDLERS marketplace, pas la file
// (même approche que sync-handlers-stock.test.ts).
const handlers = new Map<string, (payload: unknown) => Promise<void>>()
vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  SyncConflictError: class SyncConflictError extends Error {
    readonly isSyncConflict = true
    constructor(message: string) {
      super(message)
      this.name = 'SyncConflictError'
    }
  },
  SyncSessionError: class SyncSessionError extends Error {
    readonly isSyncSessionError = true
    constructor(message: string) {
      super(message)
      this.name = 'SyncSessionError'
    }
  },
}))

import { registerAllSyncHandlers } from '../sync-handlers'
import { SyncConflictError, SyncSessionError } from '@/lib/offline-db'

/**
 * AUDIT-013 (MODE-1014) — handlers offline marketplace.
 *
 * Contrat testé (audit confirmé : 0 handler marketplace avant cette tâche) :
 * chaque handler rejoue le fetch VERBATIM vers la MÊME route/méthode que le
 * live (marche-screen POST /api/marketplace ; commandes-screen PATCH
 * /api/marketplace/orders/:id action cancel/receipt/payment ; écran vendeur
 * PATCH /api/marketplace/seller-orders). 401/403 → SyncSessionError (la file
 * attend un reclaim, jamais un conflit) ; 409 sur les actions sans clé
 * serveur (cancel, transition vendeur) = rejeu d'une action DÉJÀ appliquée →
 * succès idempotent ; 409 sur les entités idempotentes par clientId côté RPC
 * (création, paiement, réception) = rejet définitif → SyncConflictError.
 */
describe('sync-handlers — entités marketplace offline (AUDIT-013, MODE-1014)', () => {
  // registerAllSyncHandlers garde un flag module-level : appel UNE fois
  // (comme le SyncFlusher), registre stable pour toute la suite.
  registerAllSyncHandlers()

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('enregistre les cinq entités marketplace', () => {
    expect(handlers.has('marketplace-order')).toBe(true)
    expect(handlers.has('marketplace-payment')).toBe(true)
    expect(handlers.has('marketplace-receipt')).toBe(true)
    expect(handlers.has('marketplace-order-cancel')).toBe(true)
    expect(handlers.has('seller-order-status')).toBe(true)
  })

  it('marketplace-order rejoue le MÊME POST /api/marketplace (checkout, payload verbatim)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      merchantId: 'm1',
      buyerMerchantId: 'm1',
      clientId: '11111111-1111-4111-8111-111111111111',
      items: [{ listingId: 'l1', quantity: 2 }],
      paymentMethod: 'cash_on_delivery',
      deliveryMode: 'pickup',
      deliveryAddress: null,
      deliveryZone: null,
      buyerNote: null,
    }
    await handlers.get('marketplace-order')!(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/marketplace')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(payload)
    // jsonRequest propage le clientId en clé d'idempotence.
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(payload.clientId)
  })

  it('marketplace-payment rejoue PATCH /api/marketplace/orders/:id avec le body du live (orderId retiré)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('marketplace-payment')!({
      orderId: 'ord-1',
      action: 'payment',
      paymentMethod: 'mobile_money',
      merchantId: 'm1',
      clientId: '22222222-2222-4222-8222-222222222222',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/marketplace/orders/ord-1')
    expect(init.method).toBe('PATCH')
    // Le handler retire orderId (voyagé pour reconstruire l'URL) : le body
    // rejoué est EXACTEMENT celui de la tentative live.
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'payment',
      paymentMethod: 'mobile_money',
      merchantId: 'm1',
      clientId: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('marketplace-receipt rejoue PATCH /api/marketplace/orders/:id action receipt', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('marketplace-receipt')!({
      orderId: 'ord-2',
      action: 'receipt',
      merchantId: 'm1',
      clientId: '33333333-3333-4333-8333-333333333333',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/marketplace/orders/ord-2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'receipt',
      merchantId: 'm1',
      clientId: '33333333-3333-4333-8333-333333333333',
    })
  })

  it('marketplace-order-cancel rejoue PATCH /api/marketplace/orders/:id action cancel', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('marketplace-order-cancel')!({
      orderId: 'ord-3',
      action: 'cancel',
      reason: 'Annulation par le marchand',
      merchantId: 'm1',
      clientId: '44444444-4444-4444-8444-444444444444',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/marketplace/orders/ord-3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'cancel',
      reason: 'Annulation par le marchand',
      merchantId: 'm1',
      clientId: '44444444-4444-4444-8444-444444444444',
    })
  })

  it('seller-order-status rejoue PATCH /api/marketplace/seller-orders verbatim', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      merchantId: 'm1',
      orderId: 'ord-4',
      status: 'confirmed',
      clientId: '55555555-5555-4555-8555-555555555555',
    }
    await handlers.get('seller-order-status')!(payload)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/marketplace/seller-orders')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual(payload)
  })

  // ── Session ─────────────────────────────────────────────────────────
  it.each([
    ['marketplace-order', { merchantId: 'm1', clientId: 'c1' }],
    ['marketplace-payment', { orderId: 'o1', action: 'payment', clientId: 'c2' }],
    ['marketplace-receipt', { orderId: 'o1', action: 'receipt', clientId: 'c3' }],
    ['marketplace-order-cancel', { orderId: 'o1', action: 'cancel', clientId: 'c4' }],
    ['seller-order-status', { merchantId: 'm1', orderId: 'o1', status: 'confirmed', clientId: 'c5' }],
  ])('%s : 401 → SyncSessionError (file suspendue, JAMAIS un conflit)', async (entity, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(handlers.get(entity)!(payload)).rejects.toBeInstanceOf(SyncSessionError)
  })

  it.each([
    ['marketplace-order', { merchantId: 'm1', clientId: 'c1' }],
    ['marketplace-payment', { orderId: 'o1', action: 'payment', clientId: 'c2' }],
    ['marketplace-receipt', { orderId: 'o1', action: 'receipt', clientId: 'c3' }],
  ])('%s : 409 = rejet DÉFINITIF (SyncConflictError) — le rejeu idempotent de ces RPC répond 2xx, un 409 est un vrai refus', async (entity, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409 })))
    await expect(handlers.get(entity)!(payload)).rejects.toBeInstanceOf(SyncConflictError)
  })

  // ── Idempotence du rejeu ────────────────────────────────────────────
  it('marketplace-order-cancel : 409 (ORDER_NOT_CANCELLABLE — annulation déjà appliquée côté serveur) = succès idempotent, pas d\'erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409 })))
    await expect(
      handlers.get('marketplace-order-cancel')!({ orderId: 'o1', action: 'cancel', reason: 'r', clientId: 'c4' })
    ).resolves.toBeUndefined()
  })

  it('seller-order-status : 409 (INVALID_ORDER_TRANSITION — transition déjà appliquée) = succès idempotent, pas d\'erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409 })))
    await expect(
      handlers.get('seller-order-status')!({ merchantId: 'm1', orderId: 'o1', status: 'confirmed', clientId: 'c5' })
    ).resolves.toBeUndefined()
  })

  it('404 (commande jamais créée serveur) = rejet DÉFINITIF même pour les handlers tolérants 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(
      handlers.get('marketplace-order-cancel')!({ orderId: 'o1', action: 'cancel', reason: 'r', clientId: 'c4' })
    ).rejects.toBeInstanceOf(SyncConflictError)
    await expect(
      handlers.get('seller-order-status')!({ merchantId: 'm1', orderId: 'o1', status: 'confirmed', clientId: 'c5' })
    ).rejects.toBeInstanceOf(SyncConflictError)
  })

  // ── Transitoire (l'entrée reste en file) ────────────────────────────
  it('5xx = erreur TRANSITOIRE (Error simple, pas un conflit)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    await expect(
      handlers.get('marketplace-order')!({ merchantId: 'm1', clientId: 'c1' })
    ).rejects.toThrow(/Erreur serveur 503/)
  })

  it('réseau indisponible = erreur TRANSITOIRE (pas un conflit, pas une session)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(
      handlers.get('seller-order-status')!({ merchantId: 'm1', orderId: 'o1', status: 'ready', clientId: 'c5' })
    ).rejects.toThrow('Réseau indisponible')
  })
})
