import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-908 (§18) — étiquetage des ventes par point de vente : la route
// ventes accepte sellingPointClientId + sellingPointName (snapshot),
// résout le client_id en merchant_selling_points.id et l'écrit dans
// l'insert legacy SEULEMENT si résolu (jamais de vente bloquée, payload
// historique identique sinon). La RPC merchant_record_sale n'est PAS
// modifiée (même écart documenté A1 que payment_method).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

const recordSaleMock = vi.fn()
const parseStockRpcErrorMock = vi.fn()
vi.mock('@/lib/stock/stock-service', () => ({
  operationUuid: (clientId: string) => `00000000-0000-4000-8000-${clientId.replace(/[^a-z0-9]/gi, '').slice(0, 12).padStart(12, '0')}`,
  recordSaleViaRpc: (...args: unknown[]) => recordSaleMock(...args),
  parseStockRpcError: (...args: unknown[]) => parseStockRpcErrorMock(...args),
}))

import { createSaleSchema } from '@/lib/validation/marchand'
import { POST } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  /** FIFO : résultats consommés par chaque appel .single() (pré-check puis insert). */
  singleSequence?: Array<{ data: Row | null; error?: { code?: string; message?: string } | null }>
  single?: Row | null
  maybeSingle?: Row | null
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()

function makeBuilder(config: TableConfig) {
  const filters: Array<[string, string]> = []
  const inserts: Row[] = []
  const listPromise = Promise.resolve({ data: config.rows ?? [], error: config.error ?? null })
  const builder: Record<string, unknown> = {
    filters,
    inserts,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, String(val)])
      return builder
    },
    order: () => builder,
    limit: () => builder,
    in: () => Promise.resolve({ data: config.rows ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: config.maybeSingle ?? null, error: config.error ?? null }),
    single: () => {
      if (config.singleSequence && config.singleSequence.length > 0) {
        return Promise.resolve(config.singleSequence.shift() ?? { data: null, error: null })
      }
      return Promise.resolve({ data: config.single ?? null, error: config.error ?? null })
    },
    insert: (row: Row) => {
      inserts.push(row)
      return builder
    },
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

const fromMock = vi.fn()
/** Journal des appels from() : { table, builder } — pour retrouver les builders par table. */
const fromCalls: Array<{ table: string; builder: Record<string, unknown> }> = []

beforeEach(() => {
  tables.clear()
  fromCalls.length = 0
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    const config = tables.get(table) ?? {}
    const builder = makeBuilder(config)
    fromCalls.push({ table, builder })
    return builder
  })
  recordSaleMock.mockReset()
  recordSaleMock.mockResolvedValue({ rpcMissing: true }) // repli legacy par défaut
  parseStockRpcErrorMock.mockReset()
})

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const SALE_ROW: Row = {
  id: 'sale-1',
  merchant_id: 'm1',
  client_id: 'sale-1737-abc123',
  total_amount: 1000,
  amount_received: 1000,
  change_amount: 0,
  is_voice_sale: false,
  voice_transcript: null,
  note: null,
  created_at: '2026-09-19T10:00:00.000Z',
  updated_at: '2026-09-19T10:00:00.000Z',
}

const ITEM_ROW: Row = {
  id: 'item-1',
  sale_id: 'sale-1',
  product_name: 'tomates',
  quantity: 2,
  unit_price: 500,
  subtotal: 1000,
  product_id: null,
  created_at: '2026-09-19T10:00:00.000Z',
  updated_at: '2026-09-19T10:00:00.000Z',
}

const BASE_PAYLOAD = {
  merchantId: 'm1',
  clientId: 'sale-1737-abc123',
  items: [{ productName: 'tomates', quantity: 2, unitPrice: 500 }],
  amountReceived: 1000,
}

const POINT_CLIENT_ID = '0f1e2d3c-4b5a-4948-8787-aabbccddeeff'

/** Scénario legacy complet : pré-check null → (résolution point) → insert sale → insert items → relecture items.
 * Ordre des builders : 0 legacy_sales (pré-check), 1 merchant_selling_points (résolution), 2 legacy_sales (insert),
 * 3 legacy_sale_items (insert), 4 legacy_sale_items (relecture). */
function legacySaleTables(sellingPointRow: Row | null) {
  tables.set('legacy_sales', {
    singleSequence: [
      { data: null }, // pré-check client_id : vente inconnue
      { data: SALE_ROW }, // insert … select … single
    ],
  })
  tables.set('legacy_sale_items', { rows: [ITEM_ROW] })
  tables.set('merchant_selling_points', { maybeSingle: sellingPointRow })
}

