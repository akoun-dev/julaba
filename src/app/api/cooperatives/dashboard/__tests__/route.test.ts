import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// MODE-972 (AUDIT-006 §5, Phase 1) — contrat HTTP de l'agrégat dashboard
// de l'espace coopérative. L'endpoint est la FONDATION DONNÉES du « vrai
// dashboard » : tout ce qu'il renvoie doit être honnête (garde-fou #1 de
// l'audit : aucune valeur inventée) et dérivé des tables :
//   • garde président (session + résolution serveur, identité AVANT
//     validation des paramètres — convention MODE-965) ;
//   • période whitelistée 7|30 jours (30 par défaut) ;
//   • séries jour par jour bornées UTC + KPI de période avec delta vs
//     période précédente ;
//   • resume IDENTIQUE à GET /api/cooperatives (solde via le module
//     partagé MODE-935 — jamais de second calcul divergent) ;
//   • top produits + mouvements récents du pot commun (écart #9) ;
//   • file d'actions avec compteurs head-count EXACTS (écart #7) ;
//   • sanitisation structurelle : l'agrégat ne lit JAMAIS une table de
//     comptes (merchants/cooperateurs) et n'expose aucun champ sensible ;
//   • anti-N+1 : 6 lectures parallèles + agrégat partagé séquencé (7
//     lectures au total après la garde, comme le pattern du BO) ;
//   • 500 uniforme (erreurServeur).

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; count?: number | null; error: { message: string; code?: string } | null }
let resultsQueue: Result[]

interface BuilderState {
  table: string
  selectCols: string
  selectOpts: Record<string, unknown> | null
  eqs: Array<[string, unknown]>
  ranges: Array<{ op: string; col: string; val: unknown }>
  orderDesc: string | null
  limitVal: number | null
}
let captured: BuilderState[]

interface Builder {
  state: BuilderState
  select: (cols: string, opts?: Record<string, unknown>) => Builder
  eq: (col: string, val: unknown) => Builder
  gte: (col: string, val: unknown) => Builder
  lt: (col: string, val: unknown) => Builder
  order: (col: string, opts?: unknown) => Builder
  limit: (n: number) => Builder
  maybeSingle: () => Promise<Result>
  then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
}

function shift(): Result {
  return resultsQueue.shift() ?? { data: null, error: null }
}

