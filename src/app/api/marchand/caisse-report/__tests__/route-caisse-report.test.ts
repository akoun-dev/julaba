import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-945 (AUDIT-003 D-1) — route du rapport de session de marché :
// auth appareil (requireDeviceOwner 400/401/403 AVANT toute lecture),
// agrégation des FAITS serveur (totaux, par point de vente résolu
// MODE-908, top produits), session sans vente = zéros honnêtes (jamais
// une erreur), borne de lecture annoncée dans la réponse.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { requireDeviceOwner } from '@/lib/require-owner'
import { GET } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()
const fromMock = vi.fn()
const fromCalls: Array<{ table: string; filters: Array<[string, string]> }> = []

function makeBuilder(config: TableConfig) {
  const filters: Array<[string, string]> = []
  const listPromise = Promise.resolve({ data: config.rows ?? [], error: config.error ?? null })
  const builder: Record<string, unknown> = {
    filters,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, String(val)])
      return builder
    },
    in: (col: string, vals: unknown[]) => {
      filters.push([col, vals.map(String).join('|')])
      return builder
    },
    order: () => builder,
    limit: () => builder,
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

beforeEach(() => {
  tables.clear()
  fromCalls.length = 0
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    const builder = makeBuilder(tables.get(table) ?? {})
    fromCalls.push({ table, filters: builder.filters as Array<[string, string]> })
    return builder
  })
  vi.mocked(requireDeviceOwner).mockImplementation(async () => null)
})

function getRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/marchand/caisse-report${query}`)
}

const VENTES: Row[] = [
  { id: 'v1', total_amount: 1000, amount_received: 1000, is_voice_sale: false, selling_point_client_id: 'pt-1' },
  { id: 'v2', total_amount: 2500, amount_received: 3000, is_voice_sale: true, selling_point_client_id: null },
  { id: 'v3', total_amount: 1500, amount_received: 1500, is_voice_sale: false, selling_point_client_id: 'pt-inconnu' },
]

const POINTS: Row[] = [{ id: 'pt-1', name: 'Marché de Cocody' }]

const ITEMS: Row[] = [
  { product_name: 'Riz', quantity: 2, subtotal: 1500 },
  { product_name: 'Huile', quantity: 1, subtotal: 2000 },
  { product_name: 'Riz', quantity: 1, subtotal: 750 },
]

describe('GET /api/marchand/caisse-report (MODE-945)', () => {
  it('refuse une requête sans sessionId (400, avant toute lecture)', async () => {
    const res = await GET(getRequest('?merchantId=m1'))
    expect(res.status).toBe(400)
    expect(fromCalls).toHaveLength(0)
  })

  it('refuse un sessionId excessif (400, avant toute lecture)', async () => {
    const res = await GET(getRequest(`?merchantId=m1&sessionId=${'x'.repeat(101)}`))
    expect(res.status).toBe(400)
    expect(fromCalls).toHaveLength(0)
  })

  it('laisse requireDeviceOwner répondre 401/403 (session appareil / ressource étrangère)', async () => {
    vi.mocked(requireDeviceOwner).mockImplementation(async () =>
      NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    )
    const res = await GET(getRequest('?merchantId=m1&sessionId=s1'))
    expect(res.status).toBe(401)
    expect(fromCalls).toHaveLength(0)
  })

  it('filtre bien le grand livre sur merchant_id ET session_id', async () => {
    tables.set('legacy_sales', { rows: [] })
    tables.set('merchant_selling_points', { rows: [] })
    tables.set('legacy_sale_items', { rows: [] })
    await GET(getRequest('?merchantId=m1&sessionId=s1'))
    const vente = fromCalls.find((c) => c.table === 'legacy_sales')
    expect(vente?.filters).toContainEqual(['merchant_id', 'm1'])
    expect(vente?.filters).toContainEqual(['session_id', 's1'])
  })

  it('agrège les faits serveur : totaux, points résolus, top produits', async () => {
    tables.set('legacy_sales', { rows: VENTES })
    tables.set('merchant_selling_points', { rows: POINTS })
    tables.set('legacy_sale_items', { rows: ITEMS })

    const res = await GET(getRequest('?merchantId=m1&sessionId=s1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.totaux).toEqual({ ventes: 3, totalMontant: 5000, totalRecu: 5500, ventesVocales: 1 })

    // Points : pt-1 résolu par son nom, point inconnu dit tel quel,
    // vente sans point listée « Point non précisé » (jamais inventée).
    const noms = body.parPoint.map((p: { nom: string }) => p.nom)
    expect(noms).toContain('Marché de Cocody')
    expect(noms).toContain('Point inconnu')
    expect(noms).toContain('Point non précisé')
    const cocody = body.parPoint.find((p: { nom: string }) => p.nom === 'Marché de Cocody')
    expect(cocody).toMatchObject({ ventes: 1, total: 1000 })

    // Top produits : agrégation par nom (Riz = 2+1 = 3 pour 2250), tri par total.
    expect(body.topProduits[0]).toEqual({ nom: 'Riz', quantite: 3, total: 2250 })
    expect(body.topProduits[1]).toEqual({ nom: 'Huile', quantite: 1, total: 2000 })
    expect(body.sessionId).toBe('s1')
    expect(typeof body.generatedAt).toBe('string')
    expect(body.borne).toBeUndefined()
  })

  it('une session sans vente = zéros honnêtes (pas une erreur)', async () => {
    tables.set('legacy_sales', { rows: [] })
    tables.set('legacy_sale_items', { rows: [] })
    const res = await GET(getRequest('?merchantId=m1&sessionId=vide'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totaux).toEqual({ ventes: 0, totalMontant: 0, totalRecu: 0, ventesVocales: 0 })
    expect(body.parPoint).toEqual([])
    expect(body.topProduits).toEqual([])
  })

  it('une erreur de lecture du grand livre reste un 500 parlé', async () => {
    tables.set('legacy_sales', { rows: [], error: { code: 'XX000', message: 'boom' } })
    const res = await GET(getRequest('?merchantId=m1&sessionId=s1'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.erreur).toBe('Rapport indisponible')
  })

  it('une erreur de lecture des produits n\u2019invalide pas les totaux ventes', async () => {
    tables.set('legacy_sales', { rows: VENTES })
    tables.set('merchant_selling_points', { rows: POINTS })
    tables.set('legacy_sale_items', { rows: [], error: { code: 'XX000', message: 'boom' } })
    const res = await GET(getRequest('?merchantId=m1&sessionId=s1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totaux.ventes).toBe(3)
    expect(body.topProduits).toEqual([])
  })
})
