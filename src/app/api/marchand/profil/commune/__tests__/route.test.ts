import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-985 (DET-COOP-011 tranche 2) — contrat HTTP de la commune du
// MARCHAND (miroir exact de /api/producteur/profil/commune, MODE-979) :
// GET  : garde propriétaire (requireDeviceOwner 'merchant') AVANT tout
//        lookup ; commune courante via embed communes ; null = jamais
//        déclarée ; 404 si le compte n'existe pas.
// PATCH : communeId valide obligatoire (400 lisible AVANT écriture —
//         jamais un 23503 brut) ; aucune autre colonne écrivable ici.

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET, PATCH } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }
let resultsQueue: Result[]

interface Captured {
  table: string
  selectCols?: string
  eqs: Array<[string, unknown]>
  updated?: Record<string, unknown>
}
const captured: Captured[] = []

function makeBuilder(table: string) {
  const state: Captured = { table, eqs: [] }
  captured.push(state)
  const b = {} as Record<string, unknown> & {
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
  }
  b.select = (cols: string) => {
    state.selectCols = cols
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
  b.maybeSingle = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }).then(res, rej)
  return b
}

fromMock.mockImplementation((table: string) => makeBuilder(table))

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/marchand/profil/commune?marchandId=m1')
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/marchand/profil/commune?marchandId=m1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const COMMUNE = { id: 'com-1', nom: 'Yopougon', region: 'Abidjan', lat: 5.3406, lng: -4.0919 }

beforeEach(() => {
  ownerMock.mockReset().mockResolvedValue(null)
  fromMock.mockClear()
  captured.length = 0
  resultsQueue = []
})

describe('GET /api/marchand/profil/commune', () => {
  it('relaye la garde de session AVANT tout lookup base', async () => {
    const garde = NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    ownerMock.mockResolvedValue(garde)
    const res = await GET(getReq())
    expect(res).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
    expect(ownerMock.mock.calls[0][1]).toBe('merchant') // royaume marchand, pas producteur
    expect(ownerMock.mock.calls[0][2]).toBe('m1') // l'id du QUERY, pas un id forgeable du body
  })

  it('commune déclarée → { commune } via embed communes sur merchants', async () => {
    resultsQueue = [{ data: { commune: { id: 'com-1', nom: 'Yopougon', region: 'Abidjan' } }, error: null }]
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { commune: { nom: string } }
    expect(json.commune).toEqual({ id: 'com-1', nom: 'Yopougon', region: 'Abidjan' })
    expect(captured[0].table).toBe('merchants')
    expect(captured[0].selectCols).toContain('commune:communes(id, nom, region)')
    expect(captured[0].eqs).toEqual([['id', 'm1']])
  })

  it('commune jamais déclarée → { commune: null } (pas de valeur inventée)', async () => {
    resultsQueue = [{ data: { commune: null }, error: null }]
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { commune: unknown }
    expect(json.commune).toBeNull()
  })

  it('compte introuvable → 404 lisible', async () => {
    resultsQueue = [{ data: null, error: null }]
    const res = await GET(getReq())
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/marchand/profil/commune', () => {
  it('relaye la garde de session AVANT tout lookup / écriture', async () => {
    const garde = NextResponse.json({ erreur: 'Accès refusé à cette ressource' }, { status: 403 })
    ownerMock.mockResolvedValue(garde)
    const res = await PATCH(patchReq({ communeId: 'com-1' }))
    expect(res).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('sans communeId → 400 lisible, zéro requête', async () => {
    const res = await PATCH(patchReq({}))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('communeId requis')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('commune inconnue → 400 AVANT écriture (jamais un 23503 brut)', async () => {
    resultsQueue = [
      { data: null, error: null }, // lookup communes : inconnue
    ]
    const res = await PATCH(patchReq({ communeId: 'com-x' }))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('Commune inconnue')
    expect(captured.filter((c) => c.table === 'merchants' && c.updated)).toHaveLength(0)
  })

  it('succès : commune_id écrit, commune renvoyée', async () => {
    resultsQueue = [
      { data: COMMUNE, error: null }, // lookup communes
      { data: null, error: null }, // update
    ]
    const res = await PATCH(patchReq({ communeId: 'com-1' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { commune: { nom: string } }
    expect(json.commune.nom).toBe('Yopougon')
    const update = captured.find((c) => c.table === 'merchants' && c.updated)
    expect(update?.updated).toMatchObject({ commune_id: 'com-1' })
    expect(typeof update?.updated?.updated_at).toBe('string')
    expect(update?.eqs).toEqual([['id', 'm1']])
  })
})