function makeBuilder(): Builder {
  const state: BuilderState = {
    table: '',
    selectCols: '',
    selectOpts: null,
    eqs: [],
    ranges: [],
    orderDesc: null,
    limitVal: null,
  }
  captured.push(state)
  const b = {} as Builder
  b.state = state
  b.select = (cols: string, opts?: Record<string, unknown>) => {
    state.selectCols = cols
    state.selectOpts = opts ?? null
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.gte = (col: string, val: unknown) => {
    state.ranges.push({ op: 'gte', col, val })
    return b
  }
  b.lt = (col: string, val: unknown) => {
    state.ranges.push({ op: 'lt', col, val })
    return b
  }
  b.order = (col: string, opts?: unknown) => {
    const o = (opts ?? {}) as { ascending?: boolean }
    if (o.ascending === false) state.orderDesc = col
    return b
  }
  b.limit = (n: number) => {
    state.limitVal = n
    return b
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

const JOUR_MS = 86_400_000
/** Ligne datée de `offsetJours` jours avant l'instant présent — tombe dans
 * le bucket jour « offsetJours » de la fenêtre courante (et dans la
 * fenêtre précédente quand jours < offset < 2×jours). */
const jour = (offsetJours: number) => new Date(Date.now() - offsetJours * JOUR_MS).toISOString()

const COOP = { id: 'coop-1', nom: 'Coop BAOULE', commune: 'Yopougon', responsable_id: 'c1', actif: true }
const COOP_INACTIF = { ...COOP, actif: false }

// Membres : 3 actifs (2 gagnés dans la fenêtre courante), 2 en attente
// (1 gagné dans la fenêtre précédente), 1 suspendu — 6 au total.
const MEMBRES_ROWS = [
  { statut: 'actif', created_at: jour(0) },
  { statut: 'actif', created_at: jour(2) },
  { statut: 'actif', created_at: jour(100) },
  { statut: 'en_attente', created_at: jour(1) },
  { statut: 'en_attente', created_at: jour(31) },
  { statut: 'suspendu', created_at: jour(45) },
]

// Trésorerie TOUTES périodes (le mock ne filtre pas : on ne met que des
// écritures validées, comme le ferait le .eq('statut','validee') réel).
const TRESO_ROWS = [
  { type: 'entree', categorie: 'cotisation', montant: 50000, created_at: jour(100) },
  { type: 'entree', categorie: 'vente_groupee', montant: 20000, created_at: jour(100) },
  { type: 'sortie', categorie: 'frais', montant: 12000, created_at: jour(100) },
]

// Fenêtre : courant = entrees 23000 / sorties 5000 / cotisations 11000 ;
// précédent = entrees 4000 / sorties 2500 / cotisations 4000. Les lignes
// hors bornes (jour 100) et la « sortie cotisation » (777) doivent être
// ignorées par les agrégats.
const FENETRE_ROWS = [
  { type: 'entree', categorie: 'vente_groupee', montant: 12000, created_at: jour(0) },
  { type: 'entree', categorie: 'cotisation', montant: 8000, created_at: jour(0) },
  { type: 'sortie', categorie: 'frais', montant: 5000, created_at: jour(1) },
  { type: 'entree', categorie: 'cotisation', montant: 3000, created_at: jour(2) },
  { type: 'entree', categorie: 'cotisation', montant: 4000, created_at: jour(31) },
  { type: 'sortie', categorie: 'achat_groupe', montant: 2500, created_at: jour(45) },
  { type: 'entree', categorie: 'cotisation', montant: 999, created_at: jour(100) },
  { type: 'sortie', categorie: 'cotisation', montant: 777, created_at: jour(1) },
]

// Pot commun : 7 produits (le top 5 coupe) — quantités en string numeric.
const STOCK_ROWS = [
  { produit: 'Igname', categorie: 'tubercule', quantite: '120.5', unite: 'kg' },
  { produit: 'Manioc', categorie: 'tubercule', quantite: '300', unite: 'kg' },
  { produit: 'Riz', categorie: 'cereale', quantite: '80', unite: 'sac' },
  { produit: 'Huile', categorie: null, quantite: '40', unite: 'bidon' },
  { produit: 'Tomate', categorie: 'legume', quantite: '25', unite: 'caisse' },
  { produit: 'Piment', categorie: 'legume', quantite: '10', unite: 'sac' },
  { produit: 'Gombo', categorie: 'legume', quantite: '5', unite: 'sac' },
]

const MOUVEMENTS_ROWS = [
  { id: 'mv-1', produit: 'Igname', unite: 'kg', type: 'apport', quantite: '40', membre_id: 'm1', created_at: jour(0) },
  { id: 'mv-2', produit: 'Manioc', unite: 'kg', type: 'distribution', quantite: '15.5', membre_id: 'm2', created_at: jour(1) },
  { id: 'mv-3', produit: 'Riz', unite: 'sac', type: 'apport', quantite: '10', membre_id: 'c1', created_at: jour(3) },
]

/** File de résultats pour un parcours heureux complet (après la garde :
 * membres, fenêtre, stock, mouvements, 2 head-counts, puis l'agrégat
 * partagé de trésorerie SÉQUENCÉ après le Promise.all — même pattern que
 * GET /api/cooperatives). */
function queueHappyPath(opts?: { jours?: number }) {
  resultsQueue = [
    { data: COOP, error: null },
    { data: MEMBRES_ROWS, error: null },
    { data: FENETRE_ROWS, error: null },
    { data: STOCK_ROWS, error: null },
    { data: MOUVEMENTS_ROWS, error: null },
    { data: null, count: 3, error: null },
    { data: null, count: 5, error: null },
    { data: TRESO_ROWS, error: null },
  ]
  void opts
}

function getReq(jours?: number): NextRequest {
  const q = new URLSearchParams({ cooperateurId: 'c1' })
  if (jours != null) q.set('jours', String(jours))
  return new NextRequest(`http://localhost/api/cooperatives/dashboard?${q.toString()}`)
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

describe('GET /api/cooperatives/dashboard — garde et validation', () => {
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

  it('403 quand la coopérative est désactivée', async () => {
    resultsQueue = [{ data: COOP_INACTIF, error: null }]
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('400 quand la période n’est ni 7 ni 30 jours (garde déjà passée)', async () => {
    resultsQueue = [{ data: COOP, error: null }]
    const res = await GET(getReq(15))
    expect(res.status).toBe(400)
    expect(fromMock).toHaveBeenCalledTimes(1) // aucune lecture de données
  })

  it('l’identité prime sur la validation : session invalide + jours invalide → la garde est renvoyée', async () => {
    const garde = erreur401()
    ownerMock.mockResolvedValue(garde)
    const res = await GET(getReq(15))
    expect(res).toBe(garde)
  })
})

describe('GET /api/cooperatives/dashboard — période et séries', () => {
  it('30 jours par défaut : un bucket par jour, bornes = extrémités de la série', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      periode: { jours: number; debut: string; fin: string }
      series: { tresorerie: Array<{ jour: string }> }
    }
    expect(json.periode.jours).toBe(30)
    expect(json.series.tresorerie).toHaveLength(30)
    expect(json.periode.debut).toBe(json.series.tresorerie[0].jour)
    expect(json.periode.fin).toBe(json.series.tresorerie[29].jour)
    // Continuité : buckets consécutifs = jours consécutifs (minuit UTC).
    const lendemain = new Date(`${json.series.tresorerie[0].jour}T00:00:00Z`)
    lendemain.setUTCDate(lendemain.getUTCDate() + 1)
    expect(json.series.tresorerie[1].jour).toBe(lendemain.toISOString().slice(0, 10))
    // Jours uniques.
    const uniques = new Set(json.series.tresorerie.map((j) => j.jour))
    expect(uniques.size).toBe(30)
  })

  it('jours=7 : la fenêtre se rétrécit (la ligne de la fenêtre précédente 30 j sort des KPI)', async () => {
    queueHappyPath()
    const res = await GET(getReq(7))
    const json = (await res.json()) as {
      periode: { jours: number }
      series: { tresorerie: unknown[] }
      kpis: { cotisations: { valeur: number; precedent: number; delta: number } }
    }
    expect(json.periode.jours).toBe(7)
    expect(json.series.tresorerie).toHaveLength(7)
    // Courant 7 j : 8000 + 3000 ; la cotisation à jour(31) est hors des
    // deux fenêtres de 7 j → précédent 0.
    expect(json.kpis.cotisations).toEqual({ valeur: 11000, precedent: 0, delta: 11000 })
  })

  it('agrège entrées/sorties/cotisations par jour (net = entrees − sorties), zéros ailleurs', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { series: { tresorerie: Array<{ jour: string; entrees: number; sorties: number; cotisations: number; net: number }> } }
    const serie = json.series.tresorerie
    expect(serie[29]).toEqual({ jour: serie[29].jour, entrees: 20000, sorties: 0, cotisations: 8000, net: 20000 })
    expect(serie[28]).toEqual({ jour: serie[28].jour, entrees: 0, sorties: 5777, cotisations: 0, net: -5777 })
    expect(serie[27]).toEqual({ jour: serie[27].jour, entrees: 3000, sorties: 0, cotisations: 3000, net: 3000 })
    expect(serie[0]).toEqual({ jour: serie[0].jour, entrees: 0, sorties: 0, cotisations: 0, net: 0 })
  })

  it('KPI de période avec delta vs période précédente (fenêtre 30 j)', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as {
      kpis: {
        membresGagnes: { valeur: number; precedent: number; delta: number }
        tresorerieNette: { valeur: number; precedent: number; delta: number }
        cotisations: { valeur: number; precedent: number; delta: number }
      }
    }
    // Membres : TOUTES les nouvelles adhésions comptent (quel que soit le
    // statut) — fenêtre courante = jours 0, 1, 2 (3 lignes) ; précédente =
    // jours 31 et 45 (2 lignes).
    expect(json.kpis.membresGagnes).toEqual({ valeur: 3, precedent: 2, delta: 1 })
    // Trésorerie nette : (23000 − 5777 — la sortie « cotisation » de 777
    // reste une sortie) vs (4000 − 2500).
    expect(json.kpis.tresorerieNette).toEqual({ valeur: 17223, precedent: 1500, delta: 15723 })
    // Cotisations : 11000 vs 4000.
    expect(json.kpis.cotisations).toEqual({ valeur: 11000, precedent: 4000, delta: 7000 })
  })

  it('une cotisation en SORTIE n’entre jamais dans les cotisations (sémantique MODE-935)', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { kpis: { cotisations: { valeur: number } }; series: { tresorerie: Array<{ cotisations: number }> } }
    // La sortie 777 (catégorie cotisation, jour 1) est comptée en sortie
    // mais JAMAIS en cotisation : courant = 8000 + 3000 = 11000.
    expect(json.kpis.cotisations.valeur).toBe(11000)
    expect(json.series.tresorerie[28].cotisations).toBe(0)
  })

  it('périodes sans activité → zéros explicites, jamais de NaN', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, count: 0, error: null },
      { data: null, count: 0, error: null },
      { data: [], error: null },
    ]
    const res = await GET(getReq())
    const raw = JSON.stringify(await res.json())
    expect(raw).not.toContain('NaN')
    const json = JSON.parse(raw) as {
      kpis: Record<string, { valeur: number; precedent: number; delta: number }>
      series: { tresorerie: Array<{ entrees: number; sorties: number }> }
      resume: { soldeTresorerie: number; membresTotal: number }
    }
    for (const k of Object.values(json.kpis)) {
      expect(k).toEqual({ valeur: 0, precedent: 0, delta: 0 })
    }
    expect(json.series.tresorerie.every((j) => j.entrees === 0 && j.sorties === 0)).toBe(true)
    expect(json.resume.soldeTresorerie).toBe(0)
    expect(json.resume.membresTotal).toBe(0)
  })
})

