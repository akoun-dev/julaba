import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// DET-COOP-009 (MODE-970) — contrat HTTP de la route membres de
// l'espace coopérative (§3.2 julaba-app), invariants applicatifs §8 :
// GET  : garde président ; liste enrichie à jointure BATCHÉE (2 requêtes,
//        jamais de N+1) ; SANITISATION STRUCTURELLE des comptes marchands
//        (jamais de hash/code/webauthn — même contrat que
//        stripSensitiveUserFields) ; cotisations agrégées depuis la
//        trésorerie validée ; scoreJulaba réel via la source unique batchée.
// POST : ajout direct d'un marchand par le président (statut 'actif') ;
//        400 sans id ; 404 marchand fantôme ; 409 lisible si adhésion
//        active existante (double check + filet 23505 anti-course) ;
//        notification post-écriture (le fait est certain après l'INSERT).

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/notifications/server', () => ({
  createNotification: (...a: unknown[]) => notifMock(...a),
}))

vi.mock('@/lib/scores/scores-service', () => ({
  scoresMarchandsBatch: (...a: unknown[]) => scoresMock(...a),
}))

import { GET, POST } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()
const notifMock = vi.fn()
const scoresMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }
let resultsQueue: Result[]

interface BuilderState {
  table: string
  selectCols: string
  eqs: Array<[string, unknown]>
  inFilter: [string, unknown[]] | null
  inserted: Record<string, unknown> | null
}
let captured: BuilderState[]

interface Builder {
  state: BuilderState
  select: (cols: string) => Builder
  eq: (col: string, val: unknown) => Builder
  order: (col: string, opts?: unknown) => Builder
  in: (col: string, vals: unknown[]) => Builder
  insert: (payload: Record<string, unknown>) => Builder
  single: () => Promise<Result>
  maybeSingle: () => Promise<Result>
  then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
}

function shift(): Result {
  return resultsQueue.shift() ?? { data: null, error: null }
}

function makeBuilder(): Builder {
  const state: BuilderState = { table: '', selectCols: '', eqs: [], inFilter: null, inserted: null }
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
  b.in = (col: string, vals: unknown[]) => {
    state.inFilter = [col, vals]
    return b
  }
  b.insert = (payload: Record<string, unknown>) => {
    state.inserted = payload
    return b
  }
  b.single = () => {
    if (state.inserted) ordre.push(`insert(${state.table})`)
    return Promise.resolve(shift())
  }
  b.maybeSingle = () => Promise.resolve(shift())
  b.then = (res, rej) => Promise.resolve(shift()).then(res, rej)
  return b
}

fromMock.mockImplementation((table: string) => {
  const b = makeBuilder()
  b.state.table = table
  return b
})

// Traçabilité de l'ordre écriture → notification (invariant §8 post-commit).
let ordre: string[]

const COOP = { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1', actif: true }
const MEMBRE_ROW = {
  id: 'adh-1',
  membre_id: 'm1',
  statut: 'actif',
  role: 'membre',
  date_adhesion: '2026-09-01',
  cotisation_payee: true,
  created_at: '2026-09-01T10:00:00Z',
}
// Le compte marchand mocké PORTE volontairement des champs sensibles : la
// route ne doit en exposer que la projection déclarée (prenom/nom/téléphone).
const COMPTE_SENSIBLE = {
  id: 'm1',
  first_name: 'Awa',
  last_name: 'Koné',
  phone: '+2250701020304',
  password_hash: 'bcrypt-leak-me-not',
  pin_code_hash: 'pin-leak-me-not',
  pin_code_encrypted_identificateur: 'enc-leak-me-not',
  webauthn_credentials: [{ id: 'cred-1' }],
  webauthn_challenge: 'challenge-leak-me-not',
}

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/cooperatives/membres?cooperateurId=c1')
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cooperatives/membres', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function erreur401(): NextResponse {
  return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
}

beforeEach(() => {
  fromMock.mockClear()
  ownerMock.mockReset().mockResolvedValue(null)
  notifMock.mockReset().mockResolvedValue(undefined)
  scoresMock.mockReset().mockResolvedValue(new Map())
  captured = []
  resultsQueue = []
  ordre = []
})

