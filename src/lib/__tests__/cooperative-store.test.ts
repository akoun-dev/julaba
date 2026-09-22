import { describe, it, expect, vi, beforeEach } from 'vitest'

// Store coopérative (MODE-921) — invariants critiques :
//  1. AUCUNE donnée de démonstration : l'état initial est vide ;
//  2. syncOrQueue renvoie synced | queued | lost et met en file SEULEMENT
//     sur échec réseau (un 4xx métier est rejeté, jamais mis en file) ;
//  3. la distribution n'est JAMAIS mise en file (stock verrouillé serveur).
// offline-db est mocké (pas de localStorage en node) et le fetch global est
// stubé — on teste le store, pas le réseau.

const queuePendingSyncMock = vi.fn(async (): Promise<QueueResult> => ({ ok: true }))
vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: (...args: unknown[]) => queuePendingSyncMock(...(args as [])),
  SyncConflictError: class SyncConflictError extends Error {},
}))

import { useCooperativeStore } from '../stores/cooperative-store'
import { useAppStore } from '../stores/app-store'
import type { QueueResult } from '@/lib/offline-db'

const store = () => useCooperativeStore.getState()

beforeEach(() => {
  // État propre entre les tests (le persist est no-op en node).
  store().reset()
  queuePendingSyncMock.mockClear()
  vi.unstubAllGlobals()
})

describe('cooperative-store — état initial (aucun seed)', () => {
  it('démarre VIDE : pas de membres, pas de transactions, pas de stock', () => {
    expect(store().membres).toEqual([])
    expect(store().transactions).toEqual([])
    expect(store().stock).toEqual([])
    expect(store().besoins).toEqual([])
    expect(store().cooperative).toBeNull()
    expect(store().resume).toBeNull()
    expect(store().maCooperative).toBeNull()
    expect(store().solde).toBe(0)
  })
})

