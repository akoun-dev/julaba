// MODE-990 (DET-001 tranche 4) — normalisation des réponses API du
// back-office : les 12 mappers purs extraits VERBATIM du store (seule
// la déclaration devient export). Pur : aucune dépendance zustand —
// testables directement (snake_case / camelCase, fallbacks, défauts).
import type { BoUser, BoActor, BoEnrolment, BoZone, BoMission, BoTeam, BoIdentificateur, BoObjectif, BoAlertRule, AuditEntry, BoAlert, DashboardData } from './bo-models'
import type { BoRole } from '@/lib/backoffice-permissions'

// ============== HELPER MAPPERS ==============

export function mapUserFromApi(u: Record<string, unknown>): BoUser {
  return {
    id: u.id as string,
    email: u.email as string,
    name: u.name as string,
    role: u.role as BoRole,
    zone: (u.zone as string) || undefined,
    isActive: u.isActive as boolean,
    lastLogin: (u.last_login ?? u.lastLogin) ? new Date((u.last_login ?? u.lastLogin) as string).toISOString() : undefined,
    createdAt: new Date(((u.created_at ?? u.createdAt) as string) || Date.now()).toISOString(),
  }
}

export function mapActorFromApi(a: Record<string, unknown>): BoActor {
  const createdAt = a.created_at ?? a.createdAt
  return {
    id: a.id as string,
    actorId: (a.actor_id ?? a.actorId) as string,
    firstName: (a.first_name ?? a.firstName) as string,
    lastName: ((a.last_name ?? a.lastName) as string) || '',
    type: a.type as BoActor['type'],
    categorieMarchand: ((a.categorie_marchand ?? a.categorieMarchand) as string) || null,
    phone: a.phone as string,
    zone: a.zone as string,
    status: a.status as BoActor['status'],
    photoUrl: ((a.photo_url ?? a.photoUrl) as string) || undefined,
    gpsLat: (a.gps_lat ?? a.gpsLat) as number | undefined,
    gpsLng: (a.gps_lng ?? a.gpsLng) as number | undefined,
    identificateurName: ((a.identificateur_name ?? a.identificateurName) as string) || undefined,
    validatedBy: ((a.validated_by ?? a.validatedBy) as string) || undefined,
    validatedAt: (a.validated_at ?? a.validatedAt) ? new Date((a.validated_at ?? a.validatedAt) as string).toISOString() : undefined,
    notes: (a.notes as string) || undefined,
    createdAt: createdAt ? new Date(createdAt as string).toISOString() : new Date().toISOString(),
  }
}

export function mapEnrolmentFromApi(e: Record<string, unknown>): BoEnrolment {
  const submittedAt = e.submitted_at ?? e.submittedAt
  return {
    id: e.id as string,
    dossierId: (e.dossier_id ?? e.dossierId) as string,
    actorName: (e.actor_name ?? e.actorName) as string,
    actorType: (e.actor_type ?? e.actorType) as BoEnrolment['actorType'],
    categorieMarchand: ((e.categorie_marchand ?? e.categorieMarchand) as string) || null,
    activite: ((e.activite ?? e.activite) as string) || null,
    zone: e.zone as string,
    identificateurName: (e.identificateur_name ?? e.identificateurName) as string,
    status: e.status as BoEnrolment['status'],
    submittedAt: submittedAt ? new Date(submittedAt as string).toISOString() : new Date().toISOString(),
    validatedBy: ((e.validated_by ?? e.validatedBy) as string) || undefined,
    validatedAt: (e.validated_at ?? e.validatedAt) ? new Date((e.validated_at ?? e.validatedAt) as string).toISOString() : undefined,
    rejectReason: ((e.reject_reason ?? e.rejectReason) as string) || undefined,
    infoRequestReason: ((e.info_request_reason ?? e.infoRequestReason) as string) || undefined,
    hasPhoto: (e.has_photo ?? e.hasPhoto) as boolean,
    hasGps: (e.has_gps ?? e.hasGps) as boolean,
    phone: e.phone as string,
  }
}

