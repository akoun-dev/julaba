import { describe, it, expect } from 'vitest'
import {
  dedupKey,
  computeDossiersEnAttente,
  computeIdentificateursInactifs,
  computeChuteVentes,
  computeObjectifsEnRetard,
  DEFAULT_ALERT_RULES,
} from '../alertes-moteur'

describe('DEFAULT_ALERT_RULES', () => {
  it('fournit les quatre règles avec unités cohérentes', () => {
    expect(Object.keys(DEFAULT_ALERT_RULES)).toEqual([
      'dossiers_en_attente',
      'identificateur_inactif',
      'chute_ventes',
      'objectif_en_retard',
    ])
    expect(DEFAULT_ALERT_RULES.dossiers_en_attente.unit).toBe('heures')
    expect(DEFAULT_ALERT_RULES.identificateur_inactif.unit).toBe('jours')
    expect(DEFAULT_ALERT_RULES.chute_ventes.unit).toBe('%')
    expect(DEFAULT_ALERT_RULES.objectif_en_retard.unit).toBe('%')
  })
})

describe('dedupKey', () => {
  it('combine type, référence et jour', () => {
    expect(dedupKey('chute_ventes', 'jour-2026-09-17', new Date(2026, 8, 17, 15, 30)))
      .toBe('chute_ventes:jour-2026-09-17:2026-09-17')
  })
})

describe('computeDossiersEnAttente', () => {
  const now = new Date(2026, 8, 17, 12)

  it('ignore les dossiers récents et validés', () => {
    const enrolments = [
      { id: 'e1', dossierId: 'DOS-1', actorName: 'Awa', status: 'en_attente', submittedAt: new Date(now.getTime() - 10 * 3_600_000).toISOString() },
      { id: 'e2', dossierId: 'DOS-2', actorName: 'Koffi', status: 'valide', submittedAt: new Date(now.getTime() - 100 * 3_600_000).toISOString() },
    ]
    expect(computeDossiersEnAttente(enrolments, 48, now)).toEqual([])
  })

  it('alerte au-delà du seuil, critique au-delà du double', () => {
    const enrolments = [
      { id: 'e1', dossierId: 'DOS-1', actorName: 'Awa', status: 'en_attente', submittedAt: new Date(now.getTime() - 60 * 3_600_000).toISOString() },
      { id: 'e2', dossierId: 'DOS-2', actorName: 'Koffi', status: 'en_attente', submittedAt: new Date(now.getTime() - 100 * 3_600_000).toISOString() },
    ]
    const alerts = computeDossiersEnAttente(enrolments, 48, now)
    expect(alerts).toHaveLength(2)
    const critiques = alerts.filter((a) => a.severity === 'haute')
    expect(critiques).toHaveLength(1)
    expect(critiques[0].reference).toBe('e2')
    expect(alerts[0].dedupKey).toBe(`dossiers_en_attente:e2:2026-09-17`)
    expect(alerts[0].module).toBe('enrolement')
  })

  it('retourne vide si la règle est désactivée (seuil 0)', () => {
    expect(computeDossiersEnAttente([], 0, now)).toEqual([])
  })
})

describe('computeIdentificateursInactifs', () => {
  const now = new Date(2026, 8, 17, 12)

  it('ignore les inactifs désactivés et les agents actifs récents', () => {
    const idents = [
      { id: 'i1', name: 'Inactif', isActive: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'i2', name: 'Actif récent', isActive: true, createdAt: '2026-01-01T00:00:00Z', lastEnrolmentAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() },
    ]
    expect(computeIdentificateursInactifs(idents, 7, now)).toEqual([])
  })

  it('alerte un agent actif sans enrôlement récent ; repli sur createdAt', () => {
    const idents = [
      { id: 'i2', name: 'Fatou Soro', isActive: true, createdAt: '2026-09-01T00:00:00Z', lastEnrolmentAt: new Date(now.getTime() - 10 * 86_400_000).toISOString() },
      { id: 'i3', name: 'Nouveau sans dossier', isActive: true, createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString() },
    ]
    const alerts = computeIdentificateursInactifs(idents, 7, now)
    expect(alerts).toHaveLength(2)
    expect(alerts.every((a) => a.severity === 'basse')).toBe(true)
    expect(alerts[0].reference).toBe('i2')
  })
})

