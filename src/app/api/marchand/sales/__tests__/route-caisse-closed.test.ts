import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-988 (audit Freebuff F-02 / MAR-CAI-002) — le serveur est l'AUTORITÉ
// de la clôture : POST /api/marchand/sales refuse 409 toute vente dont le
// sessionId pointe une session clôturée ou inconnue, AVANT toute écriture.
// Placement critique du garde : APRÈS le pré-check d'idempotence client_id
// → le replay offline d'une vente déjà enregistrée reste 200 (jamais de
// conflit de synchro cassé par une clôture intervenue entre-temps).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

const recordSaleMock = vi.fn()
vi.mock('@/lib/stock/stock-service', () => ({
  operationUuid: (clientId: string) => `00000000-0000-4000-8000-${clientId.replace(/[^a-z0-9]/gi, '').slice(0, 12).padStart(12, '0')}`,
  recordSaleViaRpc: (...args: unknown[]) => recordSaleMock(...args),
  parseStockRpcError: vi.fn(),
}))

import { POST } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  rows?: Row[]
  singleSequence?: Array<{ data: Row | null; error?: { code?: string; message?: string } | null }>
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()

function makeBuilder(config: TableConfig) {
  const listPromise = Promise.resolve({ data: config.rows ?? [], error: config.error ?? null })
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => listPromise,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => {
      if (config.singleSequence && config.singleSequence.length > 0) {
        return Promise.resolve(config.singleSequence.shift() ?? { data: null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
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
    const builder = makeBuilder(tables.get(table) ?? {})
    return builder
  })
  recordSaleMock.mockReset()
  recordSaleMock.mockResolvedValue({ rpcMissing: true })
})

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const PAYLOAD = {
  merchantId: 'm1',
  clientId: 'sale-1737-abc123',
  items: [{ productName: 'tomates', quantity: 2, unitPrice: 500 }],
  amountReceived: 1000,
}

const SALE_ROW: Row = {
  id: 'sale-1', merchant_id: 'm1', client_id: PAYLOAD.clientId, total_amount: 1000,
  amount_received: 1000, change_amount: 0, is_voice_sale: false, voice_transcript: null,
  note: null, created_at: '2026-09-23T10:00:00.000Z', updated_at: '2026-09-23T10:00:00.000Z',
}
const ITEM_ROW: Row = {
  id: 'item-1', sale_id: 'sale-1', product_name: 'tomates', quantity: 2,
  unit_price: 500, subtotal: 1000, product_id: null,
  created_at: '2026-09-23T10:00:00.000Z', updated_at: '2026-09-23T10:00:00.000Z',
}

/** Configuration legacy complète d'une vente qui PASSE : pré-check null,
 * insert → single, puis relecture des items. */
function legacySaleOk() {
  tables.set('legacy_sales', { singleSequence: [{ data: null }, { data: SALE_ROW }] })
  tables.set('legacy_sale_items', { rows: [ITEM_ROW] })
}

describe('POST /api/marchand/sales — garde caisse clôturée (MODE-988, F-02)', () => {
  it('sessionId pointant une session CLÔTURÉE (is_open=false) → 409 CAISSE_CLOSED, aucune écriture', async () => {
    tables.set('legacy_sales', { singleSequence: [{ data: null }] }) // pré-check idempotence : vente inconnue
    tables.set('legacy_caisse_sessions', { rows: [{ is_open: false }] })

    const res = await POST(postRequest({ ...PAYLOAD, sessionId: 's-closed' }))

    expect(res.status).toBe(409)
    const body = (await res.json()) as { code?: string; erreur?: string }
    expect(body.code).toBe('CAISSE_CLOSED')
    expect(body.erreur).toBe('Caisse clôturée')
    expect(recordSaleMock).not.toHaveBeenCalled()
  })

  it('sessionId INCONNUE du serveur → 409 (jamais de vente rattachée à une session fantôme)', async () => {
    tables.set('legacy_sales', { singleSequence: [{ data: null }] })
    tables.set('legacy_caisse_sessions', { rows: [] })

    const res = await POST(postRequest({ ...PAYLOAD, sessionId: 's-ghost' }))
    expect(res.status).toBe(409)
    expect(recordSaleMock).not.toHaveBeenCalled()
  })

  it('sessionId OUVERTE (is_open=true) → la vente part normalement vers la RPC', async () => {
    tables.set('legacy_caisse_sessions', { rows: [{ is_open: true }] })
    legacySaleOk()
    recordSaleMock.mockResolvedValue({ rpcMissing: true }) // repli legacy accepté pour ce contrat

    const res = await POST(postRequest({ ...PAYLOAD, sessionId: 's-open' }))
    expect(res.status).toBe(201)
    expect(recordSaleMock).toHaveBeenCalledTimes(1)
  })

  it('SANS sessionId → vente non bloquée (payloads historiques et ventes hors session)', async () => {
    legacySaleOk()
    recordSaleMock.mockResolvedValue({ rpcMissing: true })

    const res = await POST(postRequest(PAYLOAD))
    expect(res.status).toBe(201)
    expect(recordSaleMock).toHaveBeenCalledTimes(1)
  })

  it('idempotence PRÉSERVÉE : une vente déjà enregistrée (clientId connu) reste 200 MÊME avec une session clôturée (replay offline)', async () => {
    tables.set('legacy_sales', {
      singleSequence: [
        { data: { id: 'sale-1', client_id: PAYLOAD.clientId, merchant_id: 'm1' } }, // pré-check : déjà enregistrée
      ],
    })
    tables.set('legacy_sale_items', { rows: [] })
    tables.set('legacy_caisse_sessions', { rows: [{ is_open: false }] })

    const res = await POST(postRequest({ ...PAYLOAD, sessionId: 's-closed' }))
    expect(res.status).toBe(200)
    expect(recordSaleMock).not.toHaveBeenCalled() // retour idempotent, rien ré-exécuté
  })
})
