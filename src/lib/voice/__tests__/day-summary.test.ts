import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  buildDaySummarySpeech,
  collectTodaySales,
  type DaySummaryData,
} from '../day-summary'

// VOCAL-607 — résumé vocal des ventes du jour. Règle d'or : le dicté
// correspond TOUJOURS aux données réellement enregistrées (serveur + file
// offline + repli agrégats) — jamais une vente, quantité ou prix inventé.

vi.mock('../../stores/caisse-store', () => ({
  useCaisseStore: {
    getState: vi.fn(() => ({ todaySales: 0, todaySalesCount: 0 })),
  },
}))

vi.mock('../../offline-db', () => ({
  getPendingSyncEntries: vi.fn(async () => []),
}))

import { useCaisseStore } from '../../stores/caisse-store'
import { getPendingSyncEntries } from '../../offline-db'

const getStateMock = useCaisseStore.getState as unknown as Mock
const getQueueMock = vi.mocked(getPendingSyncEntries)

function mockAggregates(todaySales: number, todaySalesCount: number) {
  getStateMock.mockReturnValue({ todaySales, todaySalesCount })
}

beforeEach(() => {
  vi.clearAllMocks()
  getStateMock.mockReturnValue({ todaySales: 0, todaySalesCount: 0 })
  getQueueMock.mockResolvedValue([])
  vi.unstubAllGlobals()
})

// ── buildDaySummarySpeech (pur) ─────────────────────────────────────────────

describe('buildDaySummarySpeech — dicté fidèle aux données réelles', () => {
  it('aucune vente : « Tu n\'as encore enregistré aucune vente aujourd\'hui. »', () => {
    const text = buildDaySummarySpeech({ sales: [], saleCount: 0, total: 0, source: 'server' })
    expect(text).toBe('Tu n\'as encore enregistré aucune vente aujourd\'hui.')
  })

  it('une vente, quantité > 1 : produit, quantité, montant réel', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'sacs de riz', quantity: 3, unitPrice: 8334, total: 25000 }],
      saleCount: 1,
      total: 25000,
      source: 'server',
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as vendu 3 sacs de riz à 25 000 francs. ' +
      'Au total, tu as réalisé 1 vente pour un montant de 25 000 francs.',
    )
  })

  it('plusieurs ventes : « et » avant la dernière ligne (exemple de la demande)', () => {
    const text = buildDaySummarySpeech({
      sales: [
        { name: 'sacs de riz', quantity: 3, unitPrice: 8334, total: 25000 },
        { name: 'bouteilles d\'huile', quantity: 5, unitPrice: 300, total: 1500 },
        { name: 'cartons de tomate', quantity: 2, unitPrice: 4000, total: 8000 },
      ],
      saleCount: 3,
      total: 34500,
      source: 'server',
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as vendu 3 sacs de riz à 25 000 francs, ' +
      '5 bouteilles d\'huile à 1 500 francs et 2 cartons de tomate à 8 000 francs. ' +
      'Au total, tu as réalisé 3 ventes pour un montant de 34 500 francs.',
    )
  })

  it('vente sans quantité notable (1) : pas de quantité plaquée', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'tomates', quantity: 1, unitPrice: 2000, total: 2000 }],
      saleCount: 1,
      total: 2000,
      source: 'server',
    })
    expect(text).toContain('tu as vendu tomates à 2 000 francs')
    expect(text).not.toContain('1 tomates')
  })

  it('repli agrégats : dicté du total réel SANS détail inventé', () => {
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 2,
      total: 9000,
      source: 'aggregates',
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as réalisé 2 ventes pour un montant de 9 000 francs.',
    )
  })

  it('grande journée : détail plafonné mais TOTAL réel complet (jamais tronqué, jamais inventé)', () => {
    const sales = Array.from({ length: 20 }, (_, i) => ({
      name: `produit ${i + 1}`,
      quantity: 1,
      unitPrice: 1000,
      total: 1000,
    }))
    const text = buildDaySummarySpeech({ sales, saleCount: 20, total: 20000, source: 'server' })
    expect(text).toContain('et 8 autres ventes')
    // Le total annoncé est le total réel des 20 ventes.
    expect(text).toContain('pour un montant de 20 000 francs')
    // Aucune ligne fabriquée : seules les 12 premières + le groupement.
    expect(text).toContain('produit 12')
    expect(text).not.toContain('produit 13 à')
  })
})