describe('computeChuteVentes', () => {
  const now = new Date(2026, 8, 17, 15)

  const week = [
    { date: '2026-09-10', total: 20_000 },
    { date: '2026-09-11', total: 22_000 },
    { date: '2026-09-12', total: 18_000 },
    { date: '2026-09-13', total: 25_000 },
    { date: '2026-09-14', total: 21_000 },
    { date: '2026-09-15', total: 19_000 },
    { date: '2026-09-16', total: 20_000 },
  ]

  it('ne déclenche pas avant 10 h (bruit du début de journée)', () => {
    const tôt = new Date(2026, 8, 17, 8)
    expect(computeChuteVentes([{ date: '2026-09-17', total: 0 }, ...week], 30, tôt)).toEqual([])
  })

  it('silencieux quand le CA tient la moyenne', () => {
    expect(computeChuteVentes([{ date: '2026-09-17', total: 21_000 }, ...week], 30, now)).toEqual([])
  })

  it('alerte quand le CA décroche au-delà du seuil', () => {
    const alerts = computeChuteVentes([{ date: '2026-09-17', total: 10_000 }, ...week], 30, now)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('moyenne')
    expect(alerts[0].module).toBe('ventes')
    expect(alerts[0].message).toContain('FCFA')
  })

  it('critique si CA nul ou décroche du double du seuil', () => {
    const [zero] = computeChuteVentes([{ date: '2026-09-17', total: 0 }, ...week], 30, now)
    expect(zero.severity).toBe('haute')
    const [double] = computeChuteVentes([{ date: '2026-09-17', total: 5_000 }, ...week], 30, now)
    expect(double.severity).toBe('haute')
  })

  it('silencieux sous le plancher de significativité', () => {
    const faible = week.map((d) => ({ ...d, total: 50 }))
    expect(computeChuteVentes([{ date: '2026-09-17', total: 0 }, ...faible], 30, now)).toEqual([])
  })
})

describe('computeObjectifsEnRetard', () => {
  const now = new Date(2026, 8, 20, 12) // 20 sept → 2/3 du mois

  it('ignore les autres mois et les premiers jours du mois', () => {
    const autres = [
      { id: 'o1', scope: 'identificateur' as const, cibleLabel: 'X', month: 7, year: 2026, target: 40, current: 0 },
    ]
    expect(computeObjectifsEnRetard(autres, 20, now)).toEqual([])
    expect(computeObjectifsEnRetard(autres, 20, new Date(2026, 8, 5, 12))).toEqual([])
  })

  it('alerte au-delà du seuil, critique au-delà de 50 % de retard', () => {
    const objectifs = [
      { id: 'o2', scope: 'identificateur' as const, cibleLabel: 'Kouamé Bamba', month: 8, year: 2026, target: 40, current: 20 },
      { id: 'o3', scope: 'zone' as const, cibleLabel: 'Adjamé', month: 8, year: 2026, target: 60, current: 2 },
    ]
    const alerts = computeObjectifsEnRetard(objectifs, 20, now)
    // Attendus à date : ceil(40×20/30)=27 et ceil(60×20/30)=40
    expect(alerts).toHaveLength(2)
    expect(alerts[0].severity).toBe('moyenne') // (27-20)/27 ≈ 26 %
    expect(alerts[1].severity).toBe('haute') // (40-2)/40 = 95 %
    expect(alerts[1].message).toContain('Adjamé')
  })

  it('silencieux quand le rythme est tenu', () => {
    const objectifs = [
      { id: 'o4', scope: 'identificateur' as const, cibleLabel: 'Fatou Soro', month: 8, year: 2026, target: 40, current: 30 },
    ]
    expect(computeObjectifsEnRetard(objectifs, 20, now)).toEqual([])
  })
})
