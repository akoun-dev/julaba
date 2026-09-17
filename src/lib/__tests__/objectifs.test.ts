import { describe, it, expect } from 'vitest'
import {
  normalizeZoneKey,
  daysInMonth,
  monthElapsedFraction,
  expectedToDate,
  objectifStatus,
  objectifProgressPct,
  monthDeadlineLabel,
  monthLabel,
  shiftObjectifKey,
} from '../objectifs'

describe('normalizeZoneKey', () => {
  it('normalise casse, espaces et accents', () => {
    expect(normalizeZoneKey(' Adjamé ')).toBe('adjame')
    expect(normalizeZoneKey('COCODY')).toBe('cocody')
    expect(normalizeZoneKey('Adjame')).toBe(normalizeZoneKey('Adjamé'))
  })
})

describe('daysInMonth', () => {
  it('compte les mois courants et les années bissextiles', () => {
    expect(daysInMonth(2026, 8)).toBe(30) // septembre
    expect(daysInMonth(2026, 1)).toBe(28) // février 2026
    expect(daysInMonth(2024, 1)).toBe(29) // février 2024
  })
})

describe('monthElapsedFraction', () => {
  it('vaut 0 avant le début du mois et 1 après la fin', () => {
    const objectif = { month: 8, year: 2026 }
    expect(monthElapsedFraction(objectif, new Date(2026, 7, 31, 23, 59))).toBe(0)
    expect(monthElapsedFraction(objectif, new Date(2026, 9, 1))).toBe(1)
  })

  it('progresse linéairement dans le mois', () => {
    const objectif = { month: 8, year: 2026 } // 30 jours
    expect(monthElapsedFraction(objectif, new Date(2026, 8, 15, 12))).toBeCloseTo(15 / 30, 5)
    expect(monthElapsedFraction(objectif, new Date(2026, 8, 30, 23))).toBeCloseTo(30 / 30, 5)
  })
})

describe('expectedToDate', () => {
  it('applique le rythme linéaire plafonné à la cible', () => {
    const now = new Date(2026, 8, 15, 12) // ~ mi-septembre
    expect(expectedToDate(40, { month: 8, year: 2026 }, now)).toBe(20)
    expect(expectedToDate(40, { month: 8, year: 2026 }, new Date(2026, 9, 5))).toBe(40)
  })

  it('rejette une cible nulle ou négative', () => {
    expect(expectedToDate(0, { month: 8, year: 2026 }, new Date(2026, 8, 15))).toBe(0)
  })
})

describe('objectifStatus', () => {
  const objectif = { month: 8, year: 2026 }

  it('marque a_venir avant le mois visé', () => {
    expect(objectifStatus(objectif, 40, 0, new Date(2026, 7, 20))).toBe('a_venir')
  })

  it('marque atteint dès que current >= target', () => {
    expect(objectifStatus(objectif, 40, 40, new Date(2026, 8, 10))).toBe('atteint')
    expect(objectifStatus(objectif, 40, 55, new Date(2026, 8, 10))).toBe('atteint')
  })

  it('marque en_avance / conforme / en_retard selon le rythme', () => {
    // Le 20 sept (2/3 du mois), attendu = ceil(40 × 20/30) = 27
    const now = new Date(2026, 8, 20, 12)
    expect(objectifStatus(objectif, 40, 28, now)).toBe('en_avance')
    expect(objectifStatus(objectif, 40, 24, now)).toBe('conforme') // 24 >= 27×0.85 ≈ 23
    expect(objectifStatus(objectif, 40, 10, now)).toBe('en_retard')
  })
})

describe('objectifProgressPct', () => {
  it('plafonne à 100 et gère la cible nulle', () => {
    expect(objectifProgressPct(40, 10)).toBe(25)
    expect(objectifProgressPct(40, 50)).toBe(100)
    expect(objectifProgressPct(0, 10)).toBe(0)
  })
})

describe('libellés', () => {
  it('formate échéance et mois', () => {
    expect(monthDeadlineLabel({ month: 8, year: 2026 })).toBe('30 septembre')
    expect(monthDeadlineLabel({ month: 1, year: 2024 })).toBe('29 février')
    expect(monthLabel({ month: 8, year: 2026 })).toBe('septembre 2026')
  })
})

describe('shiftObjectifKey', () => {
  it('décale dans le mois, l’année et sur janvier/décembre', () => {
    expect(shiftObjectifKey({ month: 8, year: 2026 }, -1)).toEqual({ month: 7, year: 2026 })
    expect(shiftObjectifKey({ month: 8, year: 2026 }, 4)).toEqual({ month: 0, year: 2027 })
    expect(shiftObjectifKey({ month: 0, year: 2026 }, -1)).toEqual({ month: 11, year: 2025 })
  })
})
