import { describe, it, expect } from 'vitest'
import {
  STATUS_FILTER_OPTIONS,
  STATUS_BADGE_STYLES,
  formatDate,
  computeMissionProgress,
  filterAssignableIdentificateurs,
  toggleSetMember,
  teamMemberIdsToPrecheck,
  canSubmitMission,
  buildMissionPayload,
  filterMissionsByStatus,
  computeMissionSummary,
  missionTabCount,
} from '@/lib/backoffice/missions-logic'
import type { BoMission, BoIdentificateur } from '@/lib/backoffice/bo-models'

function ident(p: Partial<BoIdentificateur> & { id: string }): BoIdentificateur {
  return {
    name: 'Agent ' + p.id,
    isActive: true,
    createdAt: '2026-01-15T12:00:00.000Z',
    ...p,
  } as BoIdentificateur
}

function mission(p: Partial<BoMission> & { id: string }): BoMission {
  return {
    title: 'Mission ' + p.id,
    description: 'Description',
    zone: 'Cocody',
    status: 'en_cours',
    targetCount: 100,
    currentCount: 50,
    startDate: '2026-01-01',
    assignees: [],
    ...p,
  } as BoMission
}

describe('missions-logic — STATUS_FILTER_OPTIONS', () => {
  it('fige les 4 onglets de filtrage historiques', () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      'toutes',
      'en_cours',
      'terminee',
      'suspendue',
    ])
    expect(STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      'Toutes',
      'En cours',
      'Terminées',
      'Suspendues',
    ])
  })
})

describe('missions-logic — STATUS_BADGE_STYLES', () => {
  it('fige les 3 styles de badge par statut', () => {
    expect(STATUS_BADGE_STYLES['en_cours']).toBe('bg-blue-100 text-blue-800 border-blue-200')
    expect(STATUS_BADGE_STYLES['terminee']).toBe('bg-emerald-100 text-emerald-800 border-emerald-200')
    expect(STATUS_BADGE_STYLES['suspendue']).toBe('bg-amber-100 text-amber-800 border-amber-200')
  })
  it('statut inconnu -> undefined (fallback clair/sombre géré par les composants)', () => {
    expect(STATUS_BADGE_STYLES['inconnu']).toBeUndefined()
  })
})

describe('missions-logic — formatDate', () => {
  it('formate en fr-FR : jour 2 chiffres / mois court / année', () => {
    expect(formatDate('2026-01-15T12:00:00.000Z')).toBe('15 janv. 2026')
    expect(formatDate('2025-12-31T12:00:00.000Z')).toBe('31 déc. 2025')
  })
  it('une date invalide ne lève pas : new Date().toLocaleDateString rend « Invalid Date » (le catch ne protège que les lancements)', () => {
    expect(formatDate('pas-une-date')).toBe('Invalid Date')
  })
})

describe('missions-logic — computeMissionProgress', () => {
  it('objectif 0 -> 0 (jamais de division par zéro)', () => {
    expect(computeMissionProgress(0, 0)).toBe(0)
    expect(computeMissionProgress(50, 0)).toBe(0)
  })
  it('progression partielle en %', () => {
    expect(computeMissionProgress(250, 500)).toBe(50)
    expect(computeMissionProgress(1, 3)).toBeCloseTo(33.333, 2)
  })
  it('plafond 100 % — objectif dépassé jamais affiché au-delà', () => {
    expect(computeMissionProgress(600, 500)).toBe(100)
    expect(computeMissionProgress(500, 500)).toBe(100)
  })
})

