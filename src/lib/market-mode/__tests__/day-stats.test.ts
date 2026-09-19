import { describe, it, expect } from 'vitest'
import {
  buildDayStats,
  yesterdayRevenueFromServerSales,
  yesterdayRevenueFromSession,
  yesterdayUtcRange,
} from '../day-stats'

// MODE-910 (§25) — « Ma journée en chiffres » : agrégats PURS du jour.
// Les chiffres viennent des sources réelles (collectTodaySales, route
// /api/marchand/sales, session marché clôturée) — l'agrégateur PARTAGÉ du
// backoffice (buildVentesSummary) et percentChange (src/lib/ventes-jour.ts)
// sont réutilisés pour que la définition du chiffre d'affaires et de la
// variation ne puisse jamais diverger. Montants ENTIERS (règle du dépôt) ;
// l'absence de données = null/zéro honnête, jamais une erreur.

// Horloge figée : aujourd'hui = 2026-02-10 (UTC), hier = 2026-02-09.
const NOW = new Date('2026-02-10T09:30:00.000Z')

describe('buildDayStats — agrégats du jour', () => {
  it('ventes (nb) et CA du jour issus de collectTodaySales, variation en hausse', () => {
    const stats = buildDayStats({ saleCount: 3, revenue: 34500 }, 30000)
    expect(stats).toEqual({ saleCount: 3, revenue: 34500, changeVsYesterday: 15 })
  })

  it('baisse : variation négative', () => {
    const stats = buildDayStats({ saleCount: 2, revenue: 24000 }, 30000)
    expect(stats.changeVsYesterday).toBe(-20)
  })

  it('hier inconnu (undefined/null) : variation null — « si dispo » seulement', () => {
    expect(buildDayStats({ saleCount: 3, revenue: 34500 }).changeVsYesterday).toBeNull()
    expect(buildDayStats({ saleCount: 3, revenue: 34500 }, null).changeVsYesterday).toBeNull()
  })

  it('hier à zéro (vraie journée sans vente) : variation null (pas de % du néant)', () => {
    expect(buildDayStats({ saleCount: 3, revenue: 34500 }, 0).changeVsYesterday).toBeNull()
  })

  it('montants non entiers écrêtés : FCFA entiers partout', () => {
    const stats = buildDayStats({ saleCount: 1.7, revenue: 34500.9 }, 30000.4)
    expect(stats.saleCount).toBe(1)
    expect(stats.revenue).toBe(34500)
    expect(stats.changeVsYesterday).toBe(15)
  })

  it('valeurs absentes/négatives : zéro honnête, jamais une erreur', () => {
    const stats = buildDayStats({ saleCount: -3, revenue: -100 }, undefined)
    expect(stats.saleCount).toBe(0)
    expect(stats.revenue).toBe(0)
    expect(stats.changeVsYesterday).toBeNull()
  })
})

describe('yesterdayRevenueFromServerSales — CA d\'hier via l\'agrégateur partagé', () => {
  it('somme les ventes du jour précédent, annulées EXCLUES (MODE-909)', () => {
    const revenue = yesterdayRevenueFromServerSales([
      { totalAmount: 5000, createdAt: '2026-02-09T10:00:00.000Z' },
      { totalAmount: 2500, annulee: true, createdAt: '2026-02-09T11:00:00.000Z' },
      { totalAmount: 1200, createdAt: '2026-02-09T12:00:00.000Z' },
    ])
    expect(revenue).toBe(6200)
  })

  it('aucune donnée (réponse vide, offline) : zéro honnête, jamais une erreur', () => {
    expect(yesterdayRevenueFromServerSales(undefined)).toBe(0)
    expect(yesterdayRevenueFromServerSales(null)).toBe(0)
    expect(yesterdayRevenueFromServerSales([])).toBe(0)
  })

  it('montants non entiers écrêtés', () => {
    const revenue = yesterdayRevenueFromServerSales([{ totalAmount: 1000.7 }])
    expect(revenue).toBe(1000)
  })
})

describe('yesterdayRevenueFromSession — repli LOCAL (session marché clôturée)', () => {
  it('une session clôturée HIER donne son salesTotal (source locale, sans réseau)', () => {
    const revenue = yesterdayRevenueFromSession(
      { status: 'closed', closedAt: '2026-02-09T18:00:00.000Z', salesTotal: 34000 },
      NOW,
    )
    expect(revenue).toBe(34000)
  })

  it('session encore ouverte, clôturée avant-hier ou sans total : null', () => {
    expect(yesterdayRevenueFromSession(
      { status: 'open', closedAt: null, salesTotal: null },
      NOW,
    )).toBeNull()
    expect(yesterdayRevenueFromSession(
      { status: 'closed', closedAt: '2026-02-08T18:00:00.000Z', salesTotal: 34000 },
      NOW,
    )).toBeNull()
    expect(yesterdayRevenueFromSession(
      { status: 'closed', closedAt: '2026-02-09T18:00:00.000Z', salesTotal: null },
      NOW,
    )).toBeNull()
  })

  it('aucune session (null/undefined) : null — la variation est simplement absente', () => {
    expect(yesterdayRevenueFromSession(null, NOW)).toBeNull()
    expect(yesterdayRevenueFromSession(undefined, NOW)).toBeNull()
  })

  it('montant non entier écrêté', () => {
    expect(yesterdayRevenueFromSession(
      { status: 'closed', closedAt: '2026-02-09T18:00:00.000Z', salesTotal: 34000.5 },
      NOW,
    )).toBe(34000)
  })
})

describe('yesterdayUtcRange — bornes UTC d\'hier (même définition du jour que le BO)', () => {
  it('hier 00:00 UTC → aujourd\'hui 00:00 UTC', () => {
    const range = yesterdayUtcRange(NOW)
    expect(range.start).toBe('2026-02-09T00:00:00.000Z')
    expect(range.end).toBe('2026-02-10T00:00:00.000Z')
  })
})
