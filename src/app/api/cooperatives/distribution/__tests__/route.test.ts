import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// DET-COOP-009 (MODE-970) — contrat HTTP de la DISTRIBUTION du pot commun
// (§3.5 julaba-app, invariants applicatifs §8) :
// Garde duale (MODE-931 : membre actif OU président, jamais de mixte) ;
// validations strictes des parts (produit, quantité, destinataires actifs
// de SA coopérative — un id forgé ne reçoit rien) ; la cohérence du stock
// est portée par la RPC coop_distribuer_stock (verrou, refus INTÉGRAL si
// demande > disponible, jamais de stock négatif, jamais de partiel) dont
// les rejets métier sont mappés en 422/409/404 lisibles (la file offline
// ne rejoue PAS un conflit) ; les notifications « stock_commun_recu »
// partent APRÈS le commit RPC (invariant ⑤ — le destinataire n'est pas
// prévenu d'un fait qui aurait pu être annulé), une par destinataire,
// JAMAIS à l'opérateur lui-même.

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

vi.mock('@/lib/notifications/server', () => ({
  createNotification: (...a: unknown[]) => notifMock(...a),
}))

import { POST } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()
const rpcMock = vi.fn()
const notifMock = vi.fn()

type Result = { data: unknown; error: { message: string; code?: string } | null }
let resultsQueue: Result[]

interface BuilderState {
  table: string
  selectCols: string
  eqs: Array<[string, unknown]>
}
let captured: BuilderState[]

interface Builder {
  state: BuilderState
  select: (cols: string) => Builder
  eq: (col: string, val: unknown) => Builder
  order: (col: string, opts?: unknown) => Builder
  limit: (n: number) => Builder
  maybeSingle: () => Promise<Result>
  then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
}

function shift(): Result {
  return resultsQueue.shift() ?? { data: null, error: null }
}

function makeBuilder(): Builder {
  const state: BuilderState = { table: '', selectCols: '', eqs: [] }
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
  b.limit = () => b
  b.maybeSingle = () => Promise.resolve(shift())
  b.then = (res, rej) => Promise.resolve(shift()).then(res, rej)
  return b
}

fromMock.mockImplementation((table: string) => {
  const b = makeBuilder()
  b.state.table = table
  return b
})

// Traçabilité de l'ordre RPC → notifications (invariant ⑤ post-commit).
let ordre: string[]
let capturedRpc: { fn: string; args: Record<string, unknown> } | null

const COOP = { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1', actif: true }
const ADHESION = {
  id: 'adh-1',
  statut: 'actif',
  role: 'membre',
  cotisation_payee: true,
  cooperative: { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1' },
}
const ACTIFS = [{ membre_id: 'm1' }, { membre_id: 'm2' }, { membre_id: 'm3' }]

const BASE = { merchantId: 'm1', produit: '  Igname  ', quantite: 10, destinataires: [{ membreId: 'm2', quantite: 10 }] }

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cooperatives/distribution', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function erreur401(): NextResponse {
  return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
}

/** File par défaut du chemin MARCHAND : résolution d'adhésion puis actifs. */
function fileMarchand(actifs: unknown = ACTIFS): void {
  resultsQueue = [
    { data: ADHESION, error: null },
    { data: actifs, error: null },
  ]
}

/** File du chemin PRÉSIDENT : coopérative du responsable puis actifs. */
function filePresident(actifs: unknown = ACTIFS): void {
  resultsQueue = [
    { data: COOP, error: null },
    { data: actifs, error: null },
  ]
}

beforeEach(() => {
  fromMock.mockClear()
  ownerMock.mockReset().mockResolvedValue(null)
  captured = []
  resultsQueue = []
  ordre = []
  capturedRpc = null
  rpcMock.mockReset().mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    capturedRpc = { fn, args }
    ordre.push('rpc')
    return { data: { distribue: true }, error: null }
  })
  notifMock.mockReset().mockImplementation(async () => {
    ordre.push('notif')
  })
})

