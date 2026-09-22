import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// AUDIT-005 A5-F21 — contrat de la route journal d'audit back-office :
//   - garde permission 'audit:read' relayée telle quelle en cas de refus ;
//   - tri created_at descendant + pagination bornée (limit ≤ 100) ;
//   - filtres module/action en eq() ; filtre user NEUTRALISÉ avant
//     interpolation .or() (AUDIT-005 F-03) ;
//   - erreur base → 500 générique sans fuite de détail.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: vi.fn((...a: unknown[]) => permMock(...a)),
}))

// sanitizeSearchTerm : fonction pure réelle.

import { GET } from '../route'

const permMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: Array<Record<string, unknown>>; error: { message: string } | null; count?: number | null }
let resultsQueue: Result
interface BuilderState {
  table: string
  ors: string[]
  eqs: Array<[string, string]>
  range?: [number, number]
  orders: string[]
}
let captured: BuilderState[]

type Builder = Record<string, unknown> & { state: BuilderState }

function makeBuilder(): Builder {
  const state: BuilderState = { table: '', ors: [], eqs: [], range: undefined, orders: [] }
  captured.push(state)
  const builder: Builder = {
    state,
    select: () => builder,
    or: (expr: string) => {
      state.ors.push(expr)
      return builder
    },
    eq: (col: string, val: unknown) => {
      state.eqs.push([col, String(val)])
      return builder
    },
    order: (col: string, opts: { ascending?: boolean }) => {
      state.orders.push(`${col}:${opts?.ascending ? 'asc' : 'desc'}`)
      return builder
    },
    range: (from: number, to: number) => {
      state.range = [from, to]
      return builder
    },
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resultsQueue).then(res, rej),
  }
  return builder
}

const ADMIN = { id: 'u1', email: 'admin@julaba.test', name: 'Admin', role: 'admin', zone: null, isActive: true }

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/backoffice/audit${query}`)
}

beforeEach(() => {
  fromMock.mockReset().mockImplementation((table: string) => {
    const b = makeBuilder()
    b.state.table = table
    return b
  })
  permMock.mockReset().mockResolvedValue({ user: ADMIN })
  captured = []
  resultsQueue = { data: [], error: null, count: 0 }
})

describe('GET /api/backoffice/audit — garde', () => {
  it('permission refusée → NextResponse de la garde relayée, base intacte', async () => {
    const guard = NextResponse.json({ erreur: 'Interdit' }, { status: 403 })
    permMock.mockResolvedValue(guard)
    const res = await GET(getRequest())
    expect(res).toBe(guard)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/backoffice/audit — lecture', () => {
  it('tri created_at descendant, range par défaut (0-19), aucune condition superflue', async () => {
    resultsQueue = { data: [], error: null, count: 0 }
    await GET(getRequest())
    const state = captured[0]
    expect(state.table).toBe('legacy_audit_logs')
    expect(state.orders).toEqual(['created_at:desc'])
    expect(state.range).toEqual([0, 19])
    expect(state.ors).toHaveLength(0)
    expect(state.eqs).toHaveLength(0)
  })

  it('filtres module et action en eq()', async () => {
    await GET(getRequest('?module=auth&action=login_failed'))
    const state = captured[0]
    expect(state.eqs).toContainEqual(['module', 'auth'])
    expect(state.eqs).toContainEqual(['action', 'login_failed'])
  })

  it('filtre user neutralisé : pas de filtre injecté dans la grammaire .or()', async () => {
    await GET(getRequest(`?user=${encodeURIComponent('a),user_email.eq.œil')}`))
    const state = captured[0]
    expect(state.ors).toHaveLength(1)
    // 2 termes légitimes (user_name, user_email), valeur nettoyée.
    expect(state.ors[0].split(',')).toHaveLength(2)
    expect(state.ors[0]).not.toMatch(/[()]/)
    expect(state.ors[0]).not.toContain(',user_email.eq.')
    // NB : le _ de user_email est un joker LIKE → neutralisé en espace par
    // sanitizeSearchTerm (comportement voulu).
    expect(state.ors[0]).toContain('user_name.ilike.%a user email.eq.œil%')
  })

  it('pagination bornée : limit plafonné à 100, page ≥ 1', async () => {
    resultsQueue = { data: [], error: null, count: 45 }
    const res = await GET(getRequest('?page=0&limit=999'))
    expect(captured[0].range).toEqual([0, 99])
    const body = await res.json()
    expect(body).toMatchObject({ total: 45, page: 1, limit: 100, totalPages: 1 })
  })

  it('erreur base → 500 générique', async () => {
    resultsQueue = { data: [], error: { message: 'connection refused' } }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).erreur).toBe('Erreur lors du chargement du journal d\'audit')
    errorSpy.mockRestore()
  })
})
