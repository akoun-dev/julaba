import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// AUDIT-005 A5-F21 — contrat de la route back-office « acteurs » :
// GET  : garde permission 'acteurs:read' ; zone FORCÉE pour
//        gestionnaire_zone/operateur_terrain (le filtre ?zone= du client
//        ne peut pas élargir le périmètre) ; recherche PostgREST
//        NEUTRALISÉE (sanitizeSearchTerm, AUDIT-005 F-03) ; pagination
//        bornée (limit ≤ 100, page ≥ 1).
// PATCH: garde 'acteurs:update' ; 400 sans id ni champ ; 404 inconnu ;
//        403 hors périmètre (canAccessZone) ; catégorie marchand réservée
//        aux marchands et validée par la nomenclature ; miroir merchants.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: vi.fn((...a: unknown[]) => permMock(...a)),
  canAccessZone: (user: unknown, zone: string | null | undefined) => zoneMock(user, zone),
  logAudit: (payload: unknown) => auditMock(payload),
}))

// normalizeMarchandCategorie + sanitizeSearchTerm : fonctions pures
// utilisées en implémentation réelle.

import { GET, PATCH } from '../route'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

const permMock = vi.fn()
const zoneMock = vi.fn<(user: unknown, zone: string | null | undefined) => boolean>()
const auditMock = vi.fn<(payload: unknown) => Promise<void>>()

const fromMock = vi.fn()

type Result = { data: Array<Record<string, unknown>> | Record<string, unknown> | null; error: { message: string } | null; count?: number | null }
let resultsQueue: Result[]
interface BuilderState {
  table: string
  ors: string[]
  eqs: Array<[string, string]>
  range?: [number, number]
  updates: Array<Record<string, unknown>>
}
let captured: BuilderState[]

type Builder = Record<string, unknown> & { state: BuilderState }

function makeBuilder(): Builder {
  const state: BuilderState = { table: '', ors: [], eqs: [], range: undefined, updates: [] }
  captured.push(state)
  const result = (): Result => resultsQueue.shift() ?? { data: null, error: null, count: 0 }
  const builder: Builder = {
    state,
    select: (_cols: string, _opts?: unknown) => builder,
    or: (expr: string) => {
      state.ors.push(expr)
      return builder
    },
    eq: (col: string, val: unknown) => {
      state.eqs.push([col, String(val)])
      return builder
    },
    order: () => builder,
    range: (from: number, to: number) => {
      state.range = [from, to]
      return builder
    },
    update: (payload: Record<string, unknown>) => {
      state.updates.push(payload)
      return builder
    },
    single: () => Promise.resolve(result()),
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
  }
  return builder
}

fromMock.mockImplementation((table: string) => {
  const b = makeBuilder()
  b.state.table = table
  return b
})

