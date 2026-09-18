import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  buildDaySummarySpeech,
  collectTodaySales,
  type DaySummaryData,
} from '../day-summary'

// VOCAL-607 — résumé vocal des ventes du jour. Règle d'or : le dicté
// correspond TOUJOURS aux données réellement enregistrées (serveur + file
// offline + repli agrégats) — jamais une vente, quantité ou prix inventé.
// VOCAL-608 — le résumé dicte AUSSI les dépenses réelles du jour, avec le
// même ordre de confiance et la même interdiction d'inventer.

vi.mock('../../stores/caisse-store', () => ({
  useCaisseStore: {
    getState: vi.fn(() => ({ todaySales: 0, todaySalesCount: 0, todayExpenses: 0 })),
  },
}))

vi.mock('../../offline-db', () => ({
  getPendingSyncEntries: vi.fn(async () => []),
}))

import { useCaisseStore } from '../../stores/caisse-store'
import { getPendingSyncEntries } from '../../offline-db'

const getStateMock = useCaisseStore.getState as unknown as Mock
const getQueueMock = vi.mocked(getPendingSyncEntries)

function mockAggregates(todaySales: number, todaySalesCount: number, todayExpenses = 0) {
  getStateMock.mockReturnValue({ todaySales, todaySalesCount, todayExpenses })
}

beforeEach(() => {
  vi.clearAllMocks()
  getStateMock.mockReturnValue({ todaySales: 0, todaySalesCount: 0, todayExpenses: 0 })
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
      'En tout, ça fait 1 vente pour 25 000 francs.',
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
      'En tout, ça fait 3 ventes pour 34 500 francs.',
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
      'Aujourd\'hui, tu as fait 2 ventes pour 9 000 francs.',
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
    expect(text).toContain('ça fait 20 ventes pour 20 000 francs')
    // Aucune ligne fabriquée : seules les 12 premières + le groupement.
    expect(text).toContain('produit 12')
    expect(text).not.toContain('produit 13 à')
  })
})

// ── buildDaySummarySpeech — dépenses du jour (VOCAL-608) ────────────────────

describe('buildDaySummarySpeech — dépenses dictées fidèles aux données réelles', () => {
  it('ventes puis dépenses : chaque dépense dictée (montant, libellé réel) + total dépenses', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'sacs de riz', quantity: 3, unitPrice: 8334, total: 25000 }],
      saleCount: 1,
      total: 25000,
      source: 'server',
      expenses: [
        { label: 'Transport', amount: 1000 },
        { label: 'Aliment', amount: 500 },
      ],
      expenseCount: 2,
      expenseTotal: 1500,
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as vendu 3 sacs de riz à 25 000 francs. ' +
      'En tout, ça fait 1 vente pour 25 000 francs. ' +
      'Tu as aussi dépensé 1 000 francs pour Transport et 500 francs pour Aliment. ' +
      'Tes dépenses font 1 500 francs. ' +
      'Ton solde de caisse est de 23 500 francs.',
    )
  });

  it('solde de caisse : ventes − dépenses dicté EN FIN de résumé (VOCAL-609)', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'sacs de riz', quantity: 3, unitPrice: 8334, total: 25000 }],
      saleCount: 1,
      total: 25000,
      source: 'server',
      expenses: [{ label: 'Transport', amount: 1000 }, { label: 'Aliment', amount: 500 }],
      expenseCount: 2,
      expenseTotal: 1500,
    })
    expect(text).toContain('Ton solde de caisse est de 23 500 francs.')
    // Le solde est bien la DERNIÈRE phrase du dicté.
    expect(text.trim().endsWith('Ton solde de caisse est de 23 500 francs.')).toBe(true)
  })

  it('aucune vente mais des dépenses réelles : le dicté le dit puis dicte les dépenses', () => {
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 0,
      total: 0,
      source: 'server',
      expenses: [{ label: 'Glace', amount: 500 }],
      expenseCount: 1,
      expenseTotal: 500,
    })
    expect(text).toBe(
      'Tu n\'as encore enregistré aucune vente aujourd\'hui. ' +
      'Tu as dépensé 500 francs pour Glace. ' +
      'Tes dépenses font 500 francs. ' +
      'Attention, tes dépenses dépassent tes ventes de 500 francs.',
    )
  })

  it('aucune vente ni dépense (champs fournis) : bilan vide honnête couvrant les deux', () => {
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 0,
      total: 0,
      source: 'server',
      expenses: [],
      expenseCount: 0,
      expenseTotal: 0,
    })
    expect(text).toBe('Tu n\'as encore enregistré aucune vente ni dépense aujourd\'hui.')
    // Jour totalement vide : PAS de solde dicté (du bruit pour rien).
    expect(text).not.toContain('solde de caisse')
  })

  it('ventes présentes, aucune dépense (champs fournis) : Tata le dit explicitement', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'tomates', quantity: 1, unitPrice: 2000, total: 2000 }],
      saleCount: 1,
      total: 2000,
      source: 'server',
      expenses: [],
      expenseCount: 0,
      expenseTotal: 0,
    })
    expect(text).toContain('tu as vendu tomates à 2 000 francs')
    expect(text).toContain('Tu n\'as enregistré aucune dépense aujourd\'hui.')
    // VOCAL-609 : solde = ventes − 0 = total ventes, dicté en fin.
    expect(text.trim().endsWith('Ton solde de caisse est de 2 000 francs.')).toBe(true)
  })

  it('repli agrégats dépenses (ventes présentes) : dicté du total réel SANS détail inventé', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'tomates', quantity: 1, unitPrice: 2000, total: 2000 }],
      saleCount: 1,
      total: 2000,
      source: 'server',
      expenses: [],
      expenseCount: 0,
      expenseTotal: 3000,
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as vendu tomates à 2 000 francs. ' +
      'En tout, ça fait 1 vente pour 2 000 francs. ' +
      'Tes dépenses font 3 000 francs. ' +
      'Attention, tes dépenses dépassent tes ventes de 1 000 francs.',
    )
  })

  it('grande journée de dépenses : détail plafonné mais TOTAL réel complet', () => {
    const expenses = Array.from({ length: 15 }, (_, i) => ({
      label: `dépense ${i + 1}`,
      amount: 100,
    }))
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 0,
      total: 0,
      source: 'server',
      expenses,
      expenseCount: 15,
      expenseTotal: 1500,
    })
    expect(text).toContain('et 3 autres dépenses')
    expect(text).toContain('Tes dépenses font 1 500 francs.')
    expect(text).toContain('dépense 12')
    expect(text).not.toContain('dépense 13')
    // VOCAL-609 : solde négatif dicté honnêtement (0 vente, 1 500 de dépenses).
    expect(text).toContain('Attention, tes dépenses dépassent tes ventes de 1 500 francs.')
  })
})