describe('missions-logic — filterAssignableIdentificateurs', () => {
  const ids = [
    ident({ id: 'i1', name: 'Awa Traoré', zone: 'Cocody', isActive: true }),
    ident({ id: 'i2', name: 'Bakary Diomandé', zone: 'Yopougon', isActive: true }),
    ident({ id: 'i3', name: 'Céline Kouassi', zone: 'Cocody', isActive: false }),
    ident({ id: 'i4', name: 'Djamila Bakayoko', zone: 'Cocody', isActive: false }),
  ]
  it('recherche vide (ou espaces) -> tous les ACTIFS, jamais les inactifs', () => {
    expect(filterAssignableIdentificateurs(ids, '').map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(filterAssignableIdentificateurs(ids, '   ').map((i) => i.id)).toEqual(['i1', 'i2'])
  })
  it('recherche par nom insensible à la casse', () => {
    expect(filterAssignableIdentificateurs(ids, 'awa').map((i) => i.id)).toEqual(['i1'])
  })
  it('recherche par zone (les inactifs de la zone restent exclus)', () => {
    expect(filterAssignableIdentificateurs(ids, 'cocody').map((i) => i.id)).toEqual(['i1'])
  })
  it('aucun résultat -> liste vide', () => {
    expect(filterAssignableIdentificateurs(ids, 'inconnu')).toEqual([])
  })
  it('quirk : zone absente comparée via (zone || \'\') — ne matche jamais une recherche non vide', () => {
    const sansZone = [ident({ id: 'i0', zone: undefined, name: 'Zéro Zone', isActive: true })]
    expect(filterAssignableIdentificateurs(sansZone, 'coco')).toEqual([])
    expect(filterAssignableIdentificateurs(sansZone, '').map((i) => i.id)).toEqual(['i0'])
  })
})

describe('missions-logic — toggleSetMember', () => {
  it('ajoute un id absent (ordre d\'insertion préservé)', () => {
    expect([...toggleSetMember(new Set(['a']), 'b')]).toEqual(['a', 'b'])
  })
  it('retire un id présent', () => {
    expect([...toggleSetMember(new Set(['a', 'b']), 'b')]).toEqual(['a'])
  })
  it('ne mute jamais le Set d\'origine (nouvelle instance)', () => {
    const original = new Set(['a'])
    const next = toggleSetMember(original, 'b')
    expect(original.has('b')).toBe(false)
    expect(next).not.toBe(original)
  })
})

describe('missions-logic — teamMemberIdsToPrecheck', () => {
  const ids = [
    ident({ id: 'a1', teamId: 't1', isActive: true }),
    ident({ id: 'a2', teamId: 't1', isActive: false }),
    ident({ id: 'a3', teamId: 't2', isActive: true }),
    ident({ id: 'a4', isActive: true }),
  ]
  it('pré-coche les membres ACTIFS de l\'équipe (jamais les inactifs)', () => {
    expect(teamMemberIdsToPrecheck(ids, 't1')).toEqual(['a1'])
  })
  it('équipe inconnue -> aucune pré-coche', () => {
    expect(teamMemberIdsToPrecheck(ids, 't9')).toEqual([])
  })
})

describe('missions-logic — canSubmitMission', () => {
  const ok = {
    title: 'Mission Cocody',
    zone: 'Cocody',
    targetCount: '500',
    startDate: '2026-01-01',
  }
  it('formulaire complet et non en cours de soumission -> true', () => {
    expect(canSubmitMission(ok, false)).toBe(true)
  })
  it('titre vide ou espaces -> false (trim)', () => {
    expect(canSubmitMission({ ...ok, title: '' }, false)).toBe(false)
    expect(canSubmitMission({ ...ok, title: '   ' }, false)).toBe(false)
  })
  it('champ requis manquant -> false', () => {
    expect(canSubmitMission({ ...ok, zone: '' }, false)).toBe(false)
    expect(canSubmitMission({ ...ok, targetCount: '' }, false)).toBe(false)
    expect(canSubmitMission({ ...ok, startDate: '' }, false)).toBe(false)
  })
  it('soumission en cours -> false (verrou)', () => {
    expect(canSubmitMission(ok, true)).toBe(false)
  })
})

describe('missions-logic — buildMissionPayload', () => {
  const base = {
    title: '  Mission Cocody  ',
    description: '  Objectif Q4  ',
    zone: 'Cocody',
    targetCount: '500',
    startDate: '2026-01-01',
    endDate: '',
    teamId: '',
  }
  it('trim du titre et de la description, objectif parsé, ids du Set', () => {
    const p = buildMissionPayload(base, new Set(['i1']))
    expect(p.title).toBe('Mission Cocody')
    expect(p.description).toBe('Objectif Q4')
    expect(p.targetCount).toBe(500)
    expect(p.identificateurIds).toEqual(['i1'])
  })
  it('quirk : objectif non numérique -> 0 (parseInt || 0)', () => {
    expect(buildMissionPayload({ ...base, targetCount: 'abc' }, new Set()).targetCount).toBe(0)
  })
  it('quirk parseInt préfixe : « 12abc » -> 12 (parsing préfixe jamais corrigé)', () => {
    expect(buildMissionPayload({ ...base, targetCount: '12abc' }, new Set()).targetCount).toBe(12)
  })
  it('endDate / teamId vides -> undefined (jamais de chaîne vide envoyée)', () => {
    const p = buildMissionPayload(base, new Set())
    expect(p.endDate).toBeUndefined()
    expect(p.teamId).toBeUndefined()
  })
  it('endDate / teamId renseignés -> passés tels quels', () => {
    const p = buildMissionPayload({ ...base, endDate: '2026-03-31', teamId: 't1' }, new Set())
    expect(p.endDate).toBe('2026-03-31')
    expect(p.teamId).toBe('t1')
  })
  it('Set d\'ids -> tableau dans l\'ordre d\'insertion', () => {
    const p = buildMissionPayload(base, new Set(['i2', 'i1', 'i3']))
    expect(p.identificateurIds).toEqual(['i2', 'i1', 'i3'])
  })
})

describe('missions-logic — filterMissionsByStatus', () => {
  const ms = [
    mission({ id: 'm1', status: 'en_cours' }),
    mission({ id: 'm2', status: 'terminee' }),
    mission({ id: 'm3', status: 'en_cours' }),
  ]
  it('« toutes » -> la même liste (référence préservée)', () => {
    expect(filterMissionsByStatus(ms, 'toutes')).toBe(ms)
  })
  it('filtre par statut ; statut sans mission -> vide', () => {
    expect(filterMissionsByStatus(ms, 'en_cours').map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(filterMissionsByStatus(ms, 'terminee').map((m) => m.id)).toEqual(['m2'])
    expect(filterMissionsByStatus(ms, 'suspendue')).toEqual([])
  })
})

describe('missions-logic — computeMissionSummary', () => {
  it('compteurs total / en cours', () => {
    const s = computeMissionSummary([
      mission({ id: 'm1', status: 'en_cours' }),
      mission({ id: 'm2', status: 'terminee' }),
      mission({ id: 'm3', status: 'en_cours' }),
    ])
    expect(s.total).toBe(3)
    expect(s.enCours).toBe(2)
  })
  it('moyenne de progression SEULEMENT sur les missions à objectif > 0', () => {
    const s = computeMissionSummary([
      mission({ id: 'm1', targetCount: 100, currentCount: 50 }),
      mission({ id: 'm2', targetCount: 0, currentCount: 0 }),
      mission({ id: 'm3', targetCount: 100, currentCount: 100 }),
    ])
    expect(s.avgProgress).toBe(75)
  })
  it('aucune mission avec objectif -> 0 ; liste vide -> zéros', () => {
    expect(computeMissionSummary([mission({ id: 'm1', targetCount: 0 })]).avgProgress).toBe(0)
    expect(computeMissionSummary([])).toEqual({ total: 0, enCours: 0, avgProgress: 0 })
  })
  it('arrondi Math.round historique sur la moyenne', () => {
    const s = computeMissionSummary([
      mission({ id: 'm1', targetCount: 3, currentCount: 1 }),
      mission({ id: 'm2', targetCount: 3, currentCount: 2 }),
    ])
    expect(s.avgProgress).toBe(50)
  })
})

describe('missions-logic — missionTabCount', () => {
  const ms = [
    mission({ id: 'm1', status: 'en_cours' }),
    mission({ id: 'm2', status: 'en_cours' }),
    mission({ id: 'm3', status: 'terminee' }),
  ]
  it('« toutes » compte tout', () => {
    expect(missionTabCount(ms, 'toutes')).toBe(3)
  })
  it('compte par statut ; statut sans mission -> 0', () => {
    expect(missionTabCount(ms, 'en_cours')).toBe(2)
    expect(missionTabCount(ms, 'terminee')).toBe(1)
    expect(missionTabCount(ms, 'suspendue')).toBe(0)
  })
})
