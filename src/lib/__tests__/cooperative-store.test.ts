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
