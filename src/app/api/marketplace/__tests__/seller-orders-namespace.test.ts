import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * AUDIT-012 P1-1 — le vendeur marketplace est un MARCHAND :
 * marketplace_seller_profiles.merchant_id référence public.merchants et les
 * sessions appareil sont namespacées `merchant:<id>`. AVANT : les routes
 * seller-orders exigeaient un sujet `producteur:<id>` (jamais délivré par
 * /api/merchant/login) → le parcours vendeur était INDISPONIBLE malgré des
 * données correctes.
 * PATCH : la transition passe par la RPC transactionnelle
 * marketplace_seller_transition (migration 20260925100000) — plus aucune
 * écriture directe de marketplace_orders depuis la route.
 */

const { ownerMock, rpcMock, fromMock } = vi.hoisted(() => ({
  ownerMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))
const supabaseMock = {
  rpc: rpcMock,
  // Chaîne minimale : seller introuvable → GET répond { orders: [] } (200)
  // sans descendre plus loin — le cœur du test reste le namespace session.
  from: fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      }),
    }),
  })),
}

vi.mock('@/lib/require-owner', () => ({ requireDeviceOwner: ownerMock }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => supabaseMock }))

import { GET, PATCH } from '../seller-orders/route'

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init))
}

beforeEach(() => {
  ownerMock.mockReset().mockResolvedValue(null)
  rpcMock.mockReset().mockResolvedValue({ data: { order: { id: 'o-1', status: 'confirmed' } }, error: null })
})

describe('GET /api/marketplace/seller-orders — namespace vendeur', () => {
  it('exige le sujet merchant:<id> (PAS producteur) pour le merchantId demandé', async () => {
    const res = await GET(req('https://julaba.test/api/marketplace/seller-orders?merchantId=m-1'))
    expect(res.status).toBe(200)
    expect(ownerMock).toHaveBeenCalledTimes(1)
    const [r, type, id] = ownerMock.mock.calls[0]
    expect(type).toBe('merchant')
    expect(id).toBe('m-1')
    expect(r).toBeInstanceOf(NextRequest)
  })

  it('400 sans merchantId (avant même le contrôle de session)', async () => {
    const res = await GET(req('https://julaba.test/api/marketplace/seller-orders'))
    expect(res.status).toBe(400)
    expect(ownerMock).not.toHaveBeenCalled()
  })

  it('refus de session (Response) court-circuite la lecture', async () => {
    ownerMock.mockResolvedValue(new Response('{"erreur":"session"}', { status: 401 }))
    const res = await GET(req('https://julaba.test/api/marketplace/seller-orders?merchantId=m-1'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/marketplace/seller-orders — transition atomique', () => {
  it('exige aussi le sujet merchant:<id> en écriture', async () => {
    const request = req('https://julaba.test/api/marketplace/seller-orders', {
      method: 'PATCH',
      body: JSON.stringify({ merchantId: 'm-1', orderId: 'o-1', status: 'confirmed' }),
    })
    vi.spyOn(request, 'json').mockResolvedValue({ merchantId: 'm-1', orderId: 'o-1', status: 'confirmed' })
    await PATCH(request)
    const [r, type, id] = ownerMock.mock.calls[0]
    expect(type).toBe('merchant')
    expect(id).toBe('m-1')
  })

  it('délègue la transition à la RPC transactionnelle (jamais d\u2019update direct de marketplace_orders)', async () => {
    const request = req('https://julaba.test/api/marketplace/seller-orders', { method: 'PATCH' })
    vi.spyOn(request, 'json').mockResolvedValue({ merchantId: 'm-1', orderId: 'o-1', status: 'confirmed' })
    const res = await PATCH(request)
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('marketplace_seller_transition', {
      p_order_id: 'o-1',
      p_merchant_id: 'm-1',
      p_target_status: 'confirmed',
    })
  })

  it('400 si merchantId/orderId/status manquants', async () => {
    const request = req('https://julaba.test/api/marketplace/seller-orders', { method: 'PATCH' })
    vi.spyOn(request, 'json').mockResolvedValue({ merchantId: 'm-1' })
    const res = await PATCH(request)
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