// ── buildDaySummarySpeech — solde de caisse (VOCAL-609) ─────────────────────

describe('buildDaySummarySpeech — solde de caisse en fin de résumé', () => {
  it('ventes = dépenses : solde nul dicté « zéro franc » (données réelles)', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'beignets', quantity: 10, unitPrice: 300, total: 3000 }],
      saleCount: 1,
      total: 3000,
      source: 'server',
      expenses: [{ label: 'Huile', amount: 3000 }],
      expenseCount: 1,
      expenseTotal: 3000,
    })
    expect(text.trim().endsWith('Ton solde de caisse est de zéro franc.')).toBe(true)
    expect(text).not.toContain('dépassent')
  })

  it('rétrocompatibilité : sans champs dépenses, dicté VOCAL-607 strict — AUCUN solde', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'tomates', quantity: 1, unitPrice: 2000, total: 2000 }],
      saleCount: 1,
      total: 2000,
      source: 'server',
    })
    expect(text).toBe(
      'Aujourd\'hui, tu as vendu tomates à 2 000 francs. ' +
      'En tout, ça fait 1 vente pour 2 000 francs.',
    )
    expect(text).not.toContain('solde de caisse')
  })

  it('repli agrégats : le solde part des TOTAUX réels (ventes serveur KO, agrégats caisse)', () => {
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 3,
      total: 12000,
      source: 'aggregates',
      expenses: [],
      expenseCount: 0,
      expenseTotal: 2750,
    })
    expect(text).toContain('tu as fait 3 ventes pour 12 000 francs')
    expect(text).toContain('Tes dépenses font 2 750 francs.')
    expect(text.trim().endsWith('Ton solde de caisse est de 9 250 francs.')).toBe(true)
  })
})

// ── buildDaySummarySpeech — formulation orale (VOCAL-610) ───────────────────

