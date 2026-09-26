import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-1014 (AUDIT-013) — détection de concurrence sur la configuration :
//   • GET : updated_at exposé par catégorie (configs[].updatedAt — additif) ;
//   • PATCH sans expectedUpdatedAt (rétro-compat) → update par category seul,
//     contrat historique inchangé ;
//   • PATCH avec expectedUpdatedAt : version lue par le client — mismatch ou
//     0 ligne affectée → 409 CONCURRENCY_CONFLICT (fin du last-write-wins) ;
//     la fenêtre lecture→écriture est fermée par .eq('updated_at', lu).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: (...a: unknown[]) => authMock(...a),
  logAudit: (...a: unknown[]) => logAuditMock(...a),
}))

import { GET, PATCH } from '@/app/api/backoffice/config/route'

const authMock = vi.fn()
const logAuditMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; error: { message?: string; code?: string } | null }

interface Captured {
  table: string
  selectCols?: string
  eqs: Array<[string, unknown]>
  inserted?: Record<string, unknown>
  updated?: Record<string, unknown>
}
const captured: Captured[] = []
let resultsQueue: Result[] = []

function makeBuilder(table: string) {
  const state: Captured = { table, eqs: [] }
  captured.push(state)
  const b = {} as Record<string, unknown> & {
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
  }
  b.select = (cols?: string) => {
    state.selectCols = cols
    return b
  }
  b.insert = (payload: Record<string, unknown>) => {
    state.inserted = payload
    return b
  }
  b.update = (payload: Record<string, unknown>) => {
    state.updated = payload
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.order = () => b
  b.single = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }).then(res, rej)
  return b
}

function reqGet(): NextRequest {
  return new NextRequest(new Request('http://localhost/api/backoffice/config', { method: 'GET' }))
}

