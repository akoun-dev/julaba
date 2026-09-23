import { describe, it, expect } from 'vitest'
import {
  mapUserFromApi,
  mapActorFromApi,
  mapEnrolmentFromApi,
  mapZoneFromApi,
  mapMissionFromApi,
  mapTeamFromApi,
  mapIdentificateurFromApi,
  mapAuditEntryFromApi,
  mapAlertFromApi,
  mapObjectifFromApi,
  mapAlertRuleFromApi,
  mapDashboardFromApi,
} from '../api-mappers'

describe('mapUserFromApi', () => {
  it('normalise le snake_case en camelCase', () => {
    const u = mapUserFromApi({
      id: 'u1', email: 'a@b.c', name: 'Awa', role: 'admin_general',
      zone: 'Treichel', isActive: true,
      last_login: '2026-09-01T10:00:00Z', created_at: '2026-01-01T00:00:00Z',
    })
    expect(u.isActive).toBe(true)
    expect(u.lastLogin).toBe('2026-09-01T10:00:00.000Z')
    expect(u.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(u.zone).toBe('Treichel')
  })

  it('accepte le camelCase et défauts', () => {
    const u = mapUserFromApi({ id: 'u2', email: 'x@y.z', name: 'Kof', role: 'operateur_terrain', isActive: false })
    expect(u.lastLogin).toBeUndefined()
    expect(u.zone).toBeUndefined()
  })

  it('zone vide → undefined', () => {
    expect(mapUserFromApi({ id: 'u3', email: 'e', name: 'n', role: 'admin_national', isActive: true, zone: '' }).zone).toBeUndefined()
  })
})

describe('mapActorFromApi', () => {
  it('normalise les champs clés + catégorie marchand', () => {
    const a = mapActorFromApi({
      id: 'a1', actor_id: 'M0001', first_name: 'Awa', last_name: 'Koné',
      type: 'marchand', categorie_marchand: 'detaillant', phone: '07', zone: 'Z',
      status: 'actif', gps_lat: 5.3, gps_lng: -4.0, created_at: '2026-02-02T00:00:00Z',
    })
    expect(a.actorId).toBe('M0001')
    expect(a.categorieMarchand).toBe('detaillant')
    expect(a.gpsLat).toBe(5.3)
    expect(a.firstName).toBe('Awa')
  })

  it('nom vide → chaîne vide, catégorie absente → null', () => {
    const a = mapActorFromApi({ id: 'a2', actor_id: 'M0002', first_name: 'B', type: 'producteur', phone: '0', zone: 'Z', status: 'actif' })
    expect(a.lastName).toBe('')
    expect(a.categorieMarchand).toBeNull()
  })
})

describe('mapEnrolmentFromApi', () => {
  it('préserve les drapeaux qualité + raison info demandée', () => {
    const e = mapEnrolmentFromApi({
      id: 'e1', dossier_id: 'D1', actor_name: 'A', actor_type: 'marchand',
      zone: 'Z', identificateur_name: 'I', status: 'info_demandee',
      submitted_at: '2026-03-03T00:00:00Z', has_photo: true, has_gps: false,
      phone: '07', info_request_reason: 'Photo floue',
    })
    expect(e.hasPhoto).toBe(true)
    expect(e.hasGps).toBe(false)
    expect(e.infoRequestReason).toBe('Photo floue')
  })

  it('soumission récente si submitted_at absent', () => {
    const e = mapEnrolmentFromApi({ id: 'e2', dossier_id: 'D2', actor_name: 'B', actor_type: 'producteur', zone: 'Z', identificateur_name: 'I', status: 'en_attente', has_photo: false, has_gps: false, phone: '0' })
    expect(e.submittedAt.startsWith('20')).toBe(true)
  })
})

describe('mapZoneFromApi', () => {
  it('actual_actor_count prioritaire, défauts honnêtes', () => {
    const z = mapZoneFromApi({ id: 'z1', name: 'Adjamé', region: 'Abidjan', identificateur_count: 2, actual_actor_count: 42, target: 50 })
    expect(z.actorCount).toBe(42)
    expect(z.isActive).toBe(true)
    expect(z.target).toBe(50)
  })

  it('sans compte réel ni cible → 0 ; is_active absent → actif', () => {
    const z = mapZoneFromApi({ id: 'z2', name: 'Bouaké', region: 'Gbêkê', identificateurCount: 1 })
    expect(z.actorCount).toBe(0)
    expect(z.target).toBe(0)
    expect(z.isActive).toBe(true)
  })

  it('is_active false est respecté', () => {
    expect(mapZoneFromApi({ id: 'z3', name: 'x', region: 'y', identificateur_count: 0, is_active: false }).isActive).toBe(false)
  })
})

describe('mapMissionFromApi', () => {
  it('normalise dates + assignees + équipe', () => {
    const m = mapMissionFromApi({
      id: 'm1', title: 'T', description: 'D', zone: 'Z', status: 'en_cours',
      target_count: 10, current_count: 3, start_date: '2026-05-01T00:00:00Z',
      end_date: '2026-05-31T00:00:00Z', team_id: 't1', team_name: 'Équipe A',
      assignees: [{ id: 'i1', name: 'Awa' }],
    })
    expect(m.startDate).toBe('2026-05-01T00:00:00.000Z')
    expect(m.teamName).toBe('Équipe A')
    expect(m.assignees).toEqual([{ id: 'i1', name: 'Awa' }])
  })

  it('description absente → chaîne vide, assignees absents → []', () => {
    const m = mapMissionFromApi({ id: 'm2', title: 'T2', zone: 'Z', status: 'suspendue', target_count: 1, current_count: 0, start_date: '2026-05-01T00:00:00Z' })
    expect(m.description).toBe('')
    expect(m.assignees).toEqual([])
    expect(m.endDate).toBeUndefined()
  })
})

describe('mapTeamFromApi', () => {
  it('member_count absent → 0', () => {
    expect(mapTeamFromApi({ id: 't1', name: 'A' }).memberCount).toBe(0)
    expect(mapTeamFromApi({ id: 't2', name: 'B', member_count: 7 }).memberCount).toBe(7)
  })
})

describe('mapIdentificateurFromApi', () => {
  it('agentCode + is_active défaut true', () => {
    const i = mapIdentificateurFromApi({ id: 'i1', name: 'Awa K', agent_code: 'JID-0001', is_active: false })
    expect(i.agentCode).toBe('JID-0001')
    expect(i.isActive).toBe(false)
    expect(mapIdentificateurFromApi({ id: 'i2', name: 'B' }).isActive).toBe(true)
  })
})

describe('mapAuditEntryFromApi', () => {
  it('horodatage : created_at prioritaire, puis createdAt, puis timestamp', () => {
    const a = mapAuditEntryFromApi({ id: 'a1', user_name: 'A', user_email: 'a', action: 'login', module: 'm', created_at: '2026-06-01T00:00:00Z' })
    expect(a.timestamp).toBe('2026-06-01T00:00:00.000Z')
    const b = mapAuditEntryFromApi({ id: 'a2', user_name: 'A', user_email: 'a', action: 'login', module: 'm', createdAt: '2026-06-02T00:00:00Z' })
    expect(b.timestamp).toBe('2026-06-02T00:00:00.000Z')
    const c = mapAuditEntryFromApi({ id: 'a3', user_name: 'A', user_email: 'a', action: 'login', module: 'm', timestamp: '2026-06-03T00:00:00Z' })
    expect(c.timestamp).toBe('2026-06-03T00:00:00.000Z')
  })

  it('ip / userAgent normalisés, détail absent → undefined', () => {
    const a = mapAuditEntryFromApi({ id: 'a4', user_name: 'A', user_email: 'a', action: 'x', module: 'm', ip_address: '1.2.3.4', user_agent: 'UA' })
    expect(a.ipAddress).toBe('1.2.3.4')
    expect(a.userAgent).toBe('UA')
    expect(a.details).toBeUndefined()
  })
})

describe('mapAlertFromApi', () => {
  it('sévérité et acquittement passent tels quels', () => {
    const a = mapAlertFromApi({ id: 'al1', severity: 'critique', title: 'T', message: 'M', module: 'm', created_at: '2026-07-01T00:00:00Z', acknowledged: true })
    expect(a.severity).toBe('critique')
    expect(a.acknowledged).toBe(true)
  })
})

describe('mapObjectifFromApi', () => {
  it('scope par défaut identificateur, current absent → 0, updatedAt ?? createdAt', () => {
    const o = mapObjectifFromApi({ id: 'o1', cible_id: 'i1', cible_label: 'Awa', month: 8, year: 2026, target: 30, created_at: '2026-08-01T00:00:00Z' })
    expect(o.scope).toBe('identificateur')
    expect(o.current).toBe(0)
    expect(o.updatedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('scope zone respecté, current fourni conservé', () => {
    const o = mapObjectifFromApi({ id: 'o2', scope: 'zone', cible_id: 'z1', cible_label: 'Z', month: 8, year: 2026, target: 100, current: 12, created_at: '2026-08-01T00:00:00Z' })
    expect(o.scope).toBe('zone')
    expect(o.current).toBe(12)
  })
})

describe('mapAlertRuleFromApi', () => {
  const units = {
    dossiers_en_attente: 'heures',
    identificateur_inactif: 'jours',
    chute_ventes: '%',
    objectif_en_retard: '%',
  } as Record<string, 'heures' | 'jours' | '%'>

  it('unité par le dictionnaire, défaut %', () => {
    const r = mapAlertRuleFromApi({ rule_type: 'dossiers_en_attente', threshold: '72', enabled: true }, units)
    expect(r.unit).toBe('heures')
    expect(r.threshold).toBe(72)
    const x = mapAlertRuleFromApi({ rule_type: 'inconnu', threshold: 5, enabled: false }, units)
    expect(x.unit).toBe('%')
  })

  it('updatedAt absent → undefined', () => {
    expect(mapAlertRuleFromApi({ rule_type: 'chute_ventes', threshold: 20, enabled: true }, units).updatedAt).toBeUndefined()
  })
})

describe('mapDashboardFromApi', () => {
  it('normalise les 4 collections dérivées', () => {
    const d = mapDashboardFromApi({
      totalActors: 10, activeActors: 8,
      actorCountsByRegion: { Abidjan: 5, 'Bouaké': 3 },
      dailyEnrolmentTrend: [{ date: '2026-09-01', count: 2 }, { day: '01/09', count: 4 }],
      topIdentificateurs: [{ name: 'Awa', count: 3 }],
      systemHealth: [{ name: 'API', status: 'ok', latency: 120 }],
      unacknowledgedAlerts: [{ id: 'a' }, { id: 'b' }],
    })
    expect(d.actorCountsByRegion).toEqual([{ name: 'Abidjan', count: 5 }, { name: 'Bouaké', count: 3 }])
    expect(d.dailyEnrolmentTrend).toEqual([{ day: '2026-09-01', count: 2 }, { day: '01/09', count: 4 }])
    expect(d.topIdentificateurs).toEqual([{ name: 'Awa', zone: '', count: 3 }])
    expect(d.systemHealth).toHaveLength(1)
    expect(d.unacknowledgedAlerts).toBe(2)
    expect(d.nationalTarget).toBe(15000)
  })

  it('collections absentes → vides, compteurs → 0, valeurs fournies passées telles quelles', () => {
    const d = mapDashboardFromApi({ unacknowledgedAlerts: 5, nationalTarget: 20000 })
    expect(d.actorCountsByRegion).toEqual([])
    expect(d.dailyEnrolmentTrend).toEqual([])
    expect(d.topIdentificateurs).toEqual([])
    expect(d.systemHealth).toEqual([])
    expect(d.dataQuality).toEqual({ photos: 0, gps: 0, phones: 0 })
    expect(d.unacknowledgedAlerts).toBe(5)
    expect(d.nationalTarget).toBe(20000)
    expect(d.totalActors).toBe(0)
  })
})
