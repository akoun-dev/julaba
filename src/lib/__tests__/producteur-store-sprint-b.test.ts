import { describe, it, expect, vi, beforeEach } from 'vitest'

// MODE-935 — actions producteur du Sprint B (I-01 « mettre en stock »,
// I-03 « terminer le cycle »). offline-db est mocké (pas de localStorage
// en node) et le fetch global est stubé — on teste le store, pas le réseau.

const queuePendingSyncMock = vi.fn(async (): Promise<QueueResult> => ({ ok: true }))
vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: (...args: unknown[]) => queuePendingSyncMock(...(args as [])),
  SyncConflictError: class SyncConflictError extends Error {},
}))

import { useProducteurStore } from '../stores/producteur-store'
import { useAppStore } from '../stores/app-store'
import type { QueueResult } from '@/lib/offline-db'

const store = () => useProducteurStore.getState()

const CYCLE = {
  id: 'cycle-123',
  produit: 'Maïs',
  parcelle: 'Champ Nord',
  dateSemis: '2026-06-01',
  dateRecoltePrevue: '2026-09-30',
  joursEcoules: 110,
  joursTotal: 121,
  phase: 'Maturation',
  journal: [],
}

beforeEach(() => {
  // État propre entre les tests (le persist est no-op en node).
  useProducteurStore.setState({
    recoltes: [],
    commandes: [],
    stock: [],
    cycleEnCours: null,
    cyclesTermines: [],
    syncError: null,
    syncNotice: null,
    pendingOperations: {},
  })
  useAppStore.setState({ merchantId: 'prod-1' })
  queuePendingSyncMock.mockClear()
  vi.unstubAllGlobals()
})

describe('terminerCycle (I-03) — clôture avec quantité réelle', () => {
  it('synced : le cycle passe en historique avec la période et la quantité saisie', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    useProducteurStore.setState({ cycleEnCours: CYCLE })

    store().terminerCycle(320)

    expect(store().cycleEnCours).toBeNull()
    expect(store().cyclesTermines).toHaveLength(1)
    expect(store().cyclesTermines[0]).toEqual({
      id: 'cycle-123',
      produit: 'Maïs',
      periode: '2026-06-01 → 2026-09-30',
      quantiteRecolteeKg: 320,
    })
    // Le PATCH part avec les champs EXACTS que l'API valide (rejeu verbatim).
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/producteur/cycles',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({
      id: 'cycle-123',
      producteurId: 'prod-1',
      statut: 'termine',
      quantiteRecolteeKg: 320,
    })
    vi.unstubAllGlobals()
  })

  it('sans cycle en cours → refus EXPLICITE (syncError), rien n’est envoyé', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    store().terminerCycle(100)
    expect(store().syncError).toBe('Aucun cycle en cours à terminer.')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sans session producteur → refus explicite, jamais d’id fantôme', () => {
    useAppStore.setState({ merchantId: null })
    useProducteurStore.setState({ cycleEnCours: CYCLE })
    store().terminerCycle(100)
    expect(store().syncError).toBe('Connectez-vous pour enregistrer vos données.')
    expect(store().cycleEnCours).not.toBeNull() // l'état local n'est pas détruit par un refus
  })

  it('quantité négative ou absurde → arrondie à 0, jamais négative', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    useProducteurStore.setState({ cycleEnCours: CYCLE })
    store().terminerCycle(-50)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body).quantiteRecolteeKg).toBe(0)
    vi.unstubAllGlobals()
  })
})

describe('mettreEnStock (I-01) — le writer du stock producteur', () => {
  it('synced : la récolte passe en disponible, PATCH {id, statut:"disponible"}', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    useProducteurStore.setState({
      recoltes: [{ id: 'r1', produit: 'Maïs', quantiteKg: 100, qualite: 'standard', dateRecolte: '2026-09-10', parcelle: '', prixSouhaiteParKg: 250, photos: [], statut: 'publiee' }],
    })

    store().mettreEnStock('r1')

    expect(store().recoltes[0].statut).toBe('disponible')
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/producteur/recoltes',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({ id: 'r1', statut: 'disponible' })
    vi.unstubAllGlobals()
  })

  it('hors ligne : la même charge part en file (rejeu verbatim)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau') }))
    useProducteurStore.setState({
      recoltes: [{ id: 'r2', produit: 'Riz', quantiteKg: 40, qualite: 'premium', dateRecolte: '2026-09-11', parcelle: '', prixSouhaiteParKg: 400, photos: [], statut: 'brouillon' }],
    })

    store().mettreEnStock('r2')

    await vi.waitFor(() => expect(queuePendingSyncMock).toHaveBeenCalled())
    expect(queuePendingSyncMock).toHaveBeenCalledWith('recolte-update', { id: 'r2', statut: 'disponible' })
    vi.unstubAllGlobals()
  })
})