describe('cooperative-store — apporterStock (syncOrQueue)', () => {
  it('synced : le POST passe, rien n\u2019est mis en file', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().apporterStock('m1', { produit: 'Riz', quantite: 10, unite: 'kg' })
    expect(statut).toBe('synced')
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('queued : échec réseau → queuePendingSync appelé avec la MÊME charge', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const payload = { produit: 'Riz', quantite: 10, unite: 'kg' }
    const statut = await store().apporterStock('m1', payload)
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-stock-apport', {
      merchantId: 'm1',
      clientId: expect.any(String),
      ...payload,
    })
    vi.unstubAllGlobals()
  })

  it('lost : échec réseau ET file pleine → lost (pas de succès inventé)', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    queuePendingSyncMock.mockResolvedValueOnce({ ok: false, error: 'quota' } as QueueResult)
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().apporterStock('m1', { produit: 'Riz', quantite: 10, unite: 'kg' })
    expect(statut).toBe('lost')
    vi.unstubAllGlobals()
  })

  // MODE-931 — garde duale du pot commun : la clé du body suit le rôle
  // réel du compte (président coopérateur → cooperateurId, marchand →
  // merchantId). Une session marchand forgée pour le président donnerait
  // un 401/403 (sujet de session ≠ merchant).
  it('MODE-931 : rôle cooperateur → le POST apport porte cooperateurId (pas merchantId)', async () => {
    useAppStore.setState({ userRole: 'cooperateur' })
    try {
      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 201 }))
      vi.stubGlobal('fetch', fetchMock)
      const statut = await store().apporterStock('coop-1', { produit: 'Riz', quantite: 10, unite: 'kg' })
      expect(statut).toBe('synced')
      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
      expect(body.cooperateurId).toBe('coop-1')
      expect(body.merchantId).toBeUndefined()
      vi.unstubAllGlobals()
    } finally {
      useAppStore.setState({ userRole: 'marchand' })
    }
  })

  it('MODE-931 : rôle marchand → le POST distribution porte merchantId (pas cooperateurId)', async () => {
    useAppStore.setState({ userRole: 'marchand' })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => ({ persisted: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await store().distribuerStock('m1', {
      produit: 'Riz',
      quantite: 5,
      unite: 'kg',
      destinataires: [{ membreId: 'm2', quantite: 5 }],
    })
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.merchantId).toBe('m1')
    expect(body.cooperateurId).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('un 422 métier est REJETÉ (lève), jamais mis en file — le rejeu serait rejeté pareil', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ erreur: 'Stock commun insuffisant pour cette distribution' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      store().distribuerStock('m1', {
        produit: 'Riz',
        quantite: 999,
        unite: 'kg',
        destinataires: [{ membreId: 'm2', quantite: 999 }],
      })
    ).rejects.toThrow(/Stock commun insuffisant/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — distribution (jamais en file offline)', () => {
  it('réseau coupé → ErreurReseau explicite, PAS de queuePendingSync', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      store().distribuerStock('m1', {
        produit: 'Riz',
        quantite: 5,
        unite: 'kg',
        destinataires: [{ membreId: 'm2', quantite: 5 }],
      })
    ).rejects.toThrow(/Réseau indisponible/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — cotisation et adhésion (marchand)', () => {
  it('payerCotisation synced → rechargement de ma-cooperative', async () => {
    const responses: Record<string, unknown> = {
      '/api/cooperatives/cotisation': { transaction: { id: 't1' } },
      '/api/cooperatives/ma-cooperative': {
        membre: { id: 'x', statut: 'actif', role: 'membre', dateAdhesion: null, cotisationPayee: true },
        cooperative: { id: 'c1', nom: 'Coop Test', commune: null, responsableNom: 'Awa' },
        distributionsRecues: [],
        besoins: [],
      },
    }
    const fetchMock = vi.fn(async (url: string) => {
      const base = (url as string).split('?')[0]
      return {
        ok: true,
        status: 201,
        json: async () => responses[base],
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().payerCotisation('m1', 25000)
    expect(statut).toBe('synced')
    expect(store().maCooperative?.membre?.cotisationPayee).toBe(true)
    // MODE-986 — canal par défaut : espèces (voie historique inchangée).
    const payloadDefaut = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string)
    expect(payloadDefaut.canal).toBe('especes')
    vi.unstubAllGlobals()
  })

  it('payerCotisation keiwa → le canal voyage dans la requête (débit serveur)', async () => {
    const responses: Record<string, unknown> = {
      '/api/cooperatives/cotisation': {
        transaction: { id: 't-k1' },
        cotisationPayee: true,
        canal: 'keiwa',
        soldeKeiwa: 0,
      },
      '/api/cooperatives/ma-cooperative': {
        membre: { id: 'x', statut: 'actif', role: 'membre', dateAdhesion: null, cotisationPayee: true },
        cooperative: { id: 'c1', nom: 'Coop Test', commune: null, responsableNom: 'Awa' },
        distributionsRecues: [],
        besoins: [],
      },
    }
    const fetchMock = vi.fn(async (url: string) => {
      const base = (url as string).split('?')[0]
      return {
        ok: true,
        status: 201,
        json: async () => responses[base],
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().payerCotisation('m1', 25000, 'keiwa')
    expect(statut).toBe('synced')
    const payload = JSON.parse(((fetchMock.mock.calls as unknown[][])[0][1] as RequestInit).body as string)
    expect(payload.canal).toBe('keiwa')
    expect(payload.montant).toBe(25000)
    vi.unstubAllGlobals()
  })

  it('rejoindreCooperative 409 métier → lève l\u2019erreur lisible (pas de file)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ erreur: 'Votre demande d\u2019adhésion à cette coopérative est déjà en attente' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(store().rejoindreCooperative('m1', 'c1')).rejects.toThrow(/déjà en attente/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — ajouterMarchand (MODE-922 : ajout par téléphone)', () => {
  it('synced : le POST /membres passe, rien n\u2019est mis en file', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ membre: { id: 'ad1', statut: 'actif', role: 'membre' } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().ajouterMarchand('coop1', 'm9')
    expect(statut).toBe('synced')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cooperatives/membres',
      expect.objectContaining({ method: 'POST' })
    )
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('409 métier (marchand déjà actif ailleurs) → erreur lisible, jamais en file', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ erreur: 'Ce marchand est déjà membre d\u2019une autre coopérative' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(store().ajouterMarchand('coop1', 'm9')).rejects.toThrow(/déjà membre d\u2019une autre coopérative/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — chargerAnnuaire (MODE-922 : session marchand requise)', () => {
  it('passe le merchantId à l\u2019API liste (garde requireMarchandSession)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cooperatives: [{ id: 'c1', nom: 'Coop Test', commune: null, responsableNom: null, membresActifs: 0 }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await store().chargerAnnuaire('m1')
    expect(fetchMock).toHaveBeenCalledWith('/api/cooperatives/liste?merchantId=m1')
    expect(store().annuaire).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})

// ── MODE-974 (AUDIT-007 G16) — ecrituresEnAttente ─────────────────────────
// Le compteur `enAttente` calculé serveur par GET /tresorerie était JAMAIS
// lu par le front (écart G16 de l'audit) : il alimente désormais le badge
// de l'onglet Trésorerie. Contrats : mapping exact, défaut 0 honnête,
// persistance de la dernière valeur connue.

describe('cooperative-store — ecrituresEnAttente (MODE-974, AUDIT-007 G16)', () => {
  /** Stub des 6 lectures de chargerEspaceCooperateur — la trésorerie est
   * paramétrable (body différent selon le cas de test). */
  const stubChargement = async (tresorerie: Record<string, unknown>) => {
    const reponse = (body: unknown) => ({ ok: true, json: async () => body })
    const resume = {
      membresTotal: 3, membresActifs: 3, adhesionsEnAttente: 0, membresSuspendus: 0,
      soldeTresorerie: 5000, totalCotisations: 12000, produitsEnStock: 0, articlesEnStock: 0,
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/cooperatives?')) return reponse({ cooperative: { id: 'c1', nom: 'Kôkô', commune: 'Bouaké' }, resume })
      if (url.includes('/api/cooperatives/membres')) return reponse({ membres: [] })
      if (url.includes('/api/cooperatives/tresorerie')) return reponse({ transactions: [], solde: 5000, totalCotisations: 12000, ...tresorerie })
      if (url.includes('/api/cooperatives/stock')) return reponse({ stock: [] })
      if (url.includes('/api/cooperatives/besoins')) return reponse({ besoins: [], groupes: [] })
      if (url.includes('/api/scores/me')) return reponse({ score: 60, niveau: 'moyen' })
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
  }

  it('mappe le compteur serveur enAttente du GET trésorerie (fin de l\u2019écart G16)', async () => {
    await stubChargement({ enAttente: 3 })
    await store().chargerEspaceCooperateur('c1')
    expect(store().ecrituresEnAttente).toBe(3)
    expect(store().solde).toBe(5000)
    vi.unstubAllGlobals()
  })

  it('enAttente absent de la réponse → 0 (ni NaN, ni invention)', async () => {
    await stubChargement({})
    await store().chargerEspaceCooperateur('c1')
    expect(store().ecrituresEnAttente).toBe(0)
    vi.unstubAllGlobals()
  })

  it('trésorerie en échec (section en erreur) → le compteur précédent reste (pas d\u2019écrasement par un zéro)', async () => {
    // 1er chargement : 3 écritures en attente connues.
    await stubChargement({ enAttente: 3 })
    await store().chargerEspaceCooperateur('c1', ['tresorerie'])
    expect(store().ecrituresEnAttente).toBe(3)
    vi.unstubAllGlobals()
    // 2ᵉ chargement : la trésorerie échoue → les données précédentes restent.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/cooperatives/tresorerie')) {
        return { ok: false, json: async () => ({ erreur: 'indisponible' }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    await store().chargerEspaceCooperateur('c1', ['tresorerie'])
    expect(store().sectionsEnErreur).toContain('tresorerie')
    expect(store().ecrituresEnAttente).toBe(3)
    vi.unstubAllGlobals()
  })

  it('reset() remet le compteur à zéro (état initial honnête)', () => {
    store().reset()
    expect(store().ecrituresEnAttente).toBe(0)
  })
})

// ── MODE-975 (AUDIT-007 Phase 3) — dashboard (consommateur MODE-972) ─────
// L'agrégat GET /api/cooperatives/dashboard (Task 126) est enfin consommé
// par le store. Contrats : UNE requête par chargement (l'agrégat unique),
// mapping période 7j|30j → jours=7|30, fallback offline (le dernier
// agrégat connu n'est JAMAIS écrasé par null — même discipline que les
// sections en erreur), reset honnête.

describe('cooperative-store — chargerDashboard (MODE-975, AUDIT-007 Phase 3)', () => {
  const AGREGAT = {
    cooperative: { id: 'c1', nom: 'Kôkô', commune: 'Bouaké', responsableId: 'c1', actif: true },
    periode: { jours: 7, debut: '2026-09-16', fin: '2026-09-22' },
    genereLe: '2026-09-22T10:00:00.000Z',
    resume: {
      membresTotal: 6, membresActifs: 5, adhesionsEnAttente: 2, membresSuspendus: 1,
      soldeTresorerie: 23000, totalCotisations: 12000, produitsEnStock: 3, articlesEnStock: 40,
    },
    series: { tresorerie: [{ jour: '2026-09-22', entrees: 2000, sorties: 500, cotisations: 1500, net: 1500 }] },
    kpis: {
      membresGagnes: { valeur: 3, precedent: 1, delta: 2 },
      tresorerieNette: { valeur: 1500, precedent: -500, delta: 2000 },
      cotisations: { valeur: 1500, precedent: 1000, delta: 500 },
    },
    topProduits: [{ produit: 'Riz', categorie: 'céréale', unite: 'kg', quantite: 25 }],
    mouvementsRecents: [{ id: 'mv1', produit: 'Riz', unite: 'kg', type: 'apport', quantite: 10, membreId: 'm2', date: '2026-09-22T09:00:00.000Z' }],
    fileActions: { adhesionsEnAttente: 2, ecrituresEnAttente: 3, besoinsADispatcher: 1 },
  }

  const stubDashboard = async (reponse: { ok?: boolean; status?: number; body?: unknown } = { ok: true, body: AGREGAT }) => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: reponse.ok ?? true,
      status: reponse.status ?? 200,
      json: async () => reponse.body,
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('stocke l\u2019agrégat serveur TEL QUEL (aucun recalcul client) et actualise la période', async () => {
    await stubDashboard()
    await store().chargerDashboard('c1', '7j')
    expect(store().dashboard).toEqual(AGREGAT)
    expect(store().periodeDashboard).toBe('7j')
    expect(store().dashboardEnErreur).toBe(false)
    expect(store().dashboardChargement).toBe(false)
    vi.unstubAllGlobals()
  })

  it('appelle /api/cooperatives/dashboard avec UNE requête et le bon paramètre jours', async () => {
    const fetchMock = await stubDashboard()
    await store().chargerDashboard('c1', '30j')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/cooperatives/dashboard?cooperateurId=c1&jours=30')
    expect(store().periodeDashboard).toBe('30j')
    vi.unstubAllGlobals()
  })

  it('sans période explicite → recharge la fenêtre COURANTE (pas de saut de fenêtre)', async () => {
    const fetchMock = await stubDashboard()
    await store().chargerDashboard('c1', '7j')
    expect(store().periodeDashboard).toBe('7j')
    vi.unstubAllGlobals()
    const fetchMock2 = await stubDashboard()
    await store().chargerDashboard('c1')
    expect(fetchMock2).toHaveBeenCalledWith('/api/cooperatives/dashboard?cooperateurId=c1&jours=7')
    vi.unstubAllGlobals()
  })

  it('échec réseau → le dernier agrégat connu RESTE affiché (pas d\u2019écrasement par null)', async () => {
    await stubDashboard()
    await store().chargerDashboard('c1', '7j')
    expect(store().dashboard).toEqual(AGREGAT)
    vi.unstubAllGlobals()
    // 2ᵉ chargement en échec (offline) — agrégat conservé.
    const fetchMockKo = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMockKo)
    await store().chargerDashboard('c1', '30j')
    expect(store().dashboard).toEqual(AGREGAT)
    expect(store().dashboardEnErreur).toBe(true)
    expect(store().dashboardChargement).toBe(false)
    // La fenêtre demandée n'est PAS commémorée en cas d'échec : l'affichage
    // (7 j, données connues) et la fenêtre du store restent cohérents.
    expect(store().periodeDashboard).toBe('7j')
    vi.unstubAllGlobals()
  })

  it('500 serveur → même contrat offline (agrégat conservé, erreur annoncée)', async () => {
    await stubDashboard({ ok: false, status: 500, body: { erreur: 'dashboard GET indisponible' } })
    await store().chargerDashboard('c1', '7j')
    expect(store().dashboard).toBeNull()
    expect(store().dashboardEnErreur).toBe(true)
    vi.unstubAllGlobals()
  })

  it('reset() remet le dashboard à null (jamais d\u2019agrégat résiduel)', async () => {
    await stubDashboard()
    await store().chargerDashboard('c1', '7j')
    expect(store().dashboard).not.toBeNull()
    vi.unstubAllGlobals()
    store().reset()
    expect(store().dashboard).toBeNull()
    expect(store().periodeDashboard).toBe('7j')
    expect(store().dashboardChargement).toBe(false)
    expect(store().dashboardEnErreur).toBe(false)
  })

  it('état initial : dashboard null, fenêtre 7 j, aucun flag d\u2019erreur', () => {
    store().reset()
    expect(store().dashboard).toBeNull()
    expect(store().periodeDashboard).toBe('7j')
    expect(store().dashboardEnErreur).toBe(false)
  })
})

// ── MODE-976 (AUDIT-007 G3/G10) — sélection de la fiche membre ────────────
// Le premier drill-down de l'espace coopérative : la sélection est
// persistée (le retour matériel Android ne perd plus le contexte) et
// rejoint VIDE/reset (jamais de fiche résiduelle d'un autre compte).

describe('cooperative-store — selectionnerMembre (MODE-976, G3/G10)', () => {
  it('sélectionne un membre, puis referme avec null', () => {
    store().selectionnerMembre('m-42')
    expect(store().membreSelectionneId).toBe('m-42')
    store().selectionnerMembre(null)
    expect(store().membreSelectionneId).toBeNull()
  })

  it('reset() remet la sélection à null (jamais de fiche résiduelle)', () => {
    store().selectionnerMembre('m-42')
    expect(store().membreSelectionneId).toBe('m-42')
    store().reset()
    expect(store().membreSelectionneId).toBeNull()
  })

  it('la sélection accepte de CHANGER de membre sans refermer (navigation directe)', () => {
    store().selectionnerMembre('m-1')
    store().selectionnerMembre('m-2')
    expect(store().membreSelectionneId).toBe('m-2')
  })
})

// ── MODE-977 (AUDIT-007 G9) — les DÉCISIONS rejoignent la file offline ────
// Contrats : entité de file DÉDIÉE par décision, payload AUTOPORTEUR (l'id
// cible voyage dans le charge pour que le rejeu reconstruise l'URL),
// mutation optimiste appliquée pour synced ET queued (jamais pour lost ni
// pour un 4xx live), et distribution TOUJOURS hors file (verrou MODE-931).

const membreFictif = (statut: 'actif' | 'en_attente' = 'en_attente') => ({
  id: 'adh-1',
  marchandId: 'm9',
  prenom: 'Aliou',
  nom: null,
  telephone: '0102030405',
  commune: null,
  statut,
  role: 'membre' as const,
  dateAdhesion: null,
  cotisationPayee: false,
  totalCotisations: 0,
  membreDepuis: '2026-09-01',
  scoreJulaba: null,
})

describe('cooperative-store — décisions offline (MODE-977, G9 : changerStatutMembre)', () => {
  it('queued : le PATCH part en file avec l\u2019entité dédiée et le payload autoporeteur, mutation locale APPLIQUÉE', async () => {
    useCooperativeStore.setState({ membres: [membreFictif()] })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().changerStatutMembre('coop1', 'adh-1', 'actif')
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-membre-statut', {
      cooperateurId: 'coop1',
      membreId: 'adh-1',
      statut: 'actif',
      motif: undefined,
    })
    // Optimiste : le président voit sa décision même hors ligne.
    expect(store().membres.find((m) => m.id === 'adh-1')?.statut).toBe('actif')
    vi.unstubAllGlobals()
  })

  it('synced : pas de file, mutation locale appliquée', async () => {
    useCooperativeStore.setState({ membres: [membreFictif()] })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ membre: { id: 'adh-1', statut: 'actif', role: 'membre' } }) }))
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().changerStatutMembre('coop1', 'adh-1', 'actif')
    expect(statut).toBe('synced')
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(store().membres.find((m) => m.id === 'adh-1')?.statut).toBe('actif')
    vi.unstubAllGlobals()
  })

  it('4xx live : rejet métier (lève + syncError), état local NON altéré', async () => {
    useCooperativeStore.setState({ membres: [membreFictif()] })
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ erreur: 'Ce marchand est déjà actif dans une autre coopérative' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(store().changerStatutMembre('coop1', 'adh-1', 'actif')).rejects.toThrow(/déjà actif/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(store().membres.find((m) => m.id === 'adh-1')?.statut).toBe('en_attente')
    expect(store().syncError).toMatch(/déjà actif/)
    vi.unstubAllGlobals()
  })

  it('lost : file pleine → l\u2019état local reste véridique (pas de décision fantôme)', async () => {
    useCooperativeStore.setState({ membres: [membreFictif()] })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    queuePendingSyncMock.mockResolvedValueOnce({ ok: false, error: 'quota' } as QueueResult)
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().changerStatutMembre('coop1', 'adh-1', 'actif')
    expect(statut).toBe('lost')
    expect(store().membres.find((m) => m.id === 'adh-1')?.statut).toBe('en_attente')
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — décisions offline (MODE-977, G9 : exclureMembre)', () => {
  it('queued : DELETE en file avec les ids autoporeteurs, membre retiré localement, fiche refermée si elle était ouverte', async () => {
    useCooperativeStore.setState({ membres: [membreFictif('actif')], membreSelectionneId: 'adh-1' })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().exclureMembre('coop1', 'adh-1')
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-membre-exclusion', {
      cooperateurId: 'coop1',
      membreId: 'adh-1',
    })
    expect(store().membres).toHaveLength(0)
    expect(store().membreSelectionneId).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — décisions offline (MODE-977, G9 : changerStatutTransaction)', () => {
  const txFictive = (statut: 'en_attente' | 'validee' = 'en_attente') => ({
    id: 'tx-1',
    type: 'entree' as const,
    categorie: 'cotisation',
    montant: 5000,
    description: 'Cotisation Aliou',
    statut,
    date: '2026-09-20',
    membreId: 'm9',
  })

  it('queued : PATCH en file, statut local appliqué, PAS de rechargement (réseau down)', async () => {
    useCooperativeStore.setState({ transactions: [txFictive()] })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().changerStatutTransaction('coop1', 'tx-1', 'validee')
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-transaction-statut', {
      cooperateurId: 'coop1',
      transactionId: 'tx-1',
      statut: 'validee',
    })
    expect(store().transactions.find((t) => t.id === 'tx-1')?.statut).toBe('validee')
    // Le rechargement n'a pas eu lieu : un seul fetch (le PATCH échoué).
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('synced : mutation locale PUIS rechargement ciblé resume+tresorerie (le solde est réel)', async () => {
    useCooperativeStore.setState({ transactions: [txFictive()] })
    const fetchMock = vi.fn(async (url: string) => {
      const base = (url as string).split('?')[0]
      if (base.endsWith('/api/cooperatives/tresorerie/tx-1')) {
        return { ok: true, status: 200, json: async () => ({ transaction: { id: 'tx-1', statut: 'validee' } }) }
      }
      if (base === '/api/cooperatives' || base === '/api/cooperatives/tresorerie') {
        return { ok: true, status: 200, json: async () => ({ resume: null, transactions: [txFictive('validee')], solde: 5000, totalCotisations: 5000, enAttente: 0 }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().changerStatutTransaction('coop1', 'tx-1', 'validee')
    expect(statut).toBe('synced')
    // PATCH + 2 rechargements de section (resume + tresorerie), PAS plus.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — décisions offline (MODE-977, G9 : besoins)', () => {
  const besoinFictif = (id: string, statut: 'en_attente' | 'consolide' | 'en_cours' | 'livre' = 'en_attente') => ({
    id,
    marchandId: 'm9',
    produit: 'Huile',
    categorie: null,
    quantite: 5,
    unite: 'L',
    prixMax: null,
    priorite: 'normale' as const,
    statut,
    date: '2026-09-20',
  })

  it('traiterBesoin queued : PATCH en file avec l\u2019id autoporeteur, dispatch appliqué localement', async () => {
    useCooperativeStore.setState({ besoins: [besoinFictif('b-1')] })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().traiterBesoin('coop1', 'b-1', { statut: 'en_cours', quantiteAttribuee: 5 })
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-besoin-traitement', {
      cooperateurId: 'coop1',
      besoinId: 'b-1',
      statut: 'en_cours',
      quantiteAttribuee: 5,
    })
    expect(store().besoins.find((b) => b.id === 'b-1')?.statut).toBe('en_cours')
    vi.unstubAllGlobals()
  })

  it('consoliderBesoins queued : POST en file, seuls les en_attente du groupe passent à consolidé LOCALEMENT', async () => {
    useCooperativeStore.setState({
      besoins: [besoinFictif('b-1'), { ...besoinFictif('b-2'), produit: 'Sucre' }, besoinFictif('b-3', 'livre')],
    })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    const statut = await store().consoliderBesoins('coop1', { produit: 'Huile', unite: 'L' })
    expect(statut).toBe('queued')
    expect(queuePendingSyncMock).toHaveBeenCalledWith('cooperative-besoins-consolidation', {
      cooperateurId: 'coop1',
      produit: 'Huile',
      unite: 'L',
    })
    expect(store().besoins.find((b) => b.id === 'b-1')?.statut).toBe('consolide')
    expect(store().besoins.find((b) => b.id === 'b-2')?.statut).toBe('en_attente')
    expect(store().besoins.find((b) => b.id === 'b-3')?.statut).toBe('livre')
    vi.unstubAllGlobals()
  })

  it('4xx live sur le dispatch : rejet métier, état local NON altéré', async () => {
    useCooperativeStore.setState({ besoins: [besoinFictif('b-1')] })
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ erreur: 'Quantité attribuée invalide' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(store().traiterBesoin('coop1', 'b-1', { statut: 'en_cours', quantiteAttribuee: 0 }))
      .rejects.toThrow(/Quantité attribuée invalide/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(store().besoins.find((b) => b.id === 'b-1')?.statut).toBe('en_attente')
    vi.unstubAllGlobals()
  })
})

describe('cooperative-store — distribution TOUJOURS hors file (MODE-931 préservé par MODE-977)', () => {
  it('rappel : la distribution exige le réseau, jamais queuePendingSync', async () => {
    useAppStore.setState({ userRole: 'cooperateur' })
    const fetchMock = vi.fn(async () => { throw new Error('réseau') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      store().distribuerStock('coop1', { produit: 'Riz', unite: 'kg', quantite: 2, destinataires: [{ membreId: 'm9', quantite: 2 }] }),
    ).rejects.toThrow(/Réseau indisponible/)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