describe('GET /api/cooperatives/dashboard — resume (MÊME agrégat que GET /cooperatives)', () => {
  it('solde et cotisations calculés par le module partagé MODE-935 (lecture all-time, statut validee)', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { resume: Record<string, number> }
    // 50000 + 20000 − 12000 = 58000 ; cotisations = 50000.
    expect(json.resume.soldeTresorerie).toBe(58000)
    expect(json.resume.totalCotisations).toBe(50000)
    // La lecture all-time porte bien le filtre statut 'validee'.
    const allTime = captured.filter((c) => c.table === 'cooperative_transactions' && c.ranges.length === 0)
    expect(allTime).toHaveLength(2) // all-time + head-count en attente
    const soldeQuery = allTime.find((c) => c.eqs.some(([col, v]) => col === 'statut' && v === 'validee'))
    expect(soldeQuery).toBeDefined()
    expect(soldeQuery!.eqs).toContainEqual(['cooperative_id', 'coop-1'])
  })

  it('répartition des membres et volumes du pot commun', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { resume: Record<string, number> }
    expect(json.resume.membresTotal).toBe(6)
    expect(json.resume.membresActifs).toBe(3)
    expect(json.resume.adhesionsEnAttente).toBe(2)
    expect(json.resume.membresSuspendus).toBe(1)
    expect(json.resume.produitsEnStock).toBe(7)
    expect(json.resume.articlesEnStock).toBeCloseTo(580.5, 6)
  })
})