// ── collectTodaySales (réseau + file offline + repli) ───────────────────────

function stubFetchServer(sales: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ sales }), { status: 200 }),
  ))
}

const SERVER_SALE = {
  id: 'sale-1',
  createdAt: new Date().toISOString(),
  items: [{ productName: 'sacs de riz', quantity: 3, unitPrice: 8334 }],
  totalAmount: 25000,
}

describe('collectTodaySales — sources réelles uniquement', () => {
  it('serveur joignable : lignes et total issus des ventes du serveur', async () => {
    stubFetchServer([SERVER_SALE])

    const data = await collectTodaySales('merchant-1')

    expect(data.source).toBe('server')
    expect(data.saleCount).toBe(1)
    expect(data.total).toBe(25000)
    // Le total dicté de la ligne = montant réellement enregistré (dicté),
    // pas quantité × prix unitaire arrondi (3 × 8 334 = 25 002).
    expect(data.sales[0]).toMatchObject({ name: 'sacs de riz', quantity: 3, total: 25000 })
  })

  it('ventes offline en attente : fusionnées avec le serveur (elles SONT réelles)', async () => {
    stubFetchServer([SERVER_SALE])
    getQueueMock.mockResolvedValue([
      {
        id: 7,
        entity: 'sale',
        createdAt: Date.now(),
        payload: {
          items: [{ productName: 'bouteilles d\'huile', quantity: 5, unitPrice: 300 }],
          totalAmount: 1500,
        },
      },
    ])

    const data = await collectTodaySales('merchant-1')

    expect(data.source).toBe('server+queue')
    expect(data.saleCount).toBe(2)
    expect(data.sales).toHaveLength(2)
    expect(data.sales[1]).toMatchObject({ name: 'bouteilles d\'huile', quantity: 5, total: 1500 })
  })

  it('serveur injoignable + file offline : le dicté part de la file (source queue)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    getQueueMock.mockResolvedValue([
      {
        id: 8,
        entity: 'sale',
        createdAt: Date.now(),
        payload: {
          items: [{ productName: 'gombo', quantity: 2, unitPrice: 500 }],
          totalAmount: 1000,
        },
      },
    ])

    const data = await collectTodaySales('merchant-1')

    expect(data.source).toBe('queue')
    expect(data.saleCount).toBe(1)
    expect(data.total).toBe(1000)
  })

  it('serveur injoignable + aucune offline : repli agrégats caisse (données réelles locales)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    mockAggregates(12000, 3)

    const data = await collectTodaySales('merchant-1')

    expect(data.source).toBe('aggregates')
    expect(data.saleCount).toBe(3)
    expect(data.total).toBe(12000)
    expect(buildDaySummarySpeech(data)).toContain('3 ventes pour un montant de 12 000 francs')
  })

  it('aucune donnée nulle part : « aucune vente » — jamais une vente inventée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const data = await collectTodaySales('merchant-1')

    expect(data.saleCount).toBe(0)
    expect(buildDaySummarySpeech(data)).toBe('Tu n\'as encore enregistré aucune vente aujourd\'hui.')
  })

  it('compte non identifié : pas d\'appel serveur, file offline + agrégats seulement', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockAggregates(5000, 1)

    const data = await collectTodaySales(null)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(data.source).toBe('aggregates')
    expect(data.total).toBe(5000)
  })

  it('réponse serveur en erreur HTTP : repli propre, jamais de levée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"x"}', { status: 500 })))
    mockAggregates(0, 0)

    await expect(collectTodaySales('merchant-1')).resolves.toMatchObject({
      saleCount: 0,
      total: 0,
      source: 'aggregates',
    })
  })

  it('les dépenses de la file ne sont JAMAIS dictées comme des ventes', async () => {
    stubFetchServer([])
    getQueueMock.mockResolvedValue([
      {
        id: 9,
        entity: 'expense',
        createdAt: Date.now(),
        payload: { amount: 4000, category: 'transport' },
      },
    ])

    const data = await collectTodaySales('merchant-1')

    expect(data.saleCount).toBe(0)
    expect(data.sales).toHaveLength(0)
  })
})

// Garde-fou : DaySummaryData reste exporté pour les modales (vérif type).
const _typeGuard: DaySummaryData | null = null
void _typeGuard
