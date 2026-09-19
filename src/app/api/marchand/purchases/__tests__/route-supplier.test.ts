import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-907 (§15) — résolution du fournisseur dans la route achats : le
// client envoie supplierClientId (client_id du partenaire), la route le
// résout en business_partners.id et passe p_supplier_id à la RPC.
// Création à la volée si supplierName, 422 « Fournisseur inconnu » sinon.
// Les dépendances réseau/base/RPC sont simulées : on teste la LOGIQUE de
// résolution, pas Supabase.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

const recordPurchaseMock = vi.fn()
vi.mock('@/lib/stock/stock-service', () => ({
  operationUuid: (clientId: string) => `00000000-0000-4000-8000-${clientId.replace(/[^a-z0-9]/gi, '').slice(0, 12).padStart(12, '0')}`,
  recordPurchaseViaRpc: (...args: unknown[]) => recordPurchaseMock(...args),
}))

import { createPurchaseSchema } from '@/lib/validation/marchand'
import { GET, POST } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  /** Lignes renvoyées par un await direct du builder (select en liste). */
  rows?: Row[]
  /** Ligne renvoyée par .single() (insert…select…single). */
  single?: Row | null
  /** Ligne renvoyée par .maybeSingle() (lecture optionnelle). */
  maybeSingle?: Row | null
  /** Erreur renvoyée par les terminaisons. */
  error?: { code?: string; message?: string } | null
  /** Lignes renvoyées par .in(...) (sous-requête lignes d'achat). */
  inRows?: Row[]
}

const tables = new Map<string, TableConfig>()

/** Builder Supabase simulé : enchaîne les filtres, résout selon la config. */
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
    in: () => Promise.resolve({ data: config.inRows ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: config.maybeSingle ?? null, error: config.error ?? null }),
    single: () => Promise.resolve({ data: config.single ?? null, error: config.error ?? null }),
    insert: () => builder,
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

const fromMock = vi.fn()

