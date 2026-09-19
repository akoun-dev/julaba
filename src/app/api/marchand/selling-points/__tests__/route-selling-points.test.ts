import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-908 (§18) — route points de vente : upsert IDEMPOTENT par client_id
// (rejeu offline = même payload), 200 connu (mise à jour name/kind) /
// 201 créé / 23505 → relecture → 200 / 42P01 → 503 transitoire. Les
// dépendances réseau/base sont simulées : on teste la LOGIQUE de la route,
// pas Supabase.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: vi.fn(async () => null),
}))

import { createSellingPointSchema } from '@/lib/validation/marchand'
import { GET, POST } from '../route'

type Row = Record<string, unknown>

interface TableConfig {
  /** Lignes renvoyées par un await direct du builder (select en liste). */
  rows?: Row[]
  /** Ligne renvoyée par .single() (insert/update … select … single). */
  single?: Row | null
  /** Ligne renvoyée par .maybeSingle() (lecture optionnelle). */
  maybeSingle?: Row | null
  /** FIFO : résultats consommés par chaque appel .maybeSingle() (pré-check puis relecture 23505). */
  maybeSingleSequence?: Array<Row | null>
  /** Erreur renvoyée par les terminaisons. */
  error?: { code?: string; message?: string } | null
}

const tables = new Map<string, TableConfig>()

/** Builder Supabase simulé : enchaîne les filtres, résout selon la config. */
function makeBuilder(config: TableConfig) {
  const filters: Array<[string, string]> = []
  const inserts: Row[] = []
  const updates: Row[] = []
  // Méta d'appel exposée pour les assertions (order/limit).
  const meta = { limit: null as number | null, order: null as string | null }
  const listPromise = Promise.resolve({ data: config.rows ?? [], error: config.error ?? null })
  const builder: Record<string, unknown> = {
    filters,
    inserts,
    updates,
    meta,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, String(val)])
      return builder
    },
    order: (col: string) => {
      meta.order = col
      return builder
    },
    limit: (n: number) => {
      meta.limit = n
      return builder
    },
    maybeSingle: () => {
      if (config.maybeSingleSequence && config.maybeSingleSequence.length > 0) {
        const next = config.maybeSingleSequence.shift() ?? null
        return Promise.resolve({ data: next, error: null })
      }
      return Promise.resolve({ data: config.maybeSingle ?? null, error: null })
    },
    single: () => Promise.resolve({ data: config.single ?? null, error: config.error ?? null }),
    insert: (row: Row) => {
      inserts.push(row)
      return builder
    },
    update: (row: Row) => {
      updates.push(row)
      return builder
    },
    then: listPromise.then.bind(listPromise),
    catch: listPromise.catch.bind(listPromise),
  }
  return builder
}

const fromMock = vi.fn()
/** Journal des appels from() : { table, builder } — un from() par requête. */
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
})

/** Tous les builders d'une table, dans l'ordre d'appel. */
function buildersOf(table: string): Array<Record<string, unknown>> {
  return fromCalls.filter((c) => c.table === table).map((c) => c.builder)
}

function postRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/selling-points', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function getRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/marchand/selling-points?merchantId=m1${query}`)
}

const BASE_PAYLOAD = {
  merchantId: 'm1',
  clientId: '0f1e2d3c-4b5a-4948-8787-aabbccddeeff',
  name: 'Marché Treichville',
  kind: 'marche',
}

describe('createSellingPointSchema — contrat payload (MODE-908)', () => {
  it('accepte un payload complet et applique le défaut kind « autre »', () => {
    const parsed = createSellingPointSchema.safeParse(BASE_PAYLOAD)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.kind).toBe('marche')

    const sansKind = createSellingPointSchema.safeParse({ merchantId: 'm1', clientId: '0f1e2d3c-4b5a-4948-8787-aabbccddeeff', name: 'Boutique' })
    expect(sansKind.success).toBe(true)
    if (!sansKind.success) return
    expect(sansKind.data.kind).toBe('autre')
  })

  it('refuse clientId trop court, name hors bornes (2-60) et kind inventé', () => {
    expect(createSellingPointSchema.safeParse({ ...BASE_PAYLOAD, clientId: 'court' }).success).toBe(false)
    expect(createSellingPointSchema.safeParse({ ...BASE_PAYLOAD, name: 'A' }).success).toBe(false)
    expect(createSellingPointSchema.safeParse({ ...BASE_PAYLOAD, name: 'x'.repeat(61) }).success).toBe(false)
    expect(createSellingPointSchema.safeParse({ ...BASE_PAYLOAD, kind: 'kiosque' }).success).toBe(false)
  })

  it('archivedAt est optionnel (archivage = upsert avec la date ISO)', () => {
    const archived = createSellingPointSchema.safeParse({ ...BASE_PAYLOAD, archivedAt: '2026-09-19T10:00:00.000Z' })
    expect(archived.success).toBe(true)
    if (!archived.success) return
    expect(archived.data.archivedAt).toBe('2026-09-19T10:00:00.000Z')
  })
})

