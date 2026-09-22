import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-979 (DET-COOP-008) — contrat HTTP du tri de proximité :
//   GET /api/cooperatives/recoltes-prevues : garde membre actif, coords
//     de la coop via SA commune (nullable), récoltes publiee|disponible
//     bornées, jointure producteurs + communes BATCHÉE (jamais de N+1),
//     tri Haversine pur, tri 'date' honnête quand la coop n'a pas de
//     commune liée ;
//   PATCH /api/cooperatives/commune : garde président, 400 sans/à
//     communeId inconnue (400 AVANT écriture — jamais un 23503 brut),
//     écriture puis commune renvoyée ;
//   GET/PATCH /api/producteur/profil/commune : garde propriétaire
//     producteur, 404 compte fantôme, 400 commune inconnue, lecture
//     renvoie null quand aucune commune (jamais de valeur inventée).

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
  requireDeviceSessionAny: (...a: unknown[]) => sessionAnyMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) } }),
}))

vi.mock('@/lib/cooperatives/resolver', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireMembreActif: (...a: unknown[]) => membreActifMock(...a),
    requirePresident: (...a: unknown[]) => presidentMock(...a),
    erreurServeur: (scope: string, error: unknown) => {
      console.error(scope, error)
      return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
    },
  }
})

vi.mock('@/lib/producteur/photo-urls-server', () => ({
  resoudreUrlsPhotosLignes: async (_s: unknown, lignes: Record<string, unknown>[]) => lignes,
}))

import { GET as GET_RECOLTES } from '@/app/api/cooperatives/recoltes-prevues/route'
import { PATCH as PATCH_COMMUNE_COOP } from '@/app/api/cooperatives/commune/route'
import { GET as GET_COMMUNE_PROD, PATCH as PATCH_COMMUNE_PROD } from '@/app/api/producteur/profil/commune/route'

const ownerMock = vi.fn()
const sessionAnyMock = vi.fn()
const membreActifMock = vi.fn()
const presidentMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }

interface Captured {
  table: string
  selectCols?: string
  eqs: Array<[string, unknown]>
  ins?: [string, unknown[]]
  orderCol?: string
  limitVal?: number
}
const captured: Captured[] = []
let resultsQueue: Result[] = []

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
  b.update = (_payload: Record<string, unknown>) => {
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.in = (col: string, vals: unknown[]) => {
    state.ins = [col, vals]
    return b
  }
  b.order = (col: string) => {
    state.orderCol = col
    return b
  }
  b.limit = (n: number) => {
    state.limitVal = n
    return b
  }
  b.maybeSingle = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }).then(res, rej)
  return b
}
function req(url: string, method = 'GET', body?: unknown): NextRequest {
  const init: RequestInit = { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }
  return new NextRequest(new Request(`http://localhost${url}`, init))
}

beforeEach(() => {
  ownerMock.mockReset()
  sessionAnyMock.mockReset()
  membreActifMock.mockReset()
  presidentMock.mockReset()
  fromMock.mockReset()
  captured.length = 0
  resultsQueue = []
})

// ── GET /api/cooperatives/recoltes-prevues ────────────────────────────

const COOP_ROW = {
  id: 'coop-1',
  nom: 'Coop Agbo',
  commune_id: 'c-1',
  commune: { id: 'c-1', nom: 'Agboville', region: 'Agnéby-Tiassa', lat: 5.9328, lng: -4.2186 },
}

describe('GET /api/cooperatives/recoltes-prevues (MODE-979)', () => {
  it('404 lisible sans adhésion active', async () => {
    membreActifMock.mockResolvedValue({
      erreur: NextResponse.json({ erreur: 'Aucune adhésion active — rejoignez une coopérative' }, { status: 404 }),
    })
    const res = await GET_RECOLTES(req('/api/cooperatives/recoltes-prevues?merchantId=m1'))
    expect(res.status).toBe(404)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tri proximité : jointures batchées (coop → récoltes → producteurs), distance Haversine renvoyée', async () => {
    membreActifMock.mockResolvedValue({
      ctx: { merchantId: 'm1', cooperative: { id: COOP_ROW.id, nom: COOP_ROW.nom, commune: null, responsable_id: 'r1' }, membre: { id: 'ad1', statut: 'actif', role: 'membre', cotisation_payee: true } },
    })
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'cooperatives') resultsQueue.push({ data: COOP_ROW, error: null })
      else if (table === 'legacy_producteur_recoltes')
        resultsQueue.push({
          data: [
            { id: 'rec-1', producteur_id: 'p1', produit: 'Igname', quantite_kg: 500, qualite: 'premium', date_recolte: '2026-09-10T00:00:00Z', prix_souhaite_par_kg: 700, photos: '[]', statut: 'disponible' },
          ],
          error: null,
        })
      else if (table === 'producers')
        resultsQueue.push({
          data: [
            { id: 'p1', first_name: 'Koffi', commune: { id: 'c-1', nom: 'Agboville', region: 'Agnéby-Tiassa', lat: 5.9328, lng: -4.2186 } },
          ],
          error: null,
        })
      return b
    })

    const res = await GET_RECOLTES(req('/api/cooperatives/recoltes-prevues?merchantId=m1'))
    expect(res.status).toBe(200)
    const { recoltes, tri, coop, commune } = await res.json()
    expect(tri).toBe('proximite')
    expect(coop.nom).toBe('Coop Agbo')
    expect(commune.nom).toBe('Agboville')
    expect(recoltes).toHaveLength(1)
    expect(recoltes[0].distanceKm).toBe(0) // producteur DANS la commune de la coop
    expect(recoltes[0].tranche).toBe('proche')
    expect(recoltes[0].producteur.prenom).toBe('Koffi')
    // Jointure batchée : une requête par table, jamais de N+1.
    expect(captured.map((c) => c.table)).toEqual(['cooperatives', 'legacy_producteur_recoltes', 'producers'])
  })

  it('coopérative SANS commune liée : tri "date", distanceKm null (jamais approximée)', async () => {
    membreActifMock.mockResolvedValue({
      ctx: { merchantId: 'm1', cooperative: { id: 'coop-2', nom: 'Coop Sans Commune', commune: 'Grand-Bassam', responsable_id: 'r1' }, membre: { id: 'ad1', statut: 'actif', role: 'membre', cotisation_payee: true } },
    })
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'cooperatives')
        resultsQueue.push({ data: { id: 'coop-2', nom: 'Coop Sans Commune', commune_id: null, commune: null }, error: null })
      else if (table === 'legacy_producteur_recoltes') resultsQueue.push({ data: [], error: null })
      return b
    })

    const res = await GET_RECOLTES(req('/api/cooperatives/recoltes-prevues?merchantId=m1'))
    const { recoltes, tri } = await res.json()
    expect(tri).toBe('date')
    expect(recoltes).toEqual([])
  })
})