export function mapZoneFromApi(z: Record<string, unknown>): BoZone {
  return {
    id: z.id as string,
    name: z.name as string,
    region: z.region as string,
    identificateurCount: (z.identificateur_count ?? z.identificateurCount) as number,
    actorCount: (z.actual_actor_count ?? z.actualActorCount ?? z.actor_count ?? z.actorCount) as number ?? 0,
    isActive: ((z.is_active ?? z.isActive) as boolean) ?? true,
    target: ((z.target as number) ?? 0),
  }
}

export function mapMissionFromApi(m: Record<string, unknown>): BoMission {
  const startDate = m.start_date ?? m.startDate
  const endDate = m.end_date ?? m.endDate
  const assigneesRaw = (m.assignees as Array<{ id: string; name: string }> | undefined) || []
  return {
    id: m.id as string,
    title: m.title as string,
    description: (m.description as string) || '',
    zone: m.zone as string,
    status: m.status as BoMission['status'],
    targetCount: (m.target_count ?? m.targetCount) as number,
    currentCount: (m.current_count ?? m.currentCount) as number,
    startDate: startDate ? new Date(startDate as string).toISOString() : new Date().toISOString(),
    endDate: endDate ? new Date(endDate as string).toISOString() : undefined,
    teamId: ((m.team_id ?? m.teamId) as string) || undefined,
    teamName: ((m.team_name ?? m.teamName) as string) || undefined,
    assignees: assigneesRaw.map((a) => ({ id: a.id, name: a.name })),
  }
}

export function mapTeamFromApi(t: Record<string, unknown>): BoTeam {
  return {
    id: t.id as string,
    name: t.name as string,
    zone: (t.zone as string) || undefined,
    description: (t.description as string) || undefined,
    memberCount: (t.member_count ?? t.memberCount) as number ?? 0,
    createdAt: new Date(((t.created_at ?? t.createdAt) as string) || Date.now()).toISOString(),
  }
}

export function mapIdentificateurFromApi(i: Record<string, unknown>): BoIdentificateur {
  return {
    id: i.id as string,
    name: i.name as string,
    firstName: (i.first_name ?? i.firstName) as string | undefined,
    lastName: (i.last_name ?? i.lastName) as string | undefined,
    agentCode: ((i.agent_code ?? i.agentCode) as string) || undefined,
    phone: (i.phone as string) || undefined,
    email: (i.email as string) || undefined,
    zone: (i.zone as string) || undefined,
    teamId: ((i.team_id ?? i.teamId) as string) || undefined,
    isActive: ((i.is_active ?? i.isActive) as boolean) ?? true,
    createdAt: new Date(((i.created_at ?? i.createdAt) as string) || Date.now()).toISOString(),
  }
}

export function mapAuditEntryFromApi(a: Record<string, unknown>): AuditEntry {
  const timestamp = a.created_at ?? a.createdAt ?? a.timestamp
  return {
    id: a.id as string,
    userName: (a.user_name ?? a.userName) as string,
    userEmail: (a.user_email ?? a.userEmail) as string,
    action: a.action as string,
    module: a.module as string,
    details: (a.details as string) || undefined,
    ipAddress: ((a.ip_address ?? a.ipAddress) as string) || undefined,
    userAgent: ((a.user_agent ?? a.userAgent) as string) || undefined,
    timestamp: timestamp ? new Date(timestamp as string).toISOString() : new Date().toISOString(),
  }
}

export function mapAlertFromApi(a: Record<string, unknown>): BoAlert {
  const timestamp = a.created_at ?? a.createdAt
  return {
    id: a.id as string,
    severity: a.severity as BoAlert['severity'],
    title: a.title as string,
    message: a.message as string,
    module: a.module as string,
    timestamp: timestamp ? new Date(timestamp as string).toISOString() : new Date().toISOString(),
    acknowledged: a.acknowledged as boolean,
  }
}