/** Builder legacy_sales ayant porté l'insert de la vente (un from() par requête). */
function legacySalesBuilder(): { inserts: Row[] } {
  const builder = fromCalls
    .filter((c) => c.table === 'legacy_sales')
    .map((c) => c.builder as { inserts: Row[] })
    .find((b) => b.inserts.length > 0)
  expect(builder).toBeDefined()
  return builder!
}

/** Builder merchant_selling_points : la résolution client_id → id (absent sans étiquette). */
function sellingPointsBuilder(): { filters: Array<[string, string]> } {
  const call = fromCalls.find((c) => c.table === 'merchant_selling_points')
  expect(call).toBeDefined()
  return call!.builder as { filters: Array<[string, string]> }
}

describe('createSaleSchema — étiquette point de vente (MODE-908)', () => {
  it('accepte sellingPointClientId (min 8) et sellingPointName (2-60)', () => {
    const parsed = createSaleSchema.safeParse({
      ...BASE_PAYLOAD,
      sellingPointClientId: POINT_CLIENT_ID,
      sellingPointName: 'Marché Treichville',
    })
    expect(parsed.success).toBe(true)
  })

  it('reste valable sans étiquette (payload historique identique) et refuse les valeurs trop courtes', () => {
    expect(createSaleSchema.safeParse(BASE_PAYLOAD).success).toBe(true)
    expect(createSaleSchema.safeParse({ ...BASE_PAYLOAD, sellingPointClientId: 'court' }).success).toBe(false)
    expect(createSaleSchema.safeParse({ ...BASE_PAYLOAD, sellingPointName: 'A' }).success).toBe(false)
  })
})

describe('POST /api/marchand/sales — résolution du point de vente (MODE-908, chemin legacy)', () => {
  it('sellingPointClientId résolu → legacy insert avec selling_point_client_id = merchant_selling_points.id', async () => {
    legacySaleTables({ id: 'msp-1' })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      sellingPointClientId: POINT_CLIENT_ID,
      sellingPointName: 'Marché Treichville',
    }))
    expect(res.status).toBe(201)

    // L'insert legacy porte l'ID RÉSOLU (pas le client_id brut).
    expect(legacySalesBuilder().inserts[0]).toMatchObject({ selling_point_client_id: 'msp-1' })
    // La résolution est scoppée au client_id envoyé par l'appareil.
    expect(sellingPointsBuilder().filters).toContainEqual(['client_id', POINT_CLIENT_ID])
  })

  it('sans étiquette → legacy insert SANS la clé selling_point_client_id (payload historique)', async () => {
    legacySaleTables(null)

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(201)
    expect(legacySalesBuilder().inserts[0]).not.toHaveProperty('selling_point_client_id')
  })

  it('point inconnu du serveur → vente enregistrée quand même (jamais bloquée), colonne absente', async () => {
    legacySaleTables(null)

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      sellingPointClientId: POINT_CLIENT_ID,
      sellingPointName: 'Point jamais synchronisé',
    }))
    expect(res.status).toBe(201)
    expect(legacySalesBuilder().inserts[0]).not.toHaveProperty('selling_point_client_id')
  })

  it('table points de vente non migrée (42P01) → vente enregistrée quand même, colonne absente', async () => {
    tables.set('legacy_sales', {
      singleSequence: [
        { data: null },
        { data: SALE_ROW },
      ],
    })
    tables.set('legacy_sale_items', { rows: [ITEM_ROW] })
    tables.set('merchant_selling_points', { maybeSingle: null, error: { code: '42P01', message: 'relation does not exist' } })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      sellingPointClientId: POINT_CLIENT_ID,
    }))
    expect(res.status).toBe(201)
    expect(legacySalesBuilder().inserts[0]).not.toHaveProperty('selling_point_client_id')
  })

  it('chemin RPC (bascule stock) : l’étiquette n’est PAS passée à la RPC (non modifiée — écart A1 documenté)', async () => {
    recordSaleMock.mockResolvedValue({
      ok: true,
      data: { created: true, sale: SALE_ROW },
    })
    tables.set('legacy_sale_items', { rows: [ITEM_ROW] })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      sellingPointClientId: POINT_CLIENT_ID,
      sellingPointName: 'Marché Treichville',
    }))
    expect(res.status).toBe(201)
    expect(recordSaleMock).toHaveBeenCalledTimes(1)
    const params = recordSaleMock.mock.calls[0][1] as Record<string, unknown>
    expect(params.sellingPointClientId).toBeUndefined()
    expect(params.sellingPointName).toBeUndefined()
    expect(params.selling_point_client_id).toBeUndefined()
  })
})
