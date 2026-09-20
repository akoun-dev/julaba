import { describe, it, expect } from 'vitest'
import { deriveCycleCulture } from '../stores/producteur-store'

// Task 98-B (audit 97-B1 #2) — la dérivation du suivi de cycle est PURE et
// recalculée au jour J (joursEcoules/joursTotal/phase ne sont jamais stockés
// en base) ; ces invariants la protègent.

describe('deriveCycleCulture — suivi de cycle recalculé au jour J', () => {
  const semis = '2026-01-01'
  const prevue = '2026-03-02' // 60 jours plus tard (année 2026 non bissextile)

  it('calcule la durée totale en jours et la phase initiale', () => {
    const d = deriveCycleCulture(semis, prevue, new Date('2026-01-05'))
    expect(d.joursTotal).toBe(60)
    expect(d.joursEcoules).toBe(4)
    expect(d.phase).toBe('Germination')
  })

  it('coupe les phases : <25 % germination, croissance, floraison, maturation', () => {
    expect(deriveCycleCulture(semis, prevue, new Date('2026-01-10')).phase).toBe('Germination') // 9/60 = 15 %
    expect(deriveCycleCulture(semis, prevue, new Date('2026-01-25')).phase).toBe('Croissance') // 24/60 = 40 %
    expect(deriveCycleCulture(semis, prevue, new Date('2026-02-10')).phase).toBe('Floraison') // 40/60 ≈ 67 %
    expect(deriveCycleCulture(semis, prevue, new Date('2026-02-25')).phase).toBe('Maturation') // 55/60 ≈ 92 %
  })

  it('ne dépasse jamais la récolte prévue (joursEcoules plafonné à joursTotal)', () => {
    const d = deriveCycleCulture(semis, prevue, new Date('2026-05-01'))
    expect(d.joursEcoules).toBe(60)
    expect(d.joursEcoules).toBeLessThanOrEqual(d.joursTotal)
  })

  it('un jour AVANT le semis ne donne jamais de jours négatifs', () => {
    const d = deriveCycleCulture(semis, prevue, new Date('2025-12-28'))
    expect(d.joursEcoules).toBe(0)
  })

  it('dates incohérentes (récolte ≤ semis) → dérivation neutre sans crash', () => {
    const d = deriveCycleCulture('2026-03-01', '2026-03-01', new Date('2026-03-05'))
    expect(d.joursTotal).toBe(0)
    expect(d.joursEcoules).toBe(0)
    expect(d.phase).toBe('Semis')
  })
})
