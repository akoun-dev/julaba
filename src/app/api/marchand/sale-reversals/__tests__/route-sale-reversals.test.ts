import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-909 (§28) — route d'annulation de vente : opération INVERSE
// append-only (jamais de DELETE/UPDATE de la vente). Chemin principal =
// RPC merchant_reverse_sale (verrou vente FOR UPDATE, idempotence
// (merchant_id, operation_id), refus 22023 « Vente introuvable »). Repli
// PGRST202 (migrations non poussées) : insert reversal non transactionnel +
// mouvements CUSTOMER_RETURN best-effort via merchant_record_movement (skip
// stock avec note honnête si indisponible). 42P01 → 503 transitoire.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { createSaleReversalSchema } from '@/lib/validation/marchand'
import { deriveOperationUuid } from '@/lib/stock/stock-service'
import { POST } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  single?: Row | null
  maybeSingle?: Row | null
  /** FIFO : résultats consommés par chaque appel .maybeSingle(). */
  maybeSingleSequence?: Array<Row | null>
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()
const rpcMock = vi.fn()

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
    maybeSingle: () => {
      if (config.maybeSingleSequence && config.maybeSingleSequence.length > 0) {
        return Promise.resolve({ data: config.maybeSingleSequence.shift() ?? null, error: null })
      }
      return Promise.resolve({ data: config.maybeSingle ?? null, error: null })
    },
    single: () => Promise.resolve({ data: config.single ?? null, error: null }),
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
const fromCalls: Array<{ table: string; builder: Record<string, unknown> }> = []

beforeEach(() => {
  tables.clear()
  fromCalls.length = 0
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    const builder = makeBuilder(tables.get(table) ?? {})
    fromCalls.push({ table, builder })
    return builder
  })
  rpcMock.mockReset()
})

function buildersOf(table: string): Array<Record<string, unknown>> {
  return fromCalls.filter((c) => c.table === table).map((c) => c.builder)
}

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/sale-reversals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const CLIENT_ID = '0f1e2d3c-4b5a-4948-8787-aabbccddeeff'
const BASE_PAYLOAD = {
  merchantId: 'm1',
  clientId: CLIENT_ID,
  saleClientId: 'sale-1737-abc123',
  reason: 'Erreur de prix',
}

describe('createSaleReversalSchema — contrat payload (MODE-909)', () => {
  it('accepte un payload complet et nettoie la raison (trim)', () => {
    const parsed = createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, reason: '  Erreur de prix  ' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.reason).toBe('Erreur de prix')
  })

  it('refuse clientId/saleClientId trop courts et la raison hors bornes (3-200)', () => {
    expect(createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, clientId: 'court' }).success).toBe(false)
    expect(createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, saleClientId: 'court' }).success).toBe(false)
    expect(createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, reason: 'ok' }).success).toBe(false)
    expect(createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, reason: '  ' }).success).toBe(false)
    expect(createSaleReversalSchema.safeParse({ ...BASE_PAYLOAD, reason: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('POST /api/marchand/sale-reversals — chemin RPC (MODE-909)', () => {
  it('RPC created → 201, params exacts (operation_id dérivé du clientId, raison nettoyée)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { operation_id: CLIENT_ID, sale_client_id: BASE_PAYLOAD.saleClientId, items_returned: 2, created: true },
      error: null,
    })

    const res = await POST(postRequest({ ...BASE_PAYLOAD, reason: '  Erreur de prix  ' }))
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('merchant_reverse_sale')
    expect(params).toMatchObject({
      p_merchant_id: 'm1',
      p_operation_id: CLIENT_ID,
      p_sale_client_id: 'sale-1737-abc123',
      p_reason: 'Erreur de prix',
    })
    const body = await res.json()
    expect(body).toMatchObject({ operationId: CLIENT_ID, saleClientId: BASE_PAYLOAD.saleClientId, itemsReturned: 2, created: true })
  })

  it('rejeu offline (RPC created:false) → 200 idempotent, jamais une erreur', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { operation_id: CLIENT_ID, sale_client_id: BASE_PAYLOAD.saleClientId, items_returned: 2, created: false },
      error: null,
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(false)
  })

  it('vente introuvable (22023 « Vente introuvable ») → 422 honnête', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Vente introuvable' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.erreur).toMatch(/introuvable/i)
  })

  it('table non migrée (42P01) → 503 transitoire : l’entrée reste en file offline', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'relation does not exist' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(503)
  })

  it('payload invalide (zod) → 400 avec erreur lisible', async () => {
    const res = await POST(postRequest({ ...BASE_PAYLOAD, reason: 'ok' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.erreur).toBe('string')
  })
})

