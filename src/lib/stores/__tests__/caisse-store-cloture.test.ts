import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-984 (AUDIT-008) — clôture de caisse TYPÉE : jamais de succès
// générique. Sans session ouverte → 'no_session' / 'already_closed' sans
// AUCUNE mutation (le panier, s'il en reste un, est intact) ; un panier
// non encaissé est refusé ('refuse_panier') tant que l'UI n'a pas confirmé
// l'abandon de façon destructive (abandonPanierConfirme) — une vente non
// encaissée n'est jamais perdue en silence (P0) ; 'closed' seul ferme la
// session, vide le panier, déclenche le bilan marché et le PATCH serveur.

const { queuePendingSyncMock, adjustLocalStockMock, sessionClosedMock, sessionOpenedMock, fetchMock } = vi.hoisted(() => ({
  queuePendingSyncMock: vi.fn(async () => ({ ok: true as const })),
  adjustLocalStockMock: vi.fn(),
  sessionClosedMock: vi.fn(),
  sessionOpenedMock: vi.fn(),
  fetchMock: vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({ ok: true, json: async () => ({}) })),
}))

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: queuePendingSyncMock,
}))

vi.mock('@/lib/market-mode/caisse-link', () => ({
  handleCaisseSessionOpened: sessionOpenedMock,
  handleCaisseSessionClosed: sessionClosedMock,
}))

vi.mock('@/lib/stores/stock-store', () => ({
  useStockStore: { getState: () => ({ adjustLocalStock: adjustLocalStockMock }) },
}))

import { useAppStore } from '@/lib/stores/app-store'
import { useCaisseStore } from '../caisse-store'

function article(id: string, subtotal: number) {
  return { id, name: `Article ${id}`, quantity: 1, unitPrice: subtotal, subtotal }
}

function sessionOuverte(id = 's-1', fond = 5000) {
  return { id, fondDeCaisse: fond, isOpen: true, openedAt: '2026-09-23T08:00:00.000Z' }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  useCaisseStore.setState({
    session: null,
    cart: [],
    amountReceived: 0,
    hasActiveCart: false,
    todaySales: 0,
    todayExpenses: 0,
    todaySalesCount: 0,
  })
  useAppStore.setState({ merchantId: null })
})

describe('closeSession — résultat typé (MODE-984 / AUDIT-008)', () => {
  it('refuse honnêtement sans session (no_session) : aucune mutation, aucun PATCH', () => {
    useCaisseStore.setState({ cart: [article('a1', 2000)] })

    const resultat = useCaisseStore.getState().closeSession(10000)

    expect(resultat).toEqual({ statut: 'no_session' })
    expect(useCaisseStore.getState().session).toBeNull()
    expect(useCaisseStore.getState().cart).toHaveLength(1)
    expect(sessionClosedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse honnêtement une session déjà fermée (already_closed) : panier intact, closedAt intact', () => {
    const fermee = { ...sessionOuverte(), isOpen: false, closedAt: '2026-09-22T20:00:00.000Z' }
    useCaisseStore.setState({ session: fermee, cart: [article('a1', 3000)] })

    const resultat = useCaisseStore.getState().closeSession(10000)

    expect(resultat).toEqual({ statut: 'already_closed' })
    expect(useCaisseStore.getState().session?.closedAt).toBe('2026-09-22T20:00:00.000Z')
    expect(useCaisseStore.getState().session?.isOpen).toBe(false)
    expect(useCaisseStore.getState().cart).toHaveLength(1)
    expect(sessionClosedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuse un panier non encaissé sans confirmation destructive (refuse_panier) : session ET panier intacts (P0)", () => {
    useCaisseStore.setState({ session: sessionOuverte(), cart: [article('a1', 4500), article('a2', 2500)] })

    const resultat = useCaisseStore.getState().closeSession(12000)

    expect(resultat).toEqual({ statut: 'refuse_panier', articles: 2, totalCfa: 7000 })
    expect(useCaisseStore.getState().session?.isOpen).toBe(true)
    expect(useCaisseStore.getState().session?.closedAt).toBeUndefined()
    expect(useCaisseStore.getState().cart).toHaveLength(2)
    expect(useCaisseStore.getState().amountReceived).toBe(0)
    expect(sessionClosedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clôt réellement avec confirmation (closed) : session fermée, panier vidé, bilan marché + PATCH avec countedCash', () => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    useCaisseStore.setState({
      session: sessionOuverte('s-9', 5000),
      cart: [article('a1', 4500)],
      todaySales: 20000,
      todayExpenses: 1500,
    })

    const resultat = useCaisseStore.getState().closeSession(23400, { abandonPanierConfirme: true })

    expect(resultat).toEqual({ statut: 'closed' })
    const session = useCaisseStore.getState().session
    expect(session?.isOpen).toBe(false)
    expect(typeof session?.closedAt).toBe('string')
    expect(useCaisseStore.getState().cart).toEqual([])
    expect(useCaisseStore.getState().amountReceived).toBe(0)
    expect(useCaisseStore.getState().hasActiveCart).toBe(false)
    expect(sessionClosedMock).toHaveBeenCalledTimes(1)
    expect(sessionClosedMock.mock.calls[0][1]).toBe(23400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/marchand/caisse-session')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ merchantId: 'marchand-1', sessionId: 's-9', countedCash: 23400 })
  })

  it('clôt sans panier sans confirmation préalable (le garde ne gêne pas le flux normal)', () => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    useCaisseStore.setState({ session: sessionOuverte('s-2', 1000) })

    const resultat = useCaisseStore.getState().closeSession(3000)

    expect(resultat).toEqual({ statut: 'closed' })
    expect(useCaisseStore.getState().session?.isOpen).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("suit le flux réel de la modale : refuse_panier puis abandon confirmé → closed (le panier ne part qu'à la fin)", () => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    useCaisseStore.setState({ session: sessionOuverte('s-3', 2000), cart: [article('a1', 1200)] })

    const refus = useCaisseStore.getState().closeSession(5000)
    expect(refus.statut).toBe('refuse_panier')
    expect(useCaisseStore.getState().cart).toHaveLength(1)

    const ok = useCaisseStore.getState().closeSession(5000, { abandonPanierConfirme: true })
    expect(ok).toEqual({ statut: 'closed' })
    expect(useCaisseStore.getState().cart).toEqual([])
    expect(sessionClosedMock).toHaveBeenCalledTimes(1)
  })
})