beforeEach(() => {
  tables.clear()
  fromMock.mockReset()
  fromMock.mockImplementation((table: string) => {
    const config = tables.get(table) ?? {}
    return makeBuilder(config)
  })
  recordPurchaseMock.mockReset()
  recordPurchaseMock.mockResolvedValue({
    ok: true,
    data: {
      created: true,
      purchase: {
        id: 'p-1',
        merchant_id: 'm1',
        client_id: '00000000-0000-4000-8000-000000000000',
        supplier_id: 'bp-1',
        session_id: null,
        total_amount: 15000,
        amount_paid: 15000,
        note: null,
        created_at: '2026-09-19T10:00:00.000Z',
      },
      items: [],
      expense_id: null,
    },
  })
})

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/purchases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function getRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/marchand/purchases?merchantId=m1${query}`)
}

const BASE_PAYLOAD = {
  merchantId: 'm1',
  items: [{ productName: 'tomates', quantity: 20, unitCostCfa: 750, quantityBase: 20 }],
  amountPaid: 15000,
  clientId: 'achat-1737-abc123',
}

describe('createPurchaseSchema — champs fournisseur (MODE-907)', () => {
  it('accepte supplierClientId (min 8) et supplierName (min 2)', () => {
    const parsed = createPurchaseSchema.safeParse({
      ...BASE_PAYLOAD,
      supplierClientId: 'partner-1737-abc123',
      supplierName: 'Koné',
    })
    expect(parsed.success).toBe(true)
  })

  it('reste valable sans aucun champ fournisseur (compat)', () => {
    expect(createPurchaseSchema.safeParse(BASE_PAYLOAD).success).toBe(true)
  })

  it('refuse un supplierClientId trop court et un supplierName trop court', () => {
    expect(createPurchaseSchema.safeParse({ ...BASE_PAYLOAD, supplierClientId: 'court' }).success).toBe(false)
    expect(createPurchaseSchema.safeParse({ ...BASE_PAYLOAD, supplierName: 'K' }).success).toBe(false)
  })
})

describe('POST /api/marchand/purchases — résolution du fournisseur (MODE-907)', () => {
  it('supplierClientId connu → résolu en business_partners.id et passé à la RPC', async () => {
    tables.set('business_partners', { maybeSingle: { id: 'bp-1' } })

    const res = await POST(postRequest({ ...BASE_PAYLOAD, supplierClientId: 'partner-1737-abc123' }))
    expect(res.status).toBe(201)

    expect(recordPurchaseMock).toHaveBeenCalledTimes(1)
    const params = recordPurchaseMock.mock.calls[0][1] as Record<string, unknown>
    expect(params.supplierId).toBe('bp-1')
  })

  it('supplierId direct reste accepté sans requête business_partners (compat)', async () => {
    const res = await POST(postRequest({ ...BASE_PAYLOAD, supplierId: 'bp-direct' }))
    expect(res.status).toBe(201)
    const params = recordPurchaseMock.mock.calls[0][1] as Record<string, unknown>
    expect(params.supplierId).toBe('bp-direct')
  })

  it('supplierClientId inconnu + supplierName → fournisseur créé à la volée (kind fournisseur)', async () => {
    const insertPayloads: Row[] = []
    tables.set('business_partners', {
      maybeSingle: null,
      single: { id: 'bp-new' },
    })
    fromMock.mockImplementation((table: string) => {
      const config = tables.get(table) ?? {}
      const builder = makeBuilder(config)
      builder.insert = (row: Row) => {
        insertPayloads.push(row)
        return builder
      }
      return builder
    })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      supplierClientId: 'partner-1737-abc123',
      supplierName: 'Koné',
    }))
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      merchant_id: 'm1',
      client_id: 'partner-1737-abc123',
      kind: 'fournisseur',
      name: 'Koné',
    })
    const params = recordPurchaseMock.mock.calls[0][1] as Record<string, unknown>
    expect(params.supplierId).toBe('bp-new')
  })

  it('supplierClientId inconnu sans supplierName → 422 « Fournisseur inconnu », RPC jamais appelée', async () => {
    tables.set('business_partners', { maybeSingle: null })

    const res = await POST(postRequest({ ...BASE_PAYLOAD, supplierClientId: 'partner-1737-abc123' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.erreur).toBe('Fournisseur inconnu')
    expect(recordPurchaseMock).not.toHaveBeenCalled()
  })

  it('course 23505 à la création → relecture par client_id → RPC quand même', async () => {
    tables.set('business_partners', {
      maybeSingle: { id: 'bp-reread' },
      single: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      supplierClientId: 'partner-1737-abc123',
      supplierName: 'Koné',
    }))
    expect(res.status).toBe(201)
    const params = recordPurchaseMock.mock.calls[0][1] as Record<string, unknown>
    expect(params.supplierId).toBe('bp-reread')
  })

  it('table partenaires non migrée (42P01) avec supplierName → 503 transitoire', async () => {
    tables.set('business_partners', {
      maybeSingle: null,
      single: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const res = await POST(postRequest({
      ...BASE_PAYLOAD,
      supplierClientId: 'partner-1737-abc123',
      supplierName: 'Koné',
    }))
    expect(res.status).toBe(503)
    expect(recordPurchaseMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/marchand/purchases — filtre par fournisseur (MODE-907)', () => {
  it('?supplierId= filtre l\'historique sur ce fournisseur', async () => {
    tables.set('merchant_purchases', {
      rows: [{ id: 'p-1', merchant_id: 'm1', supplier_id: 'bp-1', total_amount: 15000, amount_paid: 15000, created_at: '2026-09-19T10:00:00.000Z' }],
    })
    tables.set('merchant_purchase_items', {
      inRows: [{ id: 'i-1', purchase_id: 'p-1', product_name: 'tomates', quantity: 20, line_cost_cfa: 15000 }],
    })

    const res = await GET(getRequest('&supplierId=bp-1'))
    expect(res.status).toBe(200)
    const purchasesBuilder = fromMock.mock.results[0]?.value as { filters: Array<[string, string]> }
    expect(purchasesBuilder.filters).toContainEqual(['supplier_id', 'bp-1'])
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.purchases[0].supplierId).toBe('bp-1')
  })

  it('?supplierClientId= est résolu en id puis filtré', async () => {
    tables.set('business_partners', { maybeSingle: { id: 'bp-1' } })
    tables.set('merchant_purchases', { rows: [] })

    const res = await GET(getRequest('&supplierClientId=partner-1737-abc123'))
    expect(res.status).toBe(200)
    const purchasesBuilder = fromMock.mock.results[1]?.value as { filters: Array<[string, string]> }
    expect(purchasesBuilder.filters).toContainEqual(['supplier_id', 'bp-1'])
    const body = await res.json()
    expect(body.purchases).toEqual([])
    expect(body.count).toBe(0)
  })

  it('fournisseur jamais synchronisé → liste vide honnête (jamais tous les achats)', async () => {
    tables.set('business_partners', { maybeSingle: null })

    const res = await GET(getRequest('&supplierClientId=partner-inconnu-99'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purchases).toEqual([])
    expect(body.count).toBe(0)
  })

  it('sans filtre fournisseur : historique complet (comportement historique)', async () => {
    tables.set('merchant_purchases', { rows: [] })

    const res = await GET(getRequest(''))
    expect(res.status).toBe(200)
    const purchasesBuilder = fromMock.mock.results[0]?.value as { filters: Array<[string, string]> }
    expect(purchasesBuilder.filters.some(([col]) => col === 'supplier_id')).toBe(false)
  })
})