const ADMIN = { id: 'u1', email: 'admin@julaba.test', name: 'Admin', role: 'admin', zone: null, isActive: true }
const GESTIONNAIRE = { id: 'u2', email: 'gz@julaba.test', name: 'GZ Nord', role: 'gestionnaire_zone', zone: 'NORD', isActive: true }

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/backoffice/actors${query}`)
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backoffice/actors', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  fromMock.mockClear()
  permMock.mockReset().mockResolvedValue({ user: ADMIN })
  zoneMock.mockReset().mockReturnValue(true)
  auditMock.mockReset().mockResolvedValue(undefined)
  captured = []
  resultsQueue = [{ data: [], error: null, count: 0 }]
})

describe('GET /api/backoffice/actors — gardes et périmètre', () => {
  it('permission refusée → la NextResponse de la garde est relayée telle quelle', async () => {
    const guard = NextResponse.json({ erreur: 'Interdit' }, { status: 403 })
    permMock.mockResolvedValue(guard)
    const res = await GET(getRequest())
    expect(res).toBe(guard)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('gestionnaire_zone → zone FORCÉE sur son périmètre même si ?zone= dit autre chose', async () => {
    permMock.mockResolvedValue({ user: GESTIONNAIRE })
    await GET(getRequest('?zone=SUD'))
    const state = captured[0]
    // MODE-1005 : égalité sur la clé normalisée zone_key (Adjame = Adjamé)
    expect(state.eqs).toContainEqual(['zone_key', 'nord'])
    expect(state.eqs).not.toContainEqual(['zone_key', 'sud'])
  })

  it('admin sans zone → utilise le ?zone= du client', async () => {
    await GET(getRequest('?zone=SUD'))
    expect(captured[0].eqs).toContainEqual(['zone_key', 'sud'])
  })

  it('MODE-1005 : ?zone=Adjamé et ?zone=Adjame produisent la MÊME clé de filtrage', async () => {
    await GET(getRequest(`?zone=${encodeURIComponent('Adjamé')}`))
    await GET(getRequest('?zone=Adjame'))
    expect(captured[0].eqs).toContainEqual(['zone_key', 'adjame'])
    expect(captured[1].eqs).toContainEqual(['zone_key', 'adjame'])
  })

  it('recherche neutraisée : les séparateurs de la grammaire .or() sont retirés de la valeur', async () => {
    await GET(getRequest(`?search=${encodeURIComponent('a),zone.eq.oeil%')}`))
    const state = captured[0]
    expect(state.ors).toHaveLength(1)
    // La grammaire légitime de la route = 4 termes .ilike séparés par des
    // virgules. L'attaque « a),zone.eq.oeil » doit rester UN SEUL terme
    // inoffensif : la valeur est nettoyée et AUCUN filtre n'est injecté.
    expect(state.ors[0]).not.toMatch(/[()]/)
    expect(state.ors[0].split(',')).toHaveLength(4)
    expect(state.ors[0]).not.toContain(',zone.eq.')
    expect(state.ors[0]).toContain('first_name.ilike.%a zone.eq.oeil%')
  })

  it('pagination bornée : limit plafonné à 100 AVANT calcul de range, page ≥ 1', async () => {
    resultsQueue = [{ data: [], error: null, count: 120 }]
    const res = await GET(getRequest('?page=2&limit=500'))
    // limit 500 → 100 ; page 2 → from = 100, to = 199.
    expect(captured[0].range).toEqual([100, 199])
    const body = await res.json()
    expect(body).toMatchObject({ total: 120, page: 2, limit: 100, totalPages: 2 })
  })

  it('erreur base → 500 générique', async () => {
    resultsQueue = [{ data: null, error: { message: 'connection refused' } }]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    errorSpy.mockRestore()
  })
})

describe('PATCH /api/backoffice/actors — mutations', () => {
  const EXISTING = { id: 'act-1', actor_id: 'ACT-0001', type: 'marchand', zone: 'NORD', status: 'en_attente', validated_at: null }

  function patchSetup(existing: Record<string, unknown> | null, updateResult: Result = { data: {}, error: null }) {
    resultsQueue = [
      { data: existing, error: null },          // select(*).eq(id).single()
      updateResult,                              // update().eq().select().single()
      { data: null, error: null },               // miroir merchants (si applicable)
    ]
  }

  it('permission refusée → garde relayée, base intacte', async () => {
    permMock.mockResolvedValue(NextResponse.json({ erreur: 'Interdit' }, { status: 403 }))
    const res = await PATCH(patchRequest({ id: 'act-1', status: 'actif' }))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('400 sans id ou sans champ à modifier', async () => {
    const res1 = await PATCH(patchRequest({ status: 'actif' }))
    const res2 = await PATCH(patchRequest({ id: 'act-1' }))
    expect(res1.status).toBe(400)
    expect(res2.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('acteur inconnu → 404', async () => {
    patchSetup(null)
    const res = await PATCH(patchRequest({ id: 'nope', status: 'actif' }))
    expect(res.status).toBe(404)
  })

  it('hors périmètre (canAccessZone false) → 403, aucune écriture', async () => {
    patchSetup({ ...EXISTING })
    zoneMock.mockReturnValue(false)
    const res = await PATCH(patchRequest({ id: 'act-1', status: 'actif' }))
    expect(res.status).toBe(403)
    expect(captured.filter((c) => c.updates.length > 0)).toHaveLength(0)
  })

  it('statut actif → validated_at posé + logAudit actor_status_update', async () => {
    patchSetup({ ...EXISTING }, { data: { ...EXISTING, status: 'actif' }, error: null })
    const res = await PATCH(patchRequest({ id: 'act-1', status: 'actif' }))
    expect(res.status).toBe(200)
    // builder 1 = SELECT existant, builder 2 = UPDATE → updates[0] du builder d'écriture.
    const update = captured.find((c) => c.updates.length > 0)!.updates[0]
    expect(update.status).toBe('actif')
    expect(typeof update.validated_at).toBe('string')
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'actor_status_update', module: 'acteurs' }))
  })

  it('catégorie marchand sur un non-marchand → 400, aucune écriture', async () => {
    patchSetup({ ...EXISTING, type: 'producteur' })
    const res = await PATCH(patchRequest({ id: 'act-1', categorieMarchand: 'grossiste' }))
    expect(res.status).toBe(400)
    expect(captured.filter((c) => c.updates.length > 0)).toHaveLength(0)
  })

  it('catégorie inconnue → 400 avec message de nomenclature', async () => {
    patchSetup({ ...EXISTING })
    const res = await PATCH(patchRequest({ id: 'act-1', categorieMarchand: 'mega-grossiste' }))
    expect(res.status).toBe(400)
    expect((await res.json()).erreur).toContain('détaillant')
  })

  it('catégorie marchand valide → écrite sur legacy_bo_actors ET miroir merchants', async () => {
    patchSetup({ ...EXISTING, merchant_id: 'mch-9' }, { data: { ...EXISTING, categorie_marchand: 'grossiste' }, error: null })
    const res = await PATCH(patchRequest({ id: 'act-1', categorieMarchand: 'grossiste' }))
    expect(res.status).toBe(200)
    const actorTable = captured.find((c) => c.table === 'legacy_bo_actors' && c.updates.length > 0)
    const merchantTable = captured.find((c) => c.table === 'merchants' && c.updates.length > 0)
    expect(actorTable?.updates[0]?.categorie_marchand).toBe('grossiste')
    expect(merchantTable?.updates[0]).toEqual({ categorie_marchand: 'grossiste' })
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'actor_categorie_update' }))
  })
})

// Garde de contrat : la garde de permission est bien appelée avec le
// couple module/action attendu (régression RBAC).
describe('gardes de permission', () => {
  it('GET exige acteurs:read et PATCH exige acteurs:update', async () => {
    await GET(getRequest())
    expect((requireBackofficePermission as unknown as Mock).mock.calls.at(-1)?.slice(1)).toEqual(['acteurs', 'read'])
    resultsQueue = [{ data: null, error: null }]
    await PATCH(patchRequest({})).catch(() => {})
    expect((requireBackofficePermission as unknown as Mock).mock.calls.at(-1)?.slice(1)).toEqual(['acteurs', 'update'])
  })
})
