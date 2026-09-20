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