export function mapObjectifFromApi(o: Record<string, unknown>): BoObjectif {
  const created = o.created_at ?? o.createdAt
  const updated = o.updated_at ?? o.updatedAt ?? created
  return {
    id: o.id as string,
    scope: (o.scope as BoObjectif['scope']) || 'identificateur',
    cibleId: (o.cible_id ?? o.cibleId) as string,
    cibleLabel: (o.cible_label ?? o.cibleLabel) as string,
    month: o.month as number,
    year: o.year as number,
    target: o.target as number,
    current: (o.current as number) ?? 0,
    createdAt: created ? new Date(created as string).toISOString() : new Date().toISOString(),
    updatedAt: updated ? new Date(updated as string).toISOString() : new Date().toISOString(),
  }
}

export function mapAlertRuleFromApi(r: Record<string, unknown>, fallbacks: Record<string, BoAlertRule['unit']>): BoAlertRule {
  const updated = r.updated_at ?? r.updatedAt
  const ruleType = r.rule_type ?? r.ruleType
  return {
    ruleType: ruleType as BoAlertRule['ruleType'],
    unit: fallbacks[ruleType as string] || '%',
    threshold: Number(r.threshold),
    enabled: r.enabled as boolean,
    updatedAt: updated ? new Date(updated as string).toISOString() : undefined,
  }
}

export function mapDashboardFromApi(d: Record<string, unknown>): DashboardData {
  const actorCountsByRegionRaw = d.actorCountsByRegion as Record<string, number> | undefined
  const actorCountsByRegion = actorCountsByRegionRaw
    ? Object.entries(actorCountsByRegionRaw).map(([name, count]) => ({ name, count }))
    : []

  const dailyEnrolmentTrendRaw = d.dailyEnrolmentTrend as { date?: string; day?: string; count: number }[] | undefined
  const dailyEnrolmentTrend = (dailyEnrolmentTrendRaw || []).map((item) => ({
    day: item.day || item.date || '',
    count: item.count,
  }))

  const topIdentificateursRaw = d.topIdentificateurs as { name: string; zone?: string; count: number }[] | undefined
  const topIdentificateurs = (topIdentificateursRaw || []).map((item) => ({
    name: item.name,
    zone: item.zone || '',
    count: item.count,
  }))

  const systemHealthRaw = d.systemHealth as Array<{ name: string; status: string; latency: number }> | undefined
  const systemHealth = Array.isArray(systemHealthRaw)
    ? systemHealthRaw.map((item) => ({ name: item.name, status: item.status, latency: item.latency }))
    : []

  const unacknowledgedAlertsRaw = d.unacknowledgedAlerts
  const unacknowledgedAlerts = Array.isArray(unacknowledgedAlertsRaw)
    ? unacknowledgedAlertsRaw.length
    : (unacknowledgedAlertsRaw as number) || 0

  return {
    totalActors: (d.totalActors as number) || 0,
    activeActors: (d.activeActors as number) || 0,
    suspendedActors: (d.suspendedActors as number) || 0,
    totalEnrolments: (d.totalEnrolments as number) || 0,
    pendingEnrolments: (d.pendingEnrolments as number) || 0,
    totalZones: (d.totalZones as number) || 0,
    totalMissions: (d.totalMissions as number) || 0,
    activeMissions: (d.activeMissions as number) || 0,
    actorCountsByRegion,
    dailyEnrolmentTrend,
    topIdentificateurs,
    dataQuality: (d.dataQuality as { photos: number; gps: number; phones: number }) || { photos: 0, gps: 0, phones: 0 },
    systemHealth,
    nationalTarget: (d.nationalTarget as number) || 15000,
    unacknowledgedAlerts,
  }
}
