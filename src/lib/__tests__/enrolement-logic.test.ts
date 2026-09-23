import { describe, it, expect } from 'vitest'
import {
  ITEMS_PER_PAGE,
  PREDEFINED_REASONS,
  FILTER_TABS,
  DATE_RANGE_OPTIONS,
  isToday,
  isThisWeek,
  isThisMonth,
  matchesDateRange,
  formatDate,
  extractZones,
  computeStatusCounts,
  computeTodayStats,
  filterEnrolments,
  computeTotalPages,
  paginateEnrolments,
  buildPaginationPages,
  enrolmentTabCount,
} from '@/lib/backoffice/enrolement-logic'
import type { BoEnrolment } from '@/lib/backoffice/bo-models'

function enrol(p: Partial<BoEnrolment> & { id: string }): BoEnrolment {
  return {
    dossierId: 'DOS-' + p.id,
    actorName: 'Acteur ' + p.id,
    actorType: 'marchand',
    zone: 'Cocody',
    identificateurName: 'Agent X',
    status: 'en_attente',
    submittedAt: new Date().toISOString(),
    hasPhoto: true,
    hasGps: true,
    phone: '0708091011',
    ...p,
  } as BoEnrolment
}

/** Date locale de référence : évite les pièges TZ des ISO date-only. */
function localIso(daysAgo = 0, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 30, 0, 0)
  return d.toISOString()
}

describe('enrolement-logic — constantes', () => {
  it('fige ITEMS_PER_PAGE à 10', () => {
    expect(ITEMS_PER_PAGE).toBe(10)
  })
  it('fige les 5 raisons prédéfinies (dont « Autre » filtrée côté info)', () => {
    expect(PREDEFINED_REASONS).toEqual([
      'Photo illisible',
      'Données incomplètes',
      'GPS absent',
      'Téléphone invalide',
      'Autre',
    ])
  })
  it('fige les 5 onglets de filtrage (ordre historique, « all » en dernier)', () => {
    expect(FILTER_TABS.map((t) => t.key)).toEqual([
      'en_attente',
      'valide',
      'rejete',
      'info_demandee',
      'all',
    ])
    expect(FILTER_TABS.map((t) => t.label)).toEqual([
      'En attente',
      'Validés',
      'Rejetés',
      'Info demandée',
      'Tous',
    ])
  })
  it('fige les 4 options de période (ordre historique, « tous » en premier)', () => {
    expect(DATE_RANGE_OPTIONS.map((o) => o.value)).toEqual([
      'tous',
      'aujourdhui',
      'semaine',
      'mois',
    ])
    expect(DATE_RANGE_OPTIONS.map((o) => o.label)).toEqual([
      'Tous',
      "Aujourd'hui",
      'Cette semaine',
      'Ce mois',
    ])
  })
})

describe('enrolement-logic — bornes de dates', () => {
  it('isToday : aujourd\'hui vrai, hier et le mois dernier faux', () => {
    expect(isToday(localIso(0))).toBe(true)
    expect(isToday(localIso(1))).toBe(false)
    expect(isToday(localIso(40))).toBe(false)
  })
  it('isThisMonth : ce mois vrai, le mois dernier faux', () => {
    expect(isThisMonth(localIso(0))).toBe(true)
    expect(isThisMonth(localIso(40))).toBe(false)
  })
  it('quirk dimanche : startOfWeek = lundi SUIVANT — un dossier soumis le dimanche n\'est jamais « cette semaine »', () => {
    const now = new Date()
    const today = localIso(0)
    if (now.getDay() === 0) {
      expect(isThisWeek(today)).toBe(false)
    } else {
      expect(isThisWeek(today)).toBe(true)
    }
    expect(isThisWeek(localIso(8))).toBe(false)
  })
  it('matchesDateRange : « tous » accepte tout, sinon délègue à la bonne borne', () => {
    expect(matchesDateRange(localIso(40), 'tous')).toBe(true)
    expect(matchesDateRange('nimporte-quoi', 'tous')).toBe(true)
    expect(matchesDateRange(localIso(0), 'aujourdhui')).toBe(true)
    expect(matchesDateRange(localIso(1), 'aujourdhui')).toBe(false)
    expect(matchesDateRange(localIso(1), 'semaine')).toBe(true)
    expect(matchesDateRange(localIso(0), 'mois')).toBe(true)
  })
})

describe('enrolement-logic — formatDate', () => {
  it('formate en fr-FR jj/mm/aaaa hh:mm', () => {
    expect(formatDate('2026-09-23T10:30:00')).toBe('23/09/2026 10:30')
    expect(formatDate('2025-12-31T23:59:00')).toBe('31/12/2025 23:59')
  })
})

describe('enrolement-logic — extractZones', () => {
  it('dédoublonne et trie par code units (« Ébindi » après « Yopougon »)', () => {
    expect(extractZones([
      enrol({ id: 'a', zone: 'Yopougon' }),
      enrol({ id: 'b', zone: 'Cocody' }),
      enrol({ id: 'c', zone: 'Ébindi' }),
      enrol({ id: 'd', zone: 'Cocody' }),
    ])).toEqual(['Cocody', 'Yopougon', 'Ébindi'])
  })
})