describe('POST /api/marchand/sale-reversals — repli PGRST202 (RPC absente)', () => {
  const SALE_ROW: Row = { id: 'sale-uuid-1', merchant_id: 'm1', client_id: BASE_PAYLOAD.saleClientId, total_amount: 2000 }

  function stubRepliTables(items: Row[] = [], balances: Array<Row | null> = []) {
    tables.set('legacy_sales', { maybeSingle: SALE_ROW })
    tables.set('merchant_sale_reversals', {})
    tables.set('legacy_sale_items', { rows: items })
    tables.set('merchant_stock_balances', { maybeSingleSequence: balances })
  }

  it('vente connue + RPC mouvement indisponible → insert append-only + 201 avec note honnête (stock skip)', async () => {
    // Un article suivi : la route TENTE le mouvement (PGRST202) puis skip le
    // stock avec une note — l'annulation (le fait métier) reste enregistrée.
    stubRepliTables(
      [{ id: 'it1', sale_id: 'sale-uuid-1', product_id: 'p1', product_name: 'tomates', quantity: 2, unit_price: 1000, subtotal: 2000 }],
      [{ product_id: 'p1', stock_precision: 'EXACT' }],
    )
    rpcMock.mockImplementation(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(201)
    const insertBuilder = buildersOf('merchant_sale_reversals').find((b) => (b as { inserts: Row[] }).inserts.length > 0) as { inserts: Row[] }
    expect(insertBuilder).toBeDefined()
    expect(insertBuilder.inserts[0]).toMatchObject({
      merchant_id: 'm1',
      operation_id: CLIENT_ID,
      sale_client_id: BASE_PAYLOAD.saleClientId,
      reason: 'Erreur de prix',
    })
    const body = await res.json()
    expect(body.created).toBe(true)
    expect(body.itemsReturned).toBe(0)
    expect(String(body.note)).toMatch(/stock/i)
  })

  it('vente inconnue → 422 « Vente introuvable », AUCUN insert (l’historique reste intact)', async () => {
    tables.set('legacy_sales', { maybeSingle: null })
    tables.set('merchant_sale_reversals', {})
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(422)
    expect(buildersOf('merchant_sale_reversals').some((b) => (b as { inserts: Row[] }).inserts.length > 0)).toBe(false)
  })

  it('vente déjà annulée (reversal trouvée) → 200 idempotent sans refaire (aucun second insert)', async () => {
    tables.set('legacy_sales', { maybeSingle: SALE_ROW })
    tables.set('merchant_sale_reversals', {
      maybeSingle: { operation_id: '00000000-0000-4000-8000-000000000001', sale_client_id: BASE_PAYLOAD.saleClientId },
    })
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(false)
    expect(buildersOf('merchant_sale_reversals').some((b) => (b as { inserts: Row[] }).inserts.length > 0)).toBe(false)
  })

  it('course concurrente 23505 → relecture → 200 idempotent', async () => {
    tables.set('legacy_sales', { maybeSingle: SALE_ROW })
    tables.set('merchant_sale_reversals', {
      // FIFO : pré-check par vente (null) + pré-check par operation_id (null)
      // puis insert 23505 puis relecture de l'annulation déjà enregistrée.
      maybeSingleSequence: [
        null,
        null,
        { operation_id: '00000000-0000-4000-8000-000000000002', sale_client_id: BASE_PAYLOAD.saleClientId },
      ],
      error: { code: '23505', message: 'duplicate key' },
    })
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(false)
    expect(body.operationId).toBe('00000000-0000-4000-8000-000000000002')
  })

  it('table merchant_sale_reversals absente (42P01) → 503 transitoire', async () => {
    tables.set('legacy_sales', { maybeSingle: SALE_ROW })
    tables.set('merchant_sale_reversals', { error: { code: '42P01', message: 'relation does not exist' } })
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(503)
  })

  it('stock : un mouvement CUSTOMER_RETURN par item SUIVI (operation_id dérivé déterministe), non suivi ignoré', async () => {
    stubRepliTables(
      [
        { id: 'it1', sale_id: 'sale-uuid-1', product_id: 'p1', product_name: 'tomates', quantity: 2, unit_price: 1000, subtotal: 2000 },
        { id: 'it2', sale_id: 'sale-uuid-1', product_id: 'p2', product_name: 'riz', quantity: 1, unit_price: 500, subtotal: 500 },
        { id: 'it3', sale_id: 'sale-uuid-1', product_id: null, product_name: 'ligne libre', quantity: 1, unit_price: 300, subtotal: 300 },
      ],
      [
        { product_id: 'p1', stock_precision: 'EXACT' },
        { product_id: 'p2', stock_precision: 'UNKNOWN' },
        null,
      ],
    )
    const movementCalls: Array<Record<string, unknown>> = []
    rpcMock.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === 'merchant_reverse_sale') {
        return { data: null, error: { code: 'PGRST202', message: 'x' } }
      }
      movementCalls.push(params)
      return { data: { created: true }, error: null }
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(201)
    // Un seul mouvement : p1 est suivi (EXACT), p2 est UNKNOWN (le marchand
    // n'a jamais compté ce stock — on ne crée pas un stock qu'il n'a pas
    // compté), la ligne libre n'a pas de produit.
    expect(movementCalls).toHaveLength(1)
    expect(movementCalls[0]).toMatchObject({
      p_product_id: 'p1',
      p_movement_type: 'CUSTOMER_RETURN',
      p_quantity_base: 2,
      p_reference_type: 'sale_reversal',
      p_reference_id: BASE_PAYLOAD.saleClientId,
    })
    // operation_id DÉRIVÉ de façon déterministe (même formule que la RPC SQL).
    expect(movementCalls[0].p_operation_id).toBe(deriveOperationUuid(CLIENT_ID, 'reversal', 'p1'))
    const body = await res.json()
    expect(body.itemsReturned).toBe(1)
    expect(body.note).toBeUndefined()
  })

  it('idempotence du repli : le même payload rejoué dérive le MÊME operation_id de mouvement', async () => {
    tables.set('legacy_sales', { maybeSingle: SALE_ROW })
    tables.set('merchant_sale_reversals', {})
    tables.set('legacy_sale_items', {
      rows: [{ id: 'it1', sale_id: 'sale-uuid-1', product_id: 'p1', product_name: 'tomates', quantity: 2, unit_price: 1000, subtotal: 2000 }],
    })
    // maybeSingle STATIQUE : chaque rejeu relit la même balance EXACT.
    tables.set('merchant_stock_balances', { maybeSingle: { product_id: 'p1', stock_precision: 'EXACT' } })
    rpcMock.mockImplementation(async (fn: string) =>
      fn === 'merchant_reverse_sale'
        ? { data: null, error: { code: 'PGRST202', message: 'x' } }
        : { data: { created: true }, error: null },
    )

    await POST(postRequest(BASE_PAYLOAD))
    await POST(postRequest(BASE_PAYLOAD))

    const movementParams = rpcMock.mock.calls
      .filter(([fn]) => fn === 'merchant_record_movement')
      .map(([, params]) => params as Record<string, unknown>)
    expect(movementParams).toHaveLength(2)
    expect(movementParams[0].p_operation_id).toBe(movementParams[1].p_operation_id)
  })
})
