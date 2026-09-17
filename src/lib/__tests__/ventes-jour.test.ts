import { describe, it, expect } from 'vitest'
import {
  dayRangeUtc,
  todayDateStr,
  shiftDateStr,
  buildVentesSummary,
  percentChange,
  groupSalesByMerchant,
  revenueByHour,
} from '../ventes-jour'

describe('dayRangeUtc', () => {
  it('borne la journée [00:00, 00:00+1j) en UTC', () => {
    expect(dayRangeUtc('2026-09-17')).toEqual({
      start: '2026-09-17T00:00:00.000Z',
      end: '2026-09-18T00:00:00.000Z',
    })
  })

  it('gère le passage de mois et d’année', () => {
    expect(dayRangeUtc('2026-08-31').end).toBe('2026-09-01T00:00:00.000Z')
    expect(dayRangeUtc('2026-12-31').end).toBe('2027-01-01T00:00:00.000Z')
  })

  it('rejette les formats invalides', () => {
    expect(() => dayRangeUtc('17/09/2026')).toThrow()
    expect(() => dayRangeUtc('2026-13-40')).toThrow()
    expect(() => dayRangeUtc('')).toThrow()
  })
})

describe('todayDateStr / shiftDateStr', () => {
  it('extrait la date UTC du jour', () => {
    expect(todayDateStr(new Date('2026-09-17T14:30:00.000Z'))).toBe('2026-09-17')
    expect(todayDateStr(new Date('2026-09-17T23:59:59.000Z'))).toBe('2026-09-17')
  })

  it('décale dans le passé et le futur', () => {
    expect(shiftDateStr('2026-09-17', -1)).toBe('2026-09-16')
    expect(shiftDateStr('2026-09-17', 1)).toBe('2026-09-18')
    expect(shiftDateStr('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('buildVentesSummary', () => {
  const ventes = [
    {
      totalAmount: 5000,
      amountReceived: 10000,
      isVoiceSale: false,
      createdAt: '2026-09-17T09:00:00.000Z',
      items: [{ quantity: 2, subtotal: 3000 }, { quantity: 1, subtotal: 2000 }],
    },
    {
      totalAmount: 15000,
      amountReceived: 15000,
      isVoiceSale: true,
      createdAt: '2026-09-17T11:30:00.000Z',
      items: [{ quantity: 10, subtotal: 15000 }],
    },
  ]

  it('agrège CA, panier moyen, articles et ventes vocales', () => {
    const s = buildVentesSummary(ventes)
    expect(s.count).toBe(2)
    expect(s.revenue).toBe(20000)
    expect(s.avgBasket).toBe(10000)
    expect(s.itemsSold).toBe(13)
    expect(s.voiceCount).toBe(1)
    expect(s.amountReceived).toBe(25000)
  })

  it('borne la monnaie rendue à ce qui a été reçu', () => {
    const s = buildVentesSummary(ventes)
    // Vente 1 : reçu 10000 pour 5000 => 5000 rendus ; vente 2 : 0
    expect(s.changeGiven).toBe(5000)
  })

  it('reste sain sur une liste vide', () => {
    const s = buildVentesSummary([])
    expect(s).toEqual({
      count: 0,
      revenue: 0,
      amountReceived: 0,
      changeGiven: 0,
      voiceCount: 0,
      itemsSold: 0,
      avgBasket: 0,
    })
  })
})

describe('percentChange', () => {
  it('calcule une hausse et une baisse', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(75, 100)).toBe(-25)
  })

  it('retourne null quand hier vaut 0 (non calculable)', () => {
    expect(percentChange(500, 0)).toBeNull()
  })
})

describe('groupSalesByMerchant', () => {
  const ventes = [
    {
      merchantId: 'm1',
      merchantName: 'Awa KONE',
      zone: 'Adjame',
      totalAmount: 3000,
      amountReceived: 5000,
      isVoiceSale: false,
      createdAt: '2026-09-17T09:00:00.000Z',
      items: [{ quantity: 4, subtotal: 3000 }],
    },
    {
      merchantId: 'm2',
      merchantName: 'Fatoumata KEITA',
      zone: 'Cocody',
      totalAmount: 12000,
      amountReceived: 12000,
      isVoiceSale: false,
      createdAt: '2026-09-17T10:00:00.000Z',
      items: [{ quantity: 3, subtotal: 12000 }],
    },
    {
      merchantId: 'm1',
      merchantName: 'Awa KONE',
      zone: 'Adjame',
      totalAmount: 2000,
      amountReceived: 2000,
      isVoiceSale: true,
      createdAt: '2026-09-17T11:00:00.000Z',
      items: [{ quantity: 1, subtotal: 2000 }],
    },
  ]

  it('agrège par marchand, trié par CA décroissant', () => {
    const aggs = groupSalesByMerchant(ventes)
    expect(aggs).toHaveLength(2)
    expect(aggs[0]).toMatchObject({ merchantId: 'm2', revenue: 12000, salesCount: 1, itemsSold: 3 })
    expect(aggs[1]).toMatchObject({ merchantId: 'm1', revenue: 5000, salesCount: 2, itemsSold: 5, zone: 'Adjame' })
  })

  it('liste vide => tableau vide', () => {
    expect(groupSalesByMerchant([])).toEqual([])
  })
})

describe('revenueByHour', () => {
  it('classe les ventes dans les bonnes tranches horaires UTC', () => {
    const ventes = [
      {
        totalAmount: 1000,
        amountReceived: 1000,
        isVoiceSale: false,
        createdAt: '2026-09-17T09:15:00.000Z',
        items: [],
      },
      {
        totalAmount: 2500,
        amountReceived: 2500,
        isVoiceSale: false,
        createdAt: '2026-09-17T09:45:00.000Z',
        items: [],
      },
      {
        totalAmount: 400,
        amountReceived: 400,
        isVoiceSale: false,
        createdAt: '2026-09-17T14:00:00.000Z',
        items: [],
      },
    ]
    const buckets = revenueByHour(ventes)
    expect(buckets).toHaveLength(24)
    expect(buckets[9]).toEqual({ hour: 9, revenue: 3500, count: 2 })
    expect(buckets[14]).toEqual({ hour: 14, revenue: 400, count: 1 })
    expect(buckets[8].revenue).toBe(0)
  })
})