describe('POST /api/marchand/selling-points — upsert idempotent (MODE-908)', () => {
  it('client_id inconnu → 201, insert avec merchant_id/client_id/name/kind', async () => {
    tables.set('merchant_selling_points', {
      single: { id: 'msp-1', merchant_id: 'm1', client_id: BASE_PAYLOAD.clientId, name: BASE_PAYLOAD.name, kind: 'marche', archived_at: null, created_at: '2026-09-19T10:00:00.000Z' },
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(201)
    const builder = buildersOf('merchant_selling_points').find((b) => (b as { inserts: Row[] }).inserts.length > 0) as { inserts: Row[] }
    expect(builder).toBeDefined()
    expect(builder.inserts[0]).toMatchObject({
      merchant_id: 'm1',
      client_id: BASE_PAYLOAD.clientId,
      name: 'Marché Treichville',
      kind: 'marche',
    })
  })

  it('client_id déjà connu → 200 + UPDATE name/kind (jamais de doublon)', async () => {
    tables.set('merchant_selling_points', {
      maybeSingle: { id: 'msp-1', name: 'Ancien nom', kind: 'boutique' },
      single: { id: 'msp-1', name: BASE_PAYLOAD.name, kind: 'marche' },
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(200)
    // Le pré-check (maybeSingle) et l'UPDATE sont deux from() distincts.
    const [precheck, updateBuilder] = buildersOf('merchant_selling_points') as Array<{ updates: Row[]; inserts: Row[]; filters: Array<[string, string]> }>
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder.inserts).toHaveLength(0)
    expect(updateBuilder.updates[0]).toMatchObject({ name: 'Marché Treichville', kind: 'marche' })
    expect(updateBuilder.updates[0]).not.toHaveProperty('archived_at') // jamais de désarchivage accidentel
    expect(updateBuilder.filters).toContainEqual(['client_id', BASE_PAYLOAD.clientId])
    void precheck
    const body = await res.json()
    expect(body.sellingPoint.id).toBe('msp-1')
  })

  it('client_id connu + archivedAt fourni → l’archivage voyage dans l’UPDATE', async () => {
    tables.set('merchant_selling_points', {
      maybeSingle: { id: 'msp-1', name: 'Ancien nom', kind: 'boutique' },
      single: { id: 'msp-1', name: BASE_PAYLOAD.name, kind: 'marche', archived_at: '2026-09-19T10:00:00.000Z' },
    })

    const res = await POST(postRequest({ ...BASE_PAYLOAD, archivedAt: '2026-09-19T10:00:00.000Z' }))
    expect(res.status).toBe(200)
    const updateBuilder = buildersOf('merchant_selling_points').find((b) => (b as { updates: Row[] }).updates.length > 0) as { updates: Row[] }
    expect(updateBuilder).toBeDefined()
    expect(updateBuilder.updates[0]).toMatchObject({
      name: 'Marché Treichville',
      archived_at: '2026-09-19T10:00:00.000Z',
    })
  })

  it('course concurrente 23505 → relecture par client_id → 200 (jamais une erreur pour un rejeu)', async () => {
    tables.set('merchant_selling_points', {
      maybeSingleSequence: [null, { id: 'msp-reread', name: BASE_PAYLOAD.name, kind: 'marche' }],
      single: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sellingPoint.id).toBe('msp-reread')
  })

  it('table non migrée (42P01) → 503 transitoire (l’entrée reste en file offline)', async () => {
    tables.set('merchant_selling_points', {
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const res = await POST(postRequest(BASE_PAYLOAD))
    expect(res.status).toBe(503)
  })

  it('payload invalide (zod) → 400 avec erreur lisible', async () => {
    const res = await POST(postRequest({ ...BASE_PAYLOAD, name: 'A' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.erreur).toBe('string')
    expect(body.erreur).toContain('name')
  })
})

describe('GET /api/marchand/selling-points — liste scopée (MODE-908)', () => {
  it('liste ordonnée created_at desc, scoppée merchant_id, limit clampé à 200', async () => {
    tables.set('merchant_selling_points', {
      rows: [
        { id: 'msp-1', merchant_id: 'm1', client_id: 'cid-1', name: 'Boutique', kind: 'boutique', archived_at: null, created_at: '2026-09-19T10:00:00.000Z' },
      ],
    })

    const res = await GET(getRequest('&limit=500'))
    expect(res.status).toBe(200)
    const builder = buildersOf('merchant_selling_points')[0] as { filters: Array<[string, string]>; meta: { limit: number | null; order: string | null } }
    expect(builder.filters).toContainEqual(['merchant_id', 'm1'])
    expect(builder.meta.order).toBe('created_at')
    expect(builder.meta.limit).toBe(200)
    const body = await res.json()
    expect(body.sellingPoints).toHaveLength(1)
    expect(body.sellingPoints[0]).toMatchObject({ id: 'msp-1', clientId: 'cid-1', name: 'Boutique', kind: 'boutique', archivedAt: null })
  })

  it('table non migrée (42P01) → 503 transitoire', async () => {
    tables.set('merchant_selling_points', {
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const res = await GET(getRequest(''))
    expect(res.status).toBe(503)
  })
})