// ── PATCH /api/cooperatives/commune ───────────────────────────────────

describe('PATCH /api/cooperatives/commune (MODE-979)', () => {
  it('400 sans communeId', async () => {
    presidentMock.mockResolvedValue({
      ctx: { cooperateurId: 'co1', cooperative: { ...COOP_ROW, responsable_id: 'co1' } },
    })
    const res = await PATCH_COMMUNE_COOP(req('/api/cooperatives/commune?cooperateurId=co1', 'PATCH', {}))
    expect(res.status).toBe(400)
  })
  it('400 commune inconnue AVANT écriture (pas de 23503 brut)', async () => {
    presidentMock.mockResolvedValue({
      ctx: { cooperateurId: 'co1', cooperative: { ...COOP_ROW, responsable_id: 'co1' } },
    })
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'communes') resultsQueue.push({ data: null, error: null })
      return b
    })
    const res = await PATCH_COMMUNE_COOP(req('/api/cooperatives/commune?cooperateurId=co1', 'PATCH', { communeId: 'zz' }))
    expect(res.status).toBe(400)
    const { erreur } = await res.json()
    expect(erreur).toContain('Commune inconnue')
    // Aucune écriture : seules les communes ont été lues.
    expect(captured.map((c) => c.table)).toEqual(['communes'])
  })

  it('succès président : écriture cooperatives.commune_id + commune renvoyée', async () => {
    presidentMock.mockResolvedValue({
      ctx: { cooperateurId: 'co1', cooperative: { ...COOP_ROW, responsable_id: 'co1' } },
    })
    const COMMUNE = { id: 'c-1', nom: 'Agboville', region: 'Agnéby-Tiassa', lat: 5.9328, lng: -4.2186 }
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'communes') resultsQueue.push({ data: COMMUNE, error: null })
      else if (table === 'cooperatives') resultsQueue.push({ data: null, error: null })
      return b
    })
    const res = await PATCH_COMMUNE_COOP(req('/api/cooperatives/commune?cooperateurId=co1', 'PATCH', { communeId: 'c-1' }))
    expect(res.status).toBe(200)
    const { commune } = await res.json()
    expect(commune.nom).toBe('Agboville')
    expect(captured.map((c) => c.table)).toEqual(['communes', 'cooperatives'])
  })
})

// ── GET / PATCH /api/producteur/profil/commune ────────────────────────

describe('/api/producteur/profil/commune (MODE-979)', () => {
  it('GET : 401 sans session (garde AVANT lookup)', async () => {
    ownerMock.mockResolvedValue(
      NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 }),
    )
    const res = await GET_COMMUNE_PROD(req('/api/producteur/profil/commune?producteurId=p1'))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('GET : commune null quand jamais choisie', async () => {
    ownerMock.mockResolvedValue(null)
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'producers') resultsQueue.push({ data: { commune: null }, error: null })
      return b
    })
    const res = await GET_COMMUNE_PROD(req('/api/producteur/profil/commune?producteurId=p1'))
    expect(res.status).toBe(200)
    const { commune } = await res.json()
    expect(commune).toBeNull()
  })

  it('PATCH : 400 commune inconnue, aucune écriture', async () => {
    ownerMock.mockResolvedValue(null)
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'communes') resultsQueue.push({ data: null, error: null })
      return b
    })
    const res = await PATCH_COMMUNE_PROD(req('/api/producteur/profil/commune?producteurId=p1', 'PATCH', { communeId: 'zz' }))
    expect(res.status).toBe(400)
    expect(captured.map((c) => c.table)).toEqual(['communes'])
  })

  it('PATCH : succès — commune renvoyée', async () => {
    ownerMock.mockResolvedValue(null)
    const COMMUNE = { id: 'c-2', nom: 'Daloa', region: 'Haut-Sassandra', lat: 6.8776, lng: -6.4503 }
    fromMock.mockImplementation((table: string) => {
      const b = makeBuilder(table)
      if (table === 'communes') resultsQueue.push({ data: COMMUNE, error: null })
      else if (table === 'producers') resultsQueue.push({ data: null, error: null })
      return b
    })
    const res = await PATCH_COMMUNE_PROD(req('/api/producteur/profil/commune?producteurId=p1', 'PATCH', { communeId: 'c-2' }))
    expect(res.status).toBe(200)
    const { commune } = await res.json()
    expect(commune.nom).toBe('Daloa')
  })
})