describe('Garde duale et validations d’entrée', () => {
  it('relaye l’échec de session telle quelle, sans requête base ni RPC', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await POST(postReq(BASE))
    expect(res).toBe(garde)
    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('cooperateurId → chemin PRÉSIDENT : la RPC signe p_membre_id = cooperateurId', async () => {
    filePresident()
    const res = await POST(postReq({ ...BASE, merchantId: undefined, cooperateurId: 'c1' }))
    expect(res.status).toBe(201)
    expect(capturedRpc?.args.p_membre_id).toBe('c1')
    expect(ownerMock.mock.calls[0][1]).toBe('cooperateur')
  })

  it('les deux ids simultanés → le chemin président PRIME (jamais de mixte ambigu)', async () => {
    filePresident()
    const res = await POST(postReq({ ...BASE, cooperateurId: 'c1' }))
    expect(res.status).toBe(201)
    expect(capturedRpc?.args.p_membre_id).toBe('c1')
    expect(ownerMock).toHaveBeenCalledTimes(1)
    expect(ownerMock.mock.calls[0][1]).toBe('cooperateur')
  })

  it('400 produit requis (même réduit à des espaces)', async () => {
    fileMarchand()
    const res = await POST(postReq({ ...BASE, produit: '   ' }))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 quantité invalide (0, négatif, non numérique)', async () => {
    for (const quantite of [0, -5, 'abc']) {
      fileMarchand()
      const res = await POST(postReq({ ...BASE, quantite }))
      expect(res.status).toBe(400)
      resultsQueue = []
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 sans destinataire (liste vide ou absente)', async () => {
    for (const destinataires of [[], undefined]) {
      fileMarchand()
      const res = await POST(postReq({ ...BASE, destinataires }))
      expect(res.status).toBe(400)
      resultsQueue = []
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 part invalide : membreId vide ou quantité ≤ 0', async () => {
    for (const destinataires of [{ membreId: '', quantite: 5 }, { membreId: 'm2', quantite: 0 }]) {
      fileMarchand()
      const res = await POST(postReq({ ...BASE, destinataires: [destinataires] }))
      expect(res.status).toBe(400)
      resultsQueue = []
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('403 : un destinataire hors de la coopérative (id forgé) ne reçoit rien', async () => {
    fileMarchand([{ membre_id: 'm2' }])
    const res = await POST(postReq({ ...BASE, destinataires: [{ membreId: 'm2', quantite: 5 }, { membreId: 'm9', quantite: 5 }] }))
    expect(res.status).toBe(403)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('membre actif de votre coopérative')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('Mapping des rejets métier de la RPC coop_distribuer_stock', () => {
  it('STOCK_INSUFFISANT → 422 avec le disponible extrait du message', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'STOCK_INSUFFISANT: disponible=12.5' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { erreur: string; disponible: number | null }
    expect(json.erreur).toContain('Stock commun insuffisant')
    expect(json.disponible).toBe(12.5)
  })

  it('STOCK_INSUFFISANT sans disponible lisible → disponible null (toujours 422)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'STOCK_INSUFFISANT' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { disponible: number | null }
    expect(json.disponible).toBeNull()
  })

  it('PRODUIT_ABSENT → 422 « Produit absent du stock commun »', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'PRODUIT_ABSENT' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('Produit absent')
  })

  it('PARTS_INCOHERENTES → 422 (la somme des parts ne correspond pas)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'PARTS_INCOHERENTES' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('somme des parts')
  })

  it('BESOIN_DEJA_LIVRE → 409 (MODE-942 I-06 : clôture dans la transaction)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'BESOIN_DEJA_LIVRE' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('déjà été livré')
  })

  it('BESOIN_INCOHERENT → 422 (produit ou unité ne correspond pas au besoin)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'BESOIN_INCOHERENT' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('ne correspond pas')
  })

  it('BESOINTROUVABLE → 404 (besoin introuvable dans cette coopérative)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'BESOINTROUVABLE' } }))
    const res = await POST(postReq(BASE))
    expect(res.status).toBe(404)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toContain('introuvable')
  })

  it('erreur RPC inconnue → 500 uniforme, sans détail technique au client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'ERREUR_POSTGRES_INATTENDUE' } }))
    try {
      const res = await POST(postReq(BASE))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { erreur: string }
      expect(json.erreur).toBe('Erreur serveur')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('Succès — signature RPC et invariants post-commit', () => {
  it('201 : signature RPC complète du chemin marchand (produit trimé, unité défaut, parts normalisées)', async () => {
    fileMarchand()
    const res = await POST(
      postReq({ ...BASE, clientId: 'cli-9' })
    )
    expect(res.status).toBe(201)
    const json = (await res.json()) as { persisted: boolean; stock: unknown }
    expect(json.persisted).toBe(true)
    expect(json.stock).toEqual({ distribue: true })
    expect(capturedRpc?.fn).toBe('coop_distribuer_stock')
    expect(capturedRpc?.args.p_cooperative_id).toBe('coop-1')
    expect(capturedRpc?.args.p_membre_id).toBe('m1')
    expect(capturedRpc?.args.p_produit).toBe('Igname')
    expect(capturedRpc?.args.p_quantite).toBe(10)
    expect(capturedRpc?.args.p_unite).toBe('kg')
    expect(capturedRpc?.args.p_destinataires).toEqual([{ membreId: 'm2', quantite: 10 }])
    expect(capturedRpc?.args.p_besoin_id).toBeNull()
    expect(capturedRpc?.args.p_client_id).toBe('cli-9')
  })

  it('201 : l’unité fournie est trimée, le besoinId est transmis au chemin du besoin', async () => {
    fileMarchand()
    const res = await POST(
      postReq({ ...BASE, unite: '  sac  ', besoinId: 'bes-7' })
    )
    expect(res.status).toBe(201)
    expect(capturedRpc?.args.p_unite).toBe('sac')
    expect(capturedRpc?.args.p_besoin_id).toBe('bes-7')
  })

  it('INVARIANT ⑤ : notifications post-commit — une par destinataire, JAMAIS à l’opérateur', async () => {
    fileMarchand()
    const res = await POST(
      postReq({ ...BASE, quantite: 9, destinataires: [{ membreId: 'm1', quantite: 4 }, { membreId: 'm2', quantite: 3 }, { membreId: 'm3', quantite: 2 }] })
    )
    expect(res.status).toBe(201)
    expect(notifMock).toHaveBeenCalledTimes(2) // m1 est l'opérateur : exclu
    const cibles = notifMock.mock.calls.map((c) => (c[0] as Record<string, unknown>).subjectId)
    expect(cibles).toEqual(['m2', 'm3'])
    const notif = notifMock.mock.calls[0][0] as Record<string, unknown>
    expect(notif.subjectType).toBe('merchant')
    expect(notif.type).toBe('stock_commun_recu')
    expect(notif.title).toBe('Stock commun reçu')
    expect(String(notif.body)).toContain('3 kg de Igname')
    expect(String(notif.body)).toContain('Coop BAOULE')
  })

  it('INVARIANT ⑤ : la RPC est appelée AVANT toute notification (fait certain, jamais annulé)', async () => {
    fileMarchand()
    await POST(postReq(BASE))
    expect(ordre[0]).toBe('rpc')
    expect(ordre).toEqual(['rpc', 'notif'])
  })

  it('échec de la RPC → AUCUNE notification (le fait n’est pas certain)', async () => {
    fileMarchand()
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'PRODUIT_ABSENT' } }))
    await POST(postReq(BASE))
    expect(notifMock).not.toHaveBeenCalled()
  })

  it('chemin président : les destinataires reçoivent tous la notification (le président n’en est pas un)', async () => {
    filePresident()
    const res = await POST(
      postReq({ ...BASE, merchantId: undefined, cooperateurId: 'c1', destinataires: [{ membreId: 'm2', quantite: 10 }] })
    )
    expect(res.status).toBe(201)
    expect(notifMock).toHaveBeenCalledTimes(1)
    const notif = notifMock.mock.calls[0][0] as Record<string, unknown>
    expect(notif.subjectId).toBe('m2')
  })
})