describe('enrolement-logic — computeStatusCounts', () => {
  it('compte par statut ; les statuts inconnus ajoutent leur clé', () => {
    const counts = computeStatusCounts([
      enrol({ id: 'a', status: 'en_attente' }),
      enrol({ id: 'b', status: 'en_attente' }),
      enrol({ id: 'c', status: 'valide' }),
      enrol({ id: 'd', status: 'info_demandee' }),
    ])
    expect(counts).toEqual({ en_attente: 2, valide: 1, rejete: 0, info_demandee: 1 })
  })
})

describe('enrolement-logic — computeTodayStats', () => {
  it('compte validés/rejetés du jour et le taux arrondi', () => {
    const s = computeTodayStats([
      enrol({ id: 'a', status: 'valide', validatedAt: localIso(0) }),
      enrol({ id: 'b', status: 'valide', validatedAt: localIso(0) }),
      enrol({ id: 'c', status: 'rejete', validatedAt: localIso(0) }),
      enrol({ id: 'd', status: 'valide', validatedAt: localIso(2) }),
    ])
    expect(s).toEqual({ validated: 2, rejected: 1, rate: 67 })
  })
  it('quirk : un dossier rejeté SANS validatedAt n\'est jamais compté', () => {
    const s = computeTodayStats([
      enrol({ id: 'a', status: 'rejete' }),
      enrol({ id: 'b', status: 'rejete', validatedAt: localIso(0) }),
    ])
    expect(s).toEqual({ validated: 0, rejected: 1, rate: 0 })
  })
  it('aucun traitement du jour -> zéros (jamais de division par zéro)', () => {
    expect(computeTodayStats([])).toEqual({ validated: 0, rejected: 0, rate: 0 })
    expect(computeTodayStats([enrol({ id: 'a', status: 'en_attente' })]).rate).toBe(0)
  })
})

describe('enrolement-logic — filterEnrolments', () => {
  const list = [
    enrol({ id: 'a', status: 'en_attente', zone: 'Cocody' }),
    enrol({ id: 'b', status: 'valide', zone: 'Cocody', submittedAt: localIso(0) }),
    enrol({ id: 'c', status: 'valide', zone: 'Yopougon', submittedAt: localIso(0) }),
    enrol({ id: 'd', status: 'rejete', zone: 'Yopougon', submittedAt: localIso(40) }),
  ]
  it('« all » + « toutes zones » + « tous » -> tout passe', () => {
    expect(filterEnrolments(list, { activeFilter: 'all', zoneFilter: 'all', dateRange: 'tous' })).toHaveLength(4)
  })
  it('les 3 filtres se combinent en ET', () => {
    expect(
      filterEnrolments(list, { activeFilter: 'valide', zoneFilter: 'Yopougon', dateRange: 'aujourdhui' }).map((e) => e.id)
    ).toEqual(['c'])
    expect(
      filterEnrolments(list, { activeFilter: 'rejete', zoneFilter: 'Yopougon', dateRange: 'semaine' })
    ).toEqual([])
  })
  it('statut seul (zone/date par défaut)', () => {
    expect(
      filterEnrolments(list, { activeFilter: 'valide', zoneFilter: 'all', dateRange: 'tous' }).map((e) => e.id)
    ).toEqual(['b', 'c'])
  })
})

describe('enrolement-logic — pagination', () => {
  it('computeTotalPages : Math.max(1, ceil) — jamais 0 page', () => {
    expect(computeTotalPages(0)).toBe(1)
    expect(computeTotalPages(1)).toBe(1)
    expect(computeTotalPages(10)).toBe(1)
    expect(computeTotalPages(11)).toBe(2)
    expect(computeTotalPages(21)).toBe(3)
  })
  it('paginateEnrolments : tranche de la page, page au-delà de la fin -> vide', () => {
    const list = Array.from({ length: 25 }, (_, i) => enrol({ id: String(i) }))
    expect(paginateEnrolments(list, 1)).toHaveLength(10)
    expect(paginateEnrolments(list, 3)).toHaveLength(5)
    expect(paginateEnrolments(list, 99)).toEqual([])
  })
  it('buildPaginationPages : 1 page -> [1]', () => {
    expect(buildPaginationPages(1, 1)).toEqual([1])
  })
  it('buildPaginationPages : fenêtre autour de la page courante + ellipses', () => {
    expect(buildPaginationPages(9, 1)).toEqual([1, 2, 'ellipsis', 9])
    expect(buildPaginationPages(9, 5)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 9])
    expect(buildPaginationPages(9, 9)).toEqual([1, 'ellipsis', 8, 9])
    expect(buildPaginationPages(4, 2)).toEqual([1, 2, 3, 4])
  })
})

describe('enrolement-logic — enrolmentTabCount', () => {
  const counts = { en_attente: 3, valide: 0, rejete: 2, info_demandee: 1 }
  it('« all » renvoie le total passé', () => {
    expect(enrolmentTabCount(42, counts, 'all')).toBe(42)
  })
  it('statut sans dossier -> 0 (quirk || 0)', () => {
    expect(enrolmentTabCount(42, counts, 'valide')).toBe(0)
    expect(enrolmentTabCount(42, counts, 'en_attente')).toBe(3)
  })
  it('clé inconnue -> 0', () => {
    expect(enrolmentTabCount(42, counts, 'inconnu' as never)).toBe(0)
  })
})