describe('buildDaySummarySpeech — formulation ajustée (registre parlé)', () => {
  it('fini le registre écrit : ni « pour un montant de », ni « s\'élèvent », ni « pour aujourd\'hui »', () => {
    const text = buildDaySummarySpeech({
      sales: [{ name: 'sacs de riz', quantity: 3, unitPrice: 8334, total: 25000 }],
      saleCount: 1,
      total: 25000,
      source: 'server',
      expenses: [{ label: 'Transport', amount: 1000 }],
      expenseCount: 1,
      expenseTotal: 1000,
    })
    expect(text).not.toContain('pour un montant de')
    expect(text).not.toContain('s\'élèvent')
    expect(text).not.toContain('pour aujourd\'hui')
    expect(text).toContain('En tout, ça fait 1 vente pour 25 000 francs.')
    expect(text).toContain('Tes dépenses font 1 000 francs.')
    expect(text.trim().endsWith('Ton solde de caisse est de 24 000 francs.')).toBe(true)
  })

  it('journée sans ventes : la transition « Tu as aussi dépensé » devient « Tu as dépensé »', () => {
    const text = buildDaySummarySpeech({
      sales: [],
      saleCount: 0,
      total: 0,
      source: 'server',
      expenses: [{ label: 'Glace', amount: 500 }],
      expenseCount: 1,
      expenseTotal: 500,
    })
    expect(text).toContain('Tu as dépensé 500 francs pour Glace.')
    expect(text).not.toContain('Tu as aussi dépensé')
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
    expect(buildDaySummarySpeech(data)).toContain('tu as fait 3 ventes pour 12 000 francs')
  })

  it('aucune donnée nulle part : bilan vide — jamais une vente inventée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const data = await collectTodaySales('merchant-1')

    expect(data.saleCount).toBe(0)
    expect(data.expenseTotal).toBe(0)
    expect(buildDaySummarySpeech(data)).toBe('Tu n\'as encore enregistré aucune vente ni dépense aujourd\'hui.')
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

  it('les dépenses de la file ne sont JAMAIS dictées comme des ventes (mais bien comme dépenses)', async () => {
    stubFetchServer([])
    getQueueMock.mockResolvedValue([
      {
        id: 9,
        entity: 'expense',
        createdAt: Date.now(),
        payload: { amount: 4000, category: 'transport', description: 'Taxi marché' },
      },
    ])

    const data = await collectTodaySales('merchant-1')

    expect(data.saleCount).toBe(0)
    expect(data.sales).toHaveLength(0)
    // VOCAL-608 : la dépense reste réelle et est dictée côté dépenses.
    expect(data.expenseTotal).toBe(4000)
    expect(data.expenses).toHaveLength(1)
    expect(data.expenses![0]).toMatchObject({ label: 'Taxi marché', amount: 4000 })
    const text = buildDaySummarySpeech(data)
    expect(text).toContain('Tu n\'as encore enregistré aucune vente aujourd\'hui.')
    expect(text).toContain('4 000 francs pour Taxi marché')
  })

  it('dépenses du serveur : lignes, total réel et filtre du jour transmis à l\'API', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/marchand/expenses')) {
        return new Response(JSON.stringify({
          expenses: [
            { amount: 1000, category: 'transport', description: '' },
            { amount: 500, category: 'aliment', description: 'Sachets' },
            { amount: 250, category: 'glace' },
          ],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ sales: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const data = await collectTodaySales('merchant-1')

    expect(data.expenseCount).toBe(3)
    expect(data.expenseTotal).toBe(1750)
    // Description réelle fait loi ; sinon libellé FR de la catégorie ;
    // sinon la catégorie brute — jamais de libellé fabriqué.
    expect(data.expenses![0]).toMatchObject({ label: 'Transport', amount: 1000 })
    expect(data.expenses![1]).toMatchObject({ label: 'Sachets', amount: 500 })
    expect(data.expenses![2]).toMatchObject({ label: 'glace', amount: 250 })
    // La plage « aujourd'hui » est bien transmise aux DEUX APIs.
    const expensesUrl = fetchMock.mock.calls.map((c) => c[0] as string).find((u) => u.includes('/api/marchand/expenses'))!
    expect(expensesUrl).toContain('startDate=')
    expect(expensesUrl).toContain('endDate=')
  })

  it('dépenses offline en attente : fusionnées avec le serveur (elles SONT réelles)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/marchand/expenses')) {
        return new Response(JSON.stringify({ expenses: [{ amount: 1000, category: 'loyer' }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ sales: [] }), { status: 200 })
    }))
    getQueueMock.mockResolvedValue([
      {
        id: 10,
        entity: 'expense',
        createdAt: Date.now(),
        payload: { amount: 300, category: 'autre', description: 'Sachets' },
      },
    ])

    const data = await collectTodaySales('merchant-1')

    expect(data.expenseCount).toBe(2)
    expect(data.expenseTotal).toBe(1300)
    expect(data.expenses![1]).toMatchObject({ label: 'Sachets', amount: 300 })
  })

  it('serveur dépenses injoignable + file vide : repli agrégat todayExpenses (réel, sans détail)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/marchand/expenses')) {
        throw new TypeError('Failed to fetch')
      }
      return new Response(JSON.stringify({ sales: [{ items: [{ productName: 'riz', quantity: 1, unitPrice: 2000 }], totalAmount: 2000 }] }), { status: 200 })
    }))
    mockAggregates(2000, 1, 750)

    const data = await collectTodaySales('merchant-1')

    // Les ventes passent par le serveur ; les dépenses tombent sur
    // l'agrégat réel du store caisse.
    expect(data.source).toBe('server')
    expect(data.expenses).toHaveLength(0)
    expect(data.expenseTotal).toBe(750)
    const text = buildDaySummarySpeech(data)
    expect(text).toContain('Tes dépenses font 750 francs.')
  })
})

// Garde-fou : DaySummaryData reste exporté pour les modales (vérif type).
const _typeGuard: DaySummaryData | null = null
void _typeGuard