function req(body: unknown): NextRequest {
  return new NextRequest(new Request('http://localhost/api/backoffice/config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
}

const U0 = '2026-09-25T10:00:00+00:00'
const U1 = '2026-09-25T11:30:00+00:00'

/** Lecture (single) puis écriture (select) — file d'attente dans l'ordre SQL.
 * Une seule paire de résultats par PATCH : from() est appelé deux fois
 * (lecture + écriture/insert), la file est remplie à la PREMIÈRE invocation. */
function queueSql(read: Result, write: Result) {
  let queued = false
  fromMock.mockImplementation((table: string) => {
    const b = makeBuilder(table)
    if (!queued) {
      resultsQueue.push(read, write)
      queued = true
    }
    return b
  })
}

beforeEach(() => {
  authMock.mockReset()
  logAuditMock.mockReset().mockResolvedValue(undefined)
  fromMock.mockReset()
  captured.length = 0
  resultsQueue = []
  authMock.mockResolvedValue({
    user: { id: 'u1', name: 'Awa Koné', email: 'awa@julaba.ci', role: 'admin', zone: null },
  })
})

describe('GET /api/backoffice/config (MODE-1014)', () => {
  it('contrat existant conservé (catégories dépliées + configs) + updatedAt additif', async () => {
    fromMock.mockImplementation((table: string) => makeBuilder(table))
    resultsQueue.push({ data: [
      { category: 'general', config: '{"institution":"Jùlaba"}', updated_at: U0 },
      { category: 'brut', config: 'pas-du-json', updated_at: U1 },
    ], error: null })
    const res = await GET(reqGet())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.general).toEqual({ institution: 'Jùlaba' })
    expect(body.brut).toBe('pas-du-json')
    expect(body.configs).toEqual([
      { key: 'general', value: { institution: 'Jùlaba' }, updatedAt: U0 },
      { key: 'brut', value: 'pas-du-json', updatedAt: U1 },
    ])
  })
})

describe('PATCH /api/backoffice/config — concurrence (MODE-1014)', () => {
  it('rétro-compat : sans expectedUpdatedAt, update par category seul (contrat historique)', async () => {
    queueSql({ data: { category: 'general', updated_at: U0 }, error: null }, { data: [{ category: 'general', config: '{}', updated_at: U1 }], error: null })
    const res = await PATCH(req({ category: 'general', institution: 'Jùlaba' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.succes).toBe(true)
    expect(body.category).toBe('general')
    expect(captured[1].updated).toEqual({ config: '{"institution":"Jùlaba"}' })
    expect(captured[1].eqs).toEqual([['category', 'general']])
    expect(logAuditMock).toHaveBeenCalledTimes(1)
  })

  it('expectedUpdatedAt à jour : l\u2019update est verrouillé sur updated_at lu, 200 + nouvelle version', async () => {
    queueSql({ data: { category: 'general', updated_at: U0 }, error: null }, { data: [{ category: 'general', config: '{}', updated_at: U1 }], error: null })
    const res = await PATCH(req({ category: 'general', expectedUpdatedAt: U0, institution: 'Jùlaba' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updatedAt).toBe(U1)
    expect(captured[1].eqs).toEqual([['category', 'general'], ['updated_at', U0]])
    // La précondition n'est PAS persistée dans le JSON de configuration.
    expect(captured[1].updated!.config).toBe('{"institution":"Jùlaba"}')
  })

  it('expectedUpdatedAt périmé : 409 CONCURRENCY_CONFLICT AVANT toute écriture', async () => {
    queueSql({ data: { category: 'general', updated_at: U1 }, error: null }, { data: [], error: null })
    const res = await PATCH(req({ category: 'general', expectedUpdatedAt: U0, institution: 'X' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(body.erreur).toContain('modifiée par un autre agent')
    expect(captured).toHaveLength(1) // lecture seule
    expect(logAuditMock).not.toHaveBeenCalled()
  })

  it('course lecture→écriture (updated_at changé entre-temps) : 0 ligne affectée → 409', async () => {
    queueSql({ data: { category: 'general', updated_at: U0 }, error: null }, { data: [], error: null })
    const res = await PATCH(req({ category: 'general', expectedUpdatedAt: U0, institution: 'X' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(captured[1].eqs).toEqual([['category', 'general'], ['updated_at', U0]])
  })

  it('expectedUpdatedAt mal formé : 400, aucune lecture ni écriture', async () => {
    queueSql({ data: { category: 'general', updated_at: U0 }, error: null }, { data: [], error: null })
    const res = await PATCH(req({ category: 'general', expectedUpdatedAt: 'pas-une-date', institution: 'X' }))
    expect(res.status).toBe(400)
    expect(captured).toHaveLength(0)
  })

  it('expectedUpdatedAt fourni mais catégorie inexistante : 409, aucun insert', async () => {
    queueSql({ data: null, error: { code: 'PGRST116', message: '0 rows' } }, { data: null, error: null })
    const res = await PATCH(req({ category: 'general', expectedUpdatedAt: U0, institution: 'X' }))
    expect(res.status).toBe(409)
    expect(captured).toHaveLength(1)
    expect(captured[0].inserted).toBeUndefined()
  })

  it('insert d\u2019une nouvelle catégorie sans expectedUpdatedAt : comportement historique', async () => {
    queueSql({ data: null, error: { code: 'PGRST116', message: '0 rows' } }, { data: { category: 'nouvelle', config: '{"a":1}', updated_at: U0 }, error: null })
    const res = await PATCH(req({ category: 'nouvelle', a: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.succes).toBe(true)
    expect(body.updatedAt).toBe(U0)
    expect(captured[1].inserted).toEqual({ category: 'nouvelle', config: '{"a":1}' })
  })

  it('course d\u2019insert (unique category, 23505) : le second back-office reçoit 409', async () => {
    queueSql({ data: null, error: { code: 'PGRST116', message: '0 rows' } }, { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    const res = await PATCH(req({ category: 'nouvelle', a: 1 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(logAuditMock).not.toHaveBeenCalled()
  })
})