describe('GET /api/cooperatives/dashboard — pot commun', () => {
  it('topProduits : tri quantité décroissante, coupé à 5, quantités en nombre', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { topProduits: Array<{ produit: string; quantite: number; unite: string; categorie: string | null }> }
    expect(json.topProduits).toHaveLength(5)
    expect(json.topProduits.map((p) => p.produit)).toEqual(['Manioc', 'Igname', 'Riz', 'Huile', 'Tomate'])
    expect(json.topProduits[1]).toEqual({ produit: 'Igname', categorie: 'tubercule', unite: 'kg', quantite: 120.5 })
  })

  it('mouvementsRecents : projection camelCase, order created_at desc + limit 10 côté requête', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as {
      mouvementsRecents: Array<{ id: string; produit: string; unite: string; type: string; quantite: number; membreId: string | null; date: string }>
    }
    expect(json.mouvementsRecents).toEqual([
      { id: 'mv-1', produit: 'Igname', unite: 'kg', type: 'apport', quantite: 40, membreId: 'm1', date: MOUVEMENTS_ROWS[0].created_at },
      { id: 'mv-2', produit: 'Manioc', unite: 'kg', type: 'distribution', quantite: 15.5, membreId: 'm2', date: MOUVEMENTS_ROWS[1].created_at },
      { id: 'mv-3', produit: 'Riz', unite: 'sac', type: 'apport', quantite: 10, membreId: 'c1', date: MOUVEMENTS_ROWS[2].created_at },
    ])
    const mv = captured.find((c) => c.table === 'cooperative_stock_mouvements')
    expect(mv).toBeDefined()
    expect(mv!.orderDesc).toBe('created_at')
    expect(mv!.limitVal).toBe(10)
  })
})

