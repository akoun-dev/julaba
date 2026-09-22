import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// DET-COOP-007 (MODE-978) — contrat de l'annuaire coopératives de l'app
// identificateur : session appareil VERIFIÉE (jamais un id nu), liste
// restreinte aux coopératives ACTIVES, projection id+nom SEULEMENT
// (aucune donnée personnelle), tri alphabétique pour un choix stable.

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()

function url(): string {
  return 'http://localhost/api/identificateur/cooperatives?identificateurId=ident-1'
}

beforeEach(() => {
  ownerMock.mockReset()
  fromMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function chaineCoop(data: Array<{ id: string; nom: string }>, erreur: { message: string } | null = null) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: async () => ({ data, error: erreur }),
      }),
    }),
  })
}

describe('GET /api/identificateur/cooperatives', () => {
  it('session appareil refusée → la garde passe (401/403/400 relayés)', async () => {
    ownerMock.mockResolvedValueOnce(new Response(JSON.stringify({ erreur: 'Session appareil requise' }), { status: 401 }))
    const res = await GET(new NextRequest(url()))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('sélection active triée, projection id+nom seulement', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chaineCoop([
      { id: 'c1', nom: 'Coop Agboville' },
      { id: 'c2', nom: 'Coop Bouaké' },
    ])
    const res = await GET(new NextRequest(url()))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { cooperatives: Array<Record<string, unknown>> }
    expect(body.cooperatives).toHaveLength(2)
    for (const coop of body.cooperatives) {
      expect(Object.keys(coop).sort()).toEqual(['id', 'nom'])
    }
  })

  it('liste vide → tableau honnête (pas d\u2019erreur)', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chaineCoop([])
    const res = await GET(new NextRequest(url()))
    const body = (await res.json()) as { cooperatives: unknown[] }
    expect(body.cooperatives).toEqual([])
  })

  it('erreur base → 500 uniforme', async () => {
    ownerMock.mockResolvedValueOnce(null)
    chaineCoop([], { message: 'base injoignable' })
    const res = await GET(new NextRequest(url()))
    expect(res.status).toBe(500)
  })
})
