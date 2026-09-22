import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// DET-COOP-009 (MODE-970) — harnais du RÉSOLVEUR serveur du module
// Coopérative (§3/§6 julaba-app) : la coopérative active d'un compte est
// TOUJOURS résolue côté serveur depuis la base (jamais acceptée du client,
// un appelant ne peut pas opérer sur la coop d'un autre en forgeant un id),
// avec gardes de session appareil (royaumes cooperateur/merchant), gardes
// de rôle (président = responsable, membre = adhésion active) et la garde
// duale du pot commun (MODE-931) — l'opérateur est l'un OU l'autre, jamais
// un mixte ambigu, et l'échec du chemin président ne retombe JAMAIS sur le
// chemin marchand.

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  erreurServeur,
  requireCooperateurSession,
  requireMembreActif,
  requireMembreActifOuPresident,
  requireMarchandSession,
  requirePresident,
  resolveCooperativeByResponsable,
  resolveMembreActif,
} from '../resolver'

const ownerMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }
let resultsQueue: Result[]

interface BuilderState {
  table: string
  selectCols: string
  eqs: Array<[string, unknown]>
  limitVal: number | null
}
let captured: BuilderState[]

interface Builder {
  state: BuilderState
  select: (cols: string) => Builder
  eq: (col: string, val: unknown) => Builder
  order: (col: string, opts?: unknown) => Builder
  limit: (n: number) => Builder
  maybeSingle: () => Promise<Result>
  single: () => Promise<Result>
  then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
}

function shift(): Result {
  return resultsQueue.shift() ?? { data: null, error: null }
}

function makeBuilder(): Builder {
  const state: BuilderState = { table: '', selectCols: '', eqs: [], limitVal: null }
  captured.push(state)
  const b = {} as Builder
  b.state = state
  b.select = (cols: string) => {
    state.selectCols = cols
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.order = () => b
  b.limit = (n: number) => {
    state.limitVal = n
    return b
  }
  b.maybeSingle = () => Promise.resolve(shift())
  b.single = () => Promise.resolve(shift())
  b.then = (res, rej) => Promise.resolve(shift()).then(res, rej)
  return b
}

fromMock.mockImplementation((table: string) => {
  const b = makeBuilder()
  b.state.table = table
  return b
})

const COOP = { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1', actif: true }
const COOP_INACTIVE = { ...COOP, actif: false }
const ADHESION = {
  id: 'adh-1',
  statut: 'actif',
  role: 'membre',
  cotisation_payee: true,
  cooperative: { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1' },
}

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/cooperatives')
}

function erreur401(): NextResponse {
  return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
}

beforeEach(() => {
  fromMock.mockClear()
  ownerMock.mockReset().mockResolvedValue(null)
  captured = []
  resultsQueue = []
})

describe('Gardes de session — délégation requireDeviceOwner', () => {
  it('requireCooperateurSession délègue au royaume « cooperateur » avec l’id reçu', async () => {
    await requireCooperateurSession(getReq(), 'c1')
    expect(ownerMock).toHaveBeenCalledTimes(1)
    expect(ownerMock.mock.calls[0][1]).toBe('cooperateur')
    expect(ownerMock.mock.calls[0][2]).toBe('c1')
  })

  it('requireMarchandSession délègue au royaume « merchant » avec l’id reçu', async () => {
    await requireMarchandSession(getReq(), 'm1')
    expect(ownerMock).toHaveBeenCalledTimes(1)
    expect(ownerMock.mock.calls[0][1]).toBe('merchant')
    expect(ownerMock.mock.calls[0][2]).toBe('m1')
  })

  it('la NextResponse d’échec de session est relayée telle quelle (identité conservée)', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await requireCooperateurSession(getReq(), 'c1')
    expect(res).toBe(garde)
  })
})

describe('resolveCooperativeByResponsable — résolution président', () => {
  it('renvoie le contexte président complet quand une coopérative existe', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveCooperativeByResponsable(supa as never, 'c1')
    expect(ctx).not.toBeNull()
    expect(ctx?.cooperateurId).toBe('c1')
    expect(ctx?.cooperative).toEqual(COOP)
    // Résolution côté serveur : filtre par responsable_id, jamais par un id client.
    expect(captured[0].table).toBe('cooperatives')
    expect(captured[0].eqs).toContainEqual(['responsable_id', 'c1'])
  })

  it('renvoie null en cas d’erreur base (pas de throw)', async () => {
    resultsQueue = [{ data: null, error: { message: 'boom' } }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveCooperativeByResponsable(supa as never, 'c1')
    expect(ctx).toBeNull()
  })

  it('renvoie null quand le compte n’est responsable d’aucune coopérative', async () => {
    resultsQueue = [{ data: null, error: null }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveCooperativeByResponsable(supa as never, 'c-inconnu')
    expect(ctx).toBeNull()
  })
})

describe('requirePresident — garde complète président', () => {
  it('relaye l’échec de session SANS interroger la base', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await requirePresident(getReq(), 'c1')
    expect('erreur' in res).toBe(true)
    if ('erreur' in res) expect(res.erreur).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('404 quand le compte n’est responsable d’aucune coopérative', async () => {
    resultsQueue = [{ data: null, error: null }]
    const res = await requirePresident(getReq(), 'c1')
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur.status).toBe(404)
    const json = (await res.erreur.json()) as { erreur: string }
    expect(json.erreur).toContain('Aucune coopérative trouvée')
  })

  it('403 quand la coopérative est désactivée (actif=false)', async () => {
    resultsQueue = [{ data: COOP_INACTIVE, error: null }]
    const res = await requirePresident(getReq(), 'c1')
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur.status).toBe(403)
    const json = (await res.erreur.json()) as { erreur: string }
    expect(json.erreur).toContain('désactivée')
  })

  it('succès : le contexte porte la coopérative active du responsable', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const res = await requirePresident(getReq(), 'c1')
    expect('ctx' in res).toBe(true)
    if ('ctx' in res) {
      expect(res.ctx.cooperateurId).toBe('c1')
      expect(res.ctx.cooperative.id).toBe('coop-1')
      expect(res.ctx.cooperative.actif).toBe(true)
    }
  })
})