describe('GET /api/cooperatives/membres', () => {
  it('relaye l’échec de session telle quelle, sans requête base', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await GET(getReq())
    expect(res).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('404 quand le compte n’est président d’aucune coopérative', async () => {
    resultsQueue = [{ data: null, error: null }]
    const res = await GET(getReq())
    expect(res.status).toBe(404)
    expect(fromMock).toHaveBeenCalledTimes(1) // seule la résolution président a tourné
  })

  it('liste vide → { membres: [] } sans interroger merchants ni trésorerie', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { membres: unknown[] }
    expect(json.membres).toEqual([])
    expect(fromMock).toHaveBeenCalledTimes(2) // cooperatives + cooperative_membres
    expect(scoresMock).not.toHaveBeenCalled()
  })

  it('membres enrichis : compte joint, cotisations agrégées, scoreJulaba source unique', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [COMPTE_SENSIBLE], error: null },
      { data: [{ membre_id: 'm1', montant: 12500.4 }, { membre_id: 'm1', montant: 2499.6 }], error: null },
    ]
    scoresMock.mockResolvedValue(new Map([['m1', { score: 82, niveau: 'or' }]]))
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      membres: Array<Record<string, unknown>>
    }
    expect(json.membres).toHaveLength(1)
    const m = json.membres[0]
    expect(m.id).toBe('adh-1')
    expect(m.marchandId).toBe('m1')
    expect(m.prenom).toBe('Awa')
    expect(m.nom).toBe('Koné')
    expect(m.telephone).toBe('+2250701020304')
    expect(m.statut).toBe('actif')
    expect(m.role).toBe('membre')
    expect(m.cotisationPayee).toBe(true)
    expect(m.totalCotisations).toBe(15000) // somme validée, arrondie
    expect(m.scoreJulaba).toEqual({ score: 82, niveau: 'or' })
  })

  it('SANITISATION STRUCTURELLE : aucun champ sensible du compte marchand ne fuit', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [COMPTE_SENSIBLE], error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    const raw = JSON.stringify(await res.json())
    for (const interdit of ['password', 'pin_code', 'pinCode', 'webauthn', 'encrypted', 'bcrypt']) {
      expect(raw).not.toContain(interdit)
    }
  })

  it('projection de la réponse exactement définie (contrat front figé)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [COMPTE_SENSIBLE], error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    const json = (await res.json()) as { membres: Array<Record<string, unknown>> }
    expect(Object.keys(json.membres[0]).sort()).toEqual(
      [
        'id',
        'marchandId',
        'prenom',
        'nom',
        'telephone',
        'commune',
        'statut',
        'role',
        'dateAdhesion',
        'cotisationPayee',
        'totalCotisations',
        'membreDepuis',
        'scoreJulaba',
      ].sort()
    )
  })

  // MODE-985 (DET-COOP-011 tranche 2) — la commune déclarée du marchand
  // voyage avec le compte (embed communes) et ressort telle quelle ;
  // l'absence de commune reste null (jamais de valeur inventée).
  it('commune déclarée : embed communes dans le select merchants + champ exposé (null si absente)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [{ ...COMPTE_SENSIBLE, commune: { id: 'com-1', nom: 'Yopougon', region: 'Abidjan' } }], error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    const json = (await res.json()) as { membres: Array<{ commune: { id: string; nom: string; region: string } | null }> }
    expect(json.membres[0].commune).toEqual({ id: 'com-1', nom: 'Yopougon', region: 'Abidjan' })
    const merchants = captured.filter((c) => c.table === 'merchants')
    expect(merchants[0].selectCols).toContain('commune:communes(id, nom, region)')
  })

  it('commune non déclarée → null dans la réponse (pas de devinette)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [COMPTE_SENSIBLE], error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    const json = (await res.json()) as { membres: Array<{ commune: unknown }> }
    expect(json.membres[0].commune).toBeNull()
  })

  it('jointure batchée anti-N+1 : merchants requêté UNE fois avec .in(...)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [MEMBRE_ROW], error: null },
      { data: [COMPTE_SENSIBLE], error: null },
      { data: [], error: null },
    ]
    await GET(getReq())
    const merchants = captured.filter((c) => c.table === 'merchants')
    expect(merchants).toHaveLength(1)
    expect(merchants[0].inFilter).toEqual(['id', ['m1']])
    // Le score passe par la MÊME fonction batchée que GET /api/scores/me.
    expect(scoresMock).toHaveBeenCalledTimes(1)
    expect(scoresMock.mock.calls[0][1]).toBe('coop-1')
    expect(scoresMock.mock.calls[0][2]).toEqual([
      { marchandId: 'm1', prenom: 'Awa', nom: 'Koné', telephone: '+2250701020304' },
    ])
  })
})