describe('GET /api/cooperatives/dashboard — file d’actions', () => {
  it('compteurs exacts : adhésions en attente, écritures en attente (head-count), besoins à dispatcher', async () => {
    queueHappyPath()
    const res = await GET(getReq())
    const json = (await res.json()) as { fileActions: Record<string, number> }
    expect(json.fileActions).toEqual({ adhesionsEnAttente: 2, ecrituresEnAttente: 3, besoinsADispatcher: 5 })
  })

  it('les deux compteurs sont des head-counts exacts filtrés sur en_attente', async () => {
    queueHappyPath()
    await GET(getReq())
    const headCounts = captured.filter((c) => c.selectOpts?.['head'] === true)
    expect(headCounts).toHaveLength(2)
    expect(headCounts.map((c) => c.table).sort()).toEqual(['cooperative_besoins', 'cooperative_transactions'])
    for (const h of headCounts) {
      expect(h.selectOpts?.['count']).toBe('exact')
      expect(h.eqs).toContainEqual(['statut', 'en_attente'])
      expect(h.eqs).toContainEqual(['cooperative_id', 'coop-1'])
    }
  })
})

describe('GET /api/cooperatives/dashboard — contrats transversaux', () => {
  it('SANITISATION STRUCTURELLE : aucun champ sensible ne fuit, jamais de table de comptes requêtée', async () => {
    // Les lignes mockées portent volontairement des champs sensibles : la
    // route ne projette que les colonnes déclarées — le JSON brut ne doit
    // rien contenir.
    resultsQueue = [
      { data: COOP, error: null },
      { data: [{ statut: 'actif', created_at: jour(0), password_hash: 'x' }], error: null },
      { data: [{ type: 'entree', categorie: 'cotisation', montant: 100, created_at: jour(0), pin_code: 'y' }], error: null },
      { data: [{ produit: 'Igname', quantite: '5', unite: 'kg', webauthn_credentials: [{ id: 'z' }] }], error: null },
      { data: [{ id: 'mv-1', produit: 'Igname', unite: 'kg', type: 'apport', quantite: '5', membre_id: 'm1', created_at: jour(0), bcrypt: 'w' }], error: null },
      { data: null, count: 0, error: null },
      { data: null, count: 0, error: null },
    ]
    const res = await GET(getReq())
    const raw = JSON.stringify(await res.json())
    for (const interdit of ['password', 'pin_code', 'pinCode', 'webauthn', 'encrypted', 'bcrypt']) {
      expect(raw).not.toContain(interdit)
    }
    const tables = captured.map((c) => c.table)
    for (const t of tables) {
      expect(['cooperatives', 'cooperative_membres', 'cooperative_transactions', 'cooperative_stock', 'cooperative_stock_mouvements', 'cooperative_besoins']).toContain(t)
    }
  })

  it('anti-N+1 : exactement 7 lectures après la garde (6 parallèles + agrégat séquencé), toutes bornées à SA coopérative', async () => {
    queueHappyPath()
    await GET(getReq())
    expect(fromMock).toHaveBeenCalledTimes(8) // 1 résolution président + 7 lectures
    const lectures = captured.slice(1)
    expect(lectures).toHaveLength(7)
    for (const l of lectures) {
      expect(l.eqs).toContainEqual(['cooperative_id', 'coop-1'])
    }
  })

  it('la fenêtre temporelle est requêtée avec des bornes ISO (gte précédente, lt demain)', async () => {
    queueHappyPath()
    await GET(getReq(7))
    const fenetre = captured.filter((c) => c.table === 'cooperative_transactions' && c.ranges.length > 0)
    expect(fenetre).toHaveLength(1)
    const ops = fenetre[0].ranges.map((r) => r.op)
    expect(ops).toEqual(['gte', 'lt'])
    for (const r of fenetre[0].ranges) {
      expect(typeof r.val).toBe('string')
      expect(r.val as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }
  })

  it('500 uniforme quand une lecture échoue (erreurServeur)', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [], error: null },
      { data: null, error: { message: 'boom fenêtre' } },
    ]
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(getReq())
    expect(res.status).toBe(500)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toBe('Erreur serveur')
    consoleSpy.mockRestore()
  })

  it('500 uniforme quand le module partagé de trésorerie échoue', async () => {
    resultsQueue = [
      { data: COOP, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, count: 0, error: null },
      { data: null, count: 0, error: null },
      { data: null, error: { message: 'boom all-time' } },
    ]
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(getReq())
    expect(res.status).toBe(500)
    const json = (await res.json()) as { erreur: string }
    expect(json.erreur).toBe('Erreur serveur')
    consoleSpy.mockRestore()
  })
})