describe('resolveMembreActif — résolveur unique d’adhésion (miroir julaba-app)', () => {
  it('renvoie l’adhésion active avec la coopérative jointe', async () => {
    resultsQueue = [{ data: ADHESION, error: null }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveMembreActif(supa as never, 'm1')
    expect(ctx).not.toBeNull()
    expect(ctx?.merchantId).toBe('m1')
    expect(ctx?.membre.id).toBe('adh-1')
    expect(ctx?.membre.statut).toBe('actif')
    expect(ctx?.cooperative.id).toBe('coop-1')
    // Adhésion ACTIVE uniquement + dernier enregistrement (limit 1).
    expect(captured[0].table).toBe('cooperative_membres')
    expect(captured[0].eqs).toContainEqual(['membre_id', 'm1'])
    expect(captured[0].eqs).toContainEqual(['actif', true])
    expect(captured[0].limitVal).toBe(1)
    expect(captured[0].selectCols).toContain('cooperatives(')
  })

  it('renvoie null sans adhésion active (le marchand n’est pas membre)', async () => {
    resultsQueue = [{ data: null, error: null }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveMembreActif(supa as never, 'm-hors-coop')
    expect(ctx).toBeNull()
  })

  it('renvoie null si la coopérative jointe est absente (ligne orpheline)', async () => {
    resultsQueue = [{ data: { ...ADHESION, cooperative: null }, error: null }]
    const supa = createSupabaseAdminClient()
    const ctx = await resolveMembreActif(supa as never, 'm1')
    expect(ctx).toBeNull()
  })
})

describe('requireMembreActif — garde complète membre', () => {
  it('relaye l’échec de session sans toucher la base', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await requireMembreActif(getReq(), 'm1')
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('404 sans adhésion active — invitation à rejoindre une coopérative', async () => {
    resultsQueue = [{ data: null, error: null }]
    const res = await requireMembreActif(getReq(), 'm1')
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur.status).toBe(404)
    const json = (await res.erreur.json()) as { erreur: string }
    expect(json.erreur).toContain('rejoignez une coopérative')
  })

  it('403 pour une adhésion suspendue (statut !== actif)', async () => {
    resultsQueue = [{ data: { ...ADHESION, statut: 'suspendu' }, error: null }]
    const res = await requireMembreActif(getReq(), 'm1')
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur.status).toBe(403)
    const json = (await res.erreur.json()) as { erreur: string }
    expect(json.erreur).toContain('suspendu')
  })

  it('succès : contexte membre avec l’id de la ligne d’adhésion', async () => {
    resultsQueue = [{ data: ADHESION, error: null }]
    const res = await requireMembreActif(getReq(), 'm1')
    expect('ctx' in res).toBe(true)
    if ('ctx' in res) {
      expect(res.ctx.merchantId).toBe('m1')
      expect(res.ctx.membre.id).toBe('adh-1')
      expect(res.ctx.cooperative.nom).toBe('Coop BAOULE')
    }
  })
})

describe('requireMembreActifOuPresident — garde duale du pot commun (MODE-931)', () => {
  it('cooperateurId seul → chemin président', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const res = await requireMembreActifOuPresident(getReq(), { cooperateurId: 'c1' })
    expect('ctx' in res).toBe(true)
    if ('ctx' in res && res.ctx.type === 'president') {
      expect(res.ctx.cooperateurId).toBe('c1')
      expect(res.ctx.cooperative.id).toBe('coop-1')
    }
    expect(ownerMock.mock.calls[0][1]).toBe('cooperateur')
  })

  it('les deux ids simultanés → le chemin président PRIME (jamais de mixte ambigu)', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const res = await requireMembreActifOuPresident(getReq(), { merchantId: 'm1', cooperateurId: 'c1' })
    if (!('ctx' in res)) throw new Error('un ctx était attendu')
    expect(res.ctx.type).toBe('president')
    // Le chemin marchand n’a PAS été tenté : 1 seul appel de session.
    expect(ownerMock).toHaveBeenCalledTimes(1)
    expect(ownerMock.mock.calls[0][1]).toBe('cooperateur')
  })

  it('échec du chemin président → erreur relayée SANS repli vers le chemin marchand', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await requireMembreActifOuPresident(getReq(), { merchantId: 'm1', cooperateurId: 'c1' })
    if (!('erreur' in res)) throw new Error('une erreur était attendue')
    expect(res.erreur).toBe(garde)
    // Aucun second appel de session (pas de fallback marchand silencieux).
    expect(ownerMock).toHaveBeenCalledTimes(1)
  })

  it('merchantId seul → chemin membre actif, membreId = ligne d’adhésion', async () => {
    resultsQueue = [{ data: ADHESION, error: null }]
    const res = await requireMembreActifOuPresident(getReq(), { merchantId: 'm1' })
    if (!('ctx' in res)) throw new Error('un ctx était attendu')
    expect(res.ctx.type).toBe('membre')
    if (res.ctx.type === 'membre') {
      expect(res.ctx.merchantId).toBe('m1')
      expect(res.ctx.membreId).toBe('adh-1')
      expect(res.ctx.cooperative.id).toBe('coop-1')
    }
    expect(ownerMock.mock.calls[0][1]).toBe('merchant')
  })
})

describe('erreurServeur — erreur uniforme des routes coopérative', () => {
  it('renvoie un 500 générique (le détail technique reste en log serveur)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = erreurServeur('membres GET', new Error('boom'))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { erreur: string }
      expect(json.erreur).toBe('Erreur serveur')
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
