import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-909 (§28) — annulation de vente côté caisse-store : le journal des
// ventes du jour est APPEND-ONLY (une vente annulée est MARQUÉE, jamais
// retirée), l'annulation est une opération inverse mise en file
// ('sale-reversal'), le stock local revient en DELTA (+qty, jamais une
// valeur absolue — piège D3), les agrégats du jour suivent (jamais sous 0).
// Interdit sur une vente déjà annulée. Offline-first : jamais de réseau,
// jamais de levée.

const { queuePendingSyncMock, adjustLocalStockMock } = vi.hoisted(() => ({
  queuePendingSyncMock: vi.fn(async () => ({ ok: true as const })),
  adjustLocalStockMock: vi.fn(),
}))

vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: queuePendingSyncMock,
}))

vi.mock('@/lib/market-mode/caisse-link', () => ({
  handleCaisseSessionOpened: vi.fn(),
  handleCaisseSessionClosed: vi.fn(),
}))

vi.mock('@/lib/stores/stock-store', () => ({
  useStockStore: { getState: () => ({ adjustLocalStock: adjustLocalStockMock }) },
}))

import { useAppStore } from '@/lib/stores/app-store'
import {
  lastCancellableSale,
  useCaisseStore,
  type CaisseJournalSale,
} from '../caisse-store'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function journalEntry(overrides: Partial<CaisseJournalSale> = {}): CaisseJournalSale {
  return {
    saleClientId: 'sale-1737-abc123',
    amountCfa: 2000,
    items: [{ productName: 'tomates', quantity: 2, unitPrice: 1000, productId: 'p1' }],
    createdAt: Date.now(),
    annulee: false,
    ...overrides,
  }
}

describe('journalTodaySale — journal des ventes du jour (MODE-909)', () => {
  beforeEach(() => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    useCaisseStore.setState({
      todaySalesJournal: [],
      todaySales: 0,
      todaySalesCount: 0,
      todayPoints: [],
    })
    queuePendingSyncMock.mockClear()
    adjustLocalStockMock.mockClear()
  })

  it('ajoute l’entrée au journal, marquée non annulée, SANS file', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 1500,
      items: [{ productName: 'riz', quantity: 1, unitPrice: 1500, productId: 'p2' }],
    })

    const journal = useCaisseStore.getState().todaySalesJournal
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({
      saleClientId: 'sale-1-abc',
      amountCfa: 1500,
      annulee: false,
    })
    // Le journal est local : aucune entrée en file à l'enregistrement.
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
  })

  it('accepte le snapshot du point de vente (MODE-908) sans jamais l’inventer', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 1500,
      items: [],
      point: { clientId: 'point-1', name: 'Marché Treichville' },
    })

    expect(useCaisseStore.getState().todaySalesJournal[0].point).toEqual({
      clientId: 'point-1',
      name: 'Marché Treichville',
    })
  })
})

