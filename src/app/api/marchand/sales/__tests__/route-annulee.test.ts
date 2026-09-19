import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-909 (§28) — GET /api/marchand/sales : chaque vente est enrichie
// `annulee: boolean` (EXISTS une merchant_sale_reversals la ciblant). La
// LISTE garde toutes les ventes (historique intact — jamais de suppression)
// ; totalRevenue exclut les ventes annulées (revenu = ce qui est compté) et
// cancelledCount les compte. Table non migrée (42P01) → annulee:false
// partout, JAMAIS bloquant (compat avant/après migration).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { GET } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()

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
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lte: () => builder,
    in: () => Promise.resolve({ data: config.rows ?? [], error: null }),
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

const fromMock = vi.fn()

beforeEach(() => {
  tables.clear()
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => makeBuilder(tables.get(table) ?? {}))
})

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/marchand/sales?merchantId=m1')
}

const SALE_A: Row = {
  id: 'sale-a', merchant_id: 'm1', client_id: 'sale-1-annulee', total_amount: 2000,
  amount_received: 2000, change_amount: 0, is_voice_sale: false, voice_transcript: null,
  note: null, created_at: '2026-09-19T10:00:00.000Z', updated_at: '2026-09-19T10:00:00.000Z',
}
const SALE_B: Row = {
  id: 'sale-b', merchant_id: 'm1', client_id: 'sale-2-valide', total_amount: 5000,
  amount_received: 5000, change_amount: 0, is_voice_sale: false, voice_transcript: null,
  note: null, created_at: '2026-09-19T11:00:00.000Z', updated_at: '2026-09-19T11:00:00.000Z',
}

describe('GET /api/marchand/sales — enrichissement annulee (MODE-909, §28)', () => {
  it('marque annulee:true pour la vente ciblée par une reversal, false pour l’autre', async () => {
    tables.set('legacy_sales', { rows: [SALE_A, SALE_B] })
    tables.set('merchant_sale_reversals', { rows: [{ sale_client_id: 'sale-1-annulee' }] })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    const byId = new Map<string, { annulee: boolean; totalAmount: number }>(
      body.sales.map((s: { id: string; annulee: boolean; totalAmount: number }) => [s.id, s]),
    )
    expect(byId.get('sale-a')?.annulee).toBe(true)
    expect(byId.get('sale-b')?.annulee).toBe(false)
  })

  it('la LISTE garde toutes les ventes (historique intact) ; totalRevenue exclut l’annulée + cancelledCount', async () => {
    tables.set('legacy_sales', { rows: [SALE_A, SALE_B] })
    tables.set('merchant_sale_reversals', { rows: [{ sale_client_id: 'sale-1-annulee' }] })

    const res = await GET(getRequest())
    const body = await res.json()
    // Historique intact : les DEUX ventes sont renvoyées.
    expect(body.count).toBe(2)
    expect(body.sales).toHaveLength(2)
    // Revenu = ce qui est compté ; l'annulée est comptée à part.
    expect(body.totalRevenue).toBe(5000)
    expect(body.cancelledCount).toBe(1)
  })

  it('aucune annulation : annulee:false partout, cancelledCount 0', async () => {
    tables.set('legacy_sales', { rows: [SALE_A, SALE_B] })
    tables.set('merchant_sale_reversals', { rows: [] })

    const res = await GET(getRequest())
    const body = await res.json()
    expect(body.sales.every((s: { annulee: boolean }) => s.annulee === false)).toBe(true)
    expect(body.totalRevenue).toBe(7000)
    expect(body.cancelledCount).toBe(0)
  })

  it('table reversals non migrée (42P01) → 200 avec annulee:false (jamais bloquant)', async () => {
    tables.set('legacy_sales', { rows: [SALE_A, SALE_B] })
    tables.set('merchant_sale_reversals', { error: { code: '42P01', message: 'relation does not exist' } })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sales.every((s: { annulee: boolean }) => s.annulee === false)).toBe(true)
    expect(body.totalRevenue).toBe(7000)
    expect(body.cancelledCount).toBe(0)
  })
})