describe('POST /api/cooperatives/membres — ajout direct par le président', () => {
  it('relaye l’échec de session sans requête base', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('400 sans marchandId (pas de membre fantôme)', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const res = await POST(postReq({ cooperateurId: 'c1' }))
    expect(res.status).toBe(400)
    expect(fromMock).toHaveBeenCalledTimes(1) // garde seule, aucun lookup marchand
  })

  it('404 si le compte marchand n’existe pas', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: null, error: null },
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm-fantome' }))
    expect(res.status).toBe(404)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('Marchand non trouvé')
  })

  it('409 lisible quand le marchand est déjà membre de MA coopérative', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: { id: 'adh-9', cooperative_id: 'coop-1', statut: 'actif' }, error: null },
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('déjà membre de votre coopérative')
  })

  it('409 lisible quand le marchand est membre d’une AUTRE coopérative', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: { id: 'adh-9', cooperative_id: 'coop-2', statut: 'actif' }, error: null },
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('autre coopérative')
  })

  it('filet anti-course : une erreur 23505 à l’INSERT devient 409, jamais 500', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: null, error: null }, // double check passé…
      { data: null, error: { code: '23505', message: 'uniq_coop_membre_actif' } }, // …course entre-temps
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('adhésion active')
  })

  it('201 : INSERT conforme (coop du ctx, statut actif, rôle membre, date défaut)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: null, error: null },
      { data: { id: 'adh-new', statut: 'actif', role: 'membre' }, error: null },
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res.status).toBe(201)
    const insert = captured.find((c) => c.inserted)?.inserted
    expect(insert).toBeDefined()
    expect(insert?.cooperative_id).toBe('coop-1')
    expect(insert?.membre_id).toBe('m1')
    expect(insert?.statut).toBe('actif')
    expect(insert?.role).toBe('membre')
    expect(String(insert?.date_adhesion)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('201 : la dateAdhesion fournie par le client est respectée telle quelle', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: null, error: null },
      { data: { id: 'adh-new', statut: 'actif', role: 'membre' }, error: null },
    ]
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1', dateAdhesion: '2026-08-15' }))
    expect(res.status).toBe(201)
    const insert = captured.find((c) => c.inserted)?.inserted
    expect(insert?.date_adhesion).toBe('2026-08-15')
  })

  it('NOTIFICATION POST-ÉCRITURE : le marchand est prévenu APRÈS l’INSERT réussi', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: null, error: null },
      { data: { id: 'adh-new', statut: 'actif', role: 'membre' }, error: null },
    ]
    notifMock.mockImplementation(async () => {
      ordre.push('notification')
    })
    const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
    expect(res.status).toBe(201)
    expect(ordre).toEqual(['insert(cooperative_membres)', 'notification'])
    expect(notifMock).toHaveBeenCalledTimes(1)
    const notif = notifMock.mock.calls[0][0] as Record<string, unknown>
    expect(notif.subjectType).toBe('merchant')
    expect(notif.subjectId).toBe('m1')
    expect(notif.type).toBe('cooperative_info')
    expect(String(notif.body)).toContain('Coop BAOULE')
  })

  it('erreur d’INSERT non métier → 500 uniforme (pas de détail technique au client)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    resultsQueue = [
      { data: COOP, error: null },
      { data: { id: 'm1', first_name: 'Awa' }, error: null },
      { data: null, error: null },
      { data: null, error: { code: '23503', message: 'foreign key violation' } },
    ]
    try {
      const res = await POST(postReq({ cooperateurId: 'c1', marchandId: 'm1' }))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { erreur: string }
      expect(json.erreur).toBe('Erreur serveur')
    } finally {
      spy.mockRestore()
    }
  })
})