describe('reverseSale — opération inverse (MODE-909, §28)', () => {
  beforeEach(() => {
    useAppStore.setState({ merchantId: 'marchand-1' })
    useCaisseStore.setState({
      todaySalesJournal: [],
      todaySales: 0,
      todaySalesCount: 0,
      todayPoints: [],
    })
    queuePendingSyncMock.mockClear()
    adjustLocalStockMock.mockClear()
  })

  it('marque l’entrée annulée (flag + raison) SANS la retirer du journal (append-only)', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [{ productName: 'tomates', quantity: 2, unitPrice: 1000, productId: 'p1' }],
    })

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de prix')

    expect(result.ok).toBe(true)
    const journal = useCaisseStore.getState().todaySalesJournal
    // L'entrée RESTE (jamais de suppression) : elle est marquée.
    expect(journal).toHaveLength(1)
    expect(journal[0].annulee).toBe(true)
    expect(journal[0].reason).toBe('Erreur de prix')
    expect(typeof journal[0].annuleeAt).toBe('number')
  })

  it('met l’annulation en file \'sale-reversal\' avec son clientId UUID d’idempotence', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [],
    })
    queuePendingSyncMock.mockClear()

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Client parti')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(queuePendingSyncMock).toHaveBeenCalledTimes(1)
    // La mock est typée sans argument : cast du tuple d'appel (entity, payload).
    const [entity, payload] = queuePendingSyncMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(entity).toBe('sale-reversal')
    expect(payload).toMatchObject({
      merchantId: 'marchand-1',
      saleClientId: 'sale-1-abc',
      reason: 'Client parti',
    })
    // clientId d'idempotence de l'annulation = UUID (rejeu offline = même op).
    expect(typeof payload.clientId).toBe('string')
    expect(String(payload.clientId)).toMatch(UUID_RE)
  })

  it('remet le stock local en DELTA (+qty par item suivi) — jamais une valeur absolue', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 3000,
      items: [
        { productName: 'tomates', quantity: 2, unitPrice: 1000, productId: 'p1' },
        { productName: 'riz', quantity: 3, unitPrice: 666, productId: 'p2' },
      ],
    })
    adjustLocalStockMock.mockClear()

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de produit')

    expect(result.ok).toBe(true)
    expect(adjustLocalStockMock).toHaveBeenCalledTimes(2)
    expect(adjustLocalStockMock).toHaveBeenNthCalledWith(1, 'p1', 2)
    expect(adjustLocalStockMock).toHaveBeenNthCalledWith(2, 'p2', 3)
  })

  it('ignore sans erreur les items sans produit (ligne libre, aucun suivi de stock)', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 1000,
      items: [{ productName: 'service diverse', quantity: 1, unitPrice: 1000 }],
    })
    adjustLocalStockMock.mockClear()

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de produit')

    expect(result.ok).toBe(true)
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
  })

  it('décrémente les agrégats du jour (ventes + comptage + point), jamais sous 0', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [],
      point: { clientId: 'point-1', name: 'Boutique' },
    })
    useCaisseStore.setState({
      todaySales: 2000,
      todaySalesCount: 1,
      todayPoints: [{ clientId: 'point-1', name: 'Boutique', amountCfa: 2000, count: 1 }],
    })

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de prix')

    expect(result.ok).toBe(true)
    const state = useCaisseStore.getState()
    expect(state.todaySales).toBe(0)
    expect(state.todaySalesCount).toBe(0)
    // Le journal par point suit : le montant et le comptage du point retombent.
    expect(state.todayPoints.find((p) => p.clientId === 'point-1')).toMatchObject({
      amountCfa: 0,
      count: 0,
    })
  })

  it('REFUS sur une vente déjà annulée : rien ne bouge, aucune seconde file (§28)', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [{ productName: 'tomates', quantity: 2, unitPrice: 1000, productId: 'p1' }],
    })
    useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de prix')
    queuePendingSyncMock.mockClear()
    adjustLocalStockMock.mockClear()
    const before = useCaisseStore.getState()

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Client parti')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/déjà annulée/i)
    // Aucune remise de stock en double, aucune seconde entrée en file.
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
    expect(useCaisseStore.getState().todaySales).toBe(before.todaySales)
    expect(useCaisseStore.getState().todaySalesCount).toBe(before.todaySalesCount)
  })

  it('REFUS si la raison fait moins de 3 caractères : rien n’est muté ni mis en file', () => {
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [{ productName: 'tomates', quantity: 2, unitPrice: 1000, productId: 'p1' }],
    })
    queuePendingSyncMock.mockClear()
    adjustLocalStockMock.mockClear()

    for (const badReason of ['', '  ', 'ok']) {
      const result = useCaisseStore.getState().reverseSale('sale-1-abc', badReason)
      expect(result.ok).toBe(false)
    }

    const entry = useCaisseStore.getState().todaySalesJournal[0]
    expect(entry.annulee).toBe(false)
    expect(adjustLocalStockMock).not.toHaveBeenCalled()
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
  })

  it('vente introuvable dans le journal du jour : refus honnête', () => {
    const result = useCaisseStore.getState().reverseSale('sale-inconnu-xyz', 'Erreur de prix')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/introuvable/i)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
  })

  it('sans marchand identifié : mutation locale OK, pas de file (l’offline n’est jamais une erreur)', () => {
    useAppStore.setState({ merchantId: null })
    useCaisseStore.getState().journalTodaySale({
      saleClientId: 'sale-1-abc',
      amountCfa: 2000,
      items: [],
    })
    queuePendingSyncMock.mockClear()

    const result = useCaisseStore.getState().reverseSale('sale-1-abc', 'Erreur de prix')

    expect(result.ok).toBe(true)
    expect(useCaisseStore.getState().todaySalesJournal[0].annulee).toBe(true)
    expect(queuePendingSyncMock).not.toHaveBeenCalled()
  })
})

describe('lastCancellableSale — dernière vente locale non annulée (voix §28)', () => {
  it('retourne la plus récente vente non annulée', () => {
    const journal: CaisseJournalSale[] = [
      journalEntry({ saleClientId: 'sale-old', amountCfa: 1000, createdAt: 1 }),
      journalEntry({ saleClientId: 'sale-new', amountCfa: 3000, createdAt: 2 }),
    ]
    expect(lastCancellableSale(journal)?.saleClientId).toBe('sale-new')
  })

  it('saute les ventes déjà annulées (annulation en série : la précédente est proposée)', () => {
    const journal: CaisseJournalSale[] = [
      journalEntry({ saleClientId: 'sale-old', amountCfa: 1000, createdAt: 1 }),
      journalEntry({ saleClientId: 'sale-new', amountCfa: 3000, createdAt: 2, annulee: true }),
    ]
    expect(lastCancellableSale(journal)?.saleClientId).toBe('sale-old')
  })

  it('journal vide ou tout annulé : null (Tata dit qu’elle ne trouve rien)', () => {
    expect(lastCancellableSale([])).toBeNull()
    expect(lastCancellableSale([journalEntry({ annulee: true })])).toBeNull()
  })
})
