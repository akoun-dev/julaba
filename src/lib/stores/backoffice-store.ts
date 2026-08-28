import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============== TYPES ==============

export type BoRole = 'super_admin' | 'admin_general' | 'admin_national' | 'gestionnaire_zone' | 'operateur_terrain'

export interface BoUser {
  id: string
  email: string
  name: string
  role: BoRole
  zone?: string
  isActive: boolean
  lastLogin?: string
  createdAt: string
}

export interface BoActor {
  id: string
  actorId: string
  firstName: string
  lastName: string
  type: 'marchand' | 'producteur' | 'cooperatif'
  phone: string
  zone: string
  status: 'actif' | 'suspendu' | 'en_attente' | 'rejete'
  photoUrl?: string
  gpsLat?: number
  gpsLng?: number
  identificateurName?: string
  validatedBy?: string
  validatedAt?: string
  notes?: string
  createdAt: string
}

export interface BoEnrolment {
  id: string
  dossierId: string
  actorName: string
  actorType: 'marchand' | 'producteur' | 'cooperatif'
  zone: string
  identificateurName: string
  status: 'en_attente' | 'valide' | 'rejete' | 'info_demandee'
  submittedAt: string
  validatedBy?: string
  validatedAt?: string
  rejectReason?: string
  hasPhoto: boolean
  hasGps: boolean
  phone: string
}

export interface BoZone {
  id: string
  name: string
  region: string
  identificateurCount: number
  actorCount: number
  isActive: boolean
  target: number
}

export interface BoMission {
  id: string
  title: string
  description: string
  zone: string
  assigneeName?: string
  status: 'en_cours' | 'terminee' | 'suspendue'
  targetCount: number
  currentCount: number
  startDate: string
  endDate?: string
}

export interface AuditEntry {
  id: string
  userName: string
  userEmail: string
  action: string
  module: string
  details?: string
  ipAddress?: string
  userAgent?: string
  timestamp: string
}

export interface BoAlert {
  id: string
  severity: 'critique' | 'haute' | 'moyenne' | 'basse'
  title: string
  message: string
  module: string
  timestamp: string
  acknowledged: boolean
}

export interface TickerData {
  transactionsPerMin: number
  enrolmentsPerHour: number
  uptime: number
  activeUsers: number
}

export interface DashboardData {
  totalActors: number
  activeActors: number
  suspendedActors: number
  totalEnrolments: number
  pendingEnrolments: number
  totalZones: number
  totalMissions: number
  activeMissions: number
  actorCountsByRegion: { name: string; count: number }[]
  dailyEnrolmentTrend: { day: string; count: number }[]
  topIdentificateurs: { name: string; zone: string; count: number }[]
  dataQuality: { photos: number; gps: number; phones: number }
  systemHealth: { name: string; status: string; latency: number }[]
  nationalTarget: number
  unacknowledgedAlerts: number
}

// ============== RBAC PERMISSION MATRIX ==============

export const MODULE_LIST = [
  'dashboard', 'acteurs', 'enrolement', 'zones', 'missions',
  'supervision', 'utilisateurs', 'rapports', 'audit', 'institutions',
  'moderation', 'mutations', 'contenus', 'monitoring-ia', 'events',
  'analytics', 'scores', 'api-keys', 'marketplace', 'livraison',
  'communication', 'cron', 'config-institution', 'keiwa'
] as const

type ModuleName = typeof MODULE_LIST[number]

const ROLE_HIERARCHY: Record<BoRole, number> = {
  super_admin: 5,
  admin_general: 4,
  admin_national: 3,
  gestionnaire_zone: 2,
  operateur_terrain: 1,
}

const MODULE_ACCESS: Record<ModuleName, BoRole[]> = {
  'dashboard': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'acteurs': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'enrolement': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'zones': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  'missions': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  'supervision': ['super_admin', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'utilisateurs': ['super_admin'],
  'rapports': ['super_admin', 'admin_national'],
  'audit': ['super_admin', 'admin_national', 'gestionnaire_zone'],
  'institutions': ['super_admin', 'admin_general'],
  'moderation': ['super_admin', 'gestionnaire_zone', 'operateur_terrain'],
  'mutations': ['super_admin', 'gestionnaire_zone', 'operateur_terrain'],
  'contenus': ['super_admin', 'admin_general'],
  'monitoring-ia': ['super_admin', 'admin_general'],
  'events': ['super_admin'],
  'analytics': ['super_admin', 'admin_national'],
  'scores': ['super_admin', 'admin_national'],
  'api-keys': ['super_admin'],
  'marketplace': ['super_admin', 'admin_general'],
  'livraison': ['super_admin', 'admin_general'],
  'communication': ['super_admin', 'admin_national'],
  'cron': ['super_admin'],
  'config-institution': ['super_admin'],
  'keiwa': ['super_admin', 'admin_general'],
}

export const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: 'Dashboard',
  acteurs: 'Acteurs',
  enrolement: 'Enrôlement',
  zones: 'Zones',
  missions: 'Missions',
  supervision: 'Supervision',
  utilisateurs: 'Utilisateurs',
  rapports: 'Rapports',
  audit: 'Audit',
  institutions: 'Institutions',
  moderation: 'Modération',
  mutations: 'Mutations',
  contenus: 'Contenus',
  'monitoring-ia': 'Monitoring IA',
  events: 'Event Monitor',
  analytics: 'Analytics',
  scores: 'Score Financier',
  'api-keys': 'API Keys',
  marketplace: 'Marketplace',
  livraison: 'Livraison',
  communication: 'Communication',
  cron: 'Cron Dashboard',
  'config-institution': 'Config Institution',
  keiwa: 'Keiwa',
}

export function hasModuleAccess(role: BoRole, module: ModuleName): boolean {
  return MODULE_ACCESS[module]?.includes(role) ?? false
}

export function getAccessibleModules(role: BoRole): ModuleName[] {
  return MODULE_LIST.filter(m => MODULE_ACCESS[m].includes(role))
}

// ============== STORE ==============

export type BoScreenRoute =
  | 'bo-dashboard'
  | 'bo-acteurs'
  | 'bo-enrolement'
  | 'bo-zones'
  | 'bo-missions'
  | 'bo-supervision'
  | 'bo-utilisateurs'
  | 'bo-rapports'
  | 'bo-audit'
  | 'bo-institutions'
  | 'bo-moderation'
  | 'bo-mutations'
  | 'bo-contenus'
  | 'bo-monitoring-ia'
  | 'bo-events'
  | 'bo-analytics'
  | 'bo-scores'
  | 'bo-api-keys'
  | 'bo-marketplace'
  | 'bo-livraison'
  | 'bo-communication'
  | 'bo-cron'
  | 'bo-config-institution'
  | 'bo-keiwa'

interface BackofficeState {
  // Current BO user
  boUser: BoUser | null
  boUserRole: BoRole
  setBoAuth: (user: BoUser) => void
  boLogout: () => void

  // Navigation
  boCurrentScreen: BoScreenRoute
  boNavigate: (screen: BoScreenRoute) => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Loading & error
  loading: boolean
  error: string | null
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void

  // Data
  users: BoUser[]
  actors: BoActor[]
  enrolments: BoEnrolment[]
  zones: BoZone[]
  missions: BoMission[]
  auditLog: AuditEntry[]
  alerts: BoAlert[]
  ticker: TickerData
  dashboard: DashboardData | null

  // Fetch functions
  fetchUsers: () => Promise<void>
  fetchActors: () => Promise<void>
  fetchEnrolments: () => Promise<void>
  fetchZones: () => Promise<void>
  fetchMissions: () => Promise<void>
  fetchAuditLog: () => Promise<void>
  fetchAlerts: () => Promise<void>
  fetchDashboard: () => Promise<DashboardData | null>
  fetchAllData: () => Promise<void>

  // Mutation actions
  updateActorStatus: (actorId: string, status: BoActor['status']) => Promise<void>
  validateEnrolment: (enrolmentId: string, userId: string) => Promise<void>
  rejectEnrolment: (enrolmentId: string, reason: string, userId: string) => Promise<void>
  acknowledgeAlert: (alertId: string) => Promise<void>
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  updateUser: (userId: string, updates: Partial<BoUser>) => Promise<void>
  createUser: (user: Omit<BoUser, 'id' | 'createdAt'>) => Promise<void>

  // Theme
  boTheme: 'light' | 'dark'
  toggleBoTheme: () => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void
}

// ============== HELPER MAPPERS ==============

function mapUserFromApi(u: Record<string, unknown>): BoUser {
  return {
    id: u.id as string,
    email: u.email as string,
    name: u.name as string,
    role: u.role as BoRole,
    zone: (u.zone as string) || undefined,
    isActive: u.isActive as boolean,
    lastLogin: u.lastLogin ? new Date(u.lastLogin as string).toISOString() : undefined,
    createdAt: new Date(u.createdAt as string).toISOString(),
  }
}

function mapActorFromApi(a: Record<string, unknown>): BoActor {
  return {
    id: a.id as string,
    actorId: a.actorId as string,
    firstName: a.firstName as string,
    lastName: (a.lastName as string) || '',
    type: a.type as BoActor['type'],
    phone: a.phone as string,
    zone: a.zone as string,
    status: a.status as BoActor['status'],
    photoUrl: (a.photoUrl as string) || undefined,
    gpsLat: a.gpsLat as number | undefined,
    gpsLng: a.gpsLng as number | undefined,
    identificateurName: (a.identificateurName as string) || undefined,
    validatedBy: (a.validatedBy as string) || undefined,
    validatedAt: a.validatedAt ? new Date(a.validatedAt as string).toISOString() : undefined,
    notes: (a.notes as string) || undefined,
    createdAt: new Date(a.createdAt as string).toISOString(),
  }
}

function mapEnrolmentFromApi(e: Record<string, unknown>): BoEnrolment {
  return {
    id: e.id as string,
    dossierId: e.dossierId as string,
    actorName: e.actorName as string,
    actorType: e.actorType as BoEnrolment['actorType'],
    zone: e.zone as string,
    identificateurName: e.identificateurName as string,
    status: e.status as BoEnrolment['status'],
    submittedAt: new Date(e.submittedAt as string).toISOString(),
    validatedBy: (e.validatedBy as string) || undefined,
    validatedAt: e.validatedAt ? new Date(e.validatedAt as string).toISOString() : undefined,
    rejectReason: (e.rejectReason as string) || undefined,
    hasPhoto: e.hasPhoto as boolean,
    hasGps: e.hasGps as boolean,
    phone: e.phone as string,
  }
}

function mapZoneFromApi(z: Record<string, unknown>): BoZone {
  return {
    id: z.id as string,
    name: z.name as string,
    region: z.region as string,
    identificateurCount: z.identificateurCount as number,
    actorCount: (z.actualActorCount as number) ?? (z.actorCount as number) ?? 0,
    isActive: z.isActive as boolean,
    target: (z.target as number) ?? 0,
  }
}

function mapMissionFromApi(m: Record<string, unknown>): BoMission {
  return {
    id: m.id as string,
    title: m.title as string,
    description: (m.description as string) || '',
    zone: m.zone as string,
    assigneeName: (m.assigneeName as string) || undefined,
    status: m.status as BoMission['status'],
    targetCount: m.targetCount as number,
    currentCount: m.currentCount as number,
    startDate: new Date(m.startDate as string).toISOString(),
    endDate: m.endDate ? new Date(m.endDate as string).toISOString() : undefined,
  }
}

function mapAuditEntryFromApi(a: Record<string, unknown>): AuditEntry {
  return {
    id: a.id as string,
    userName: a.userName as string,
    userEmail: a.userEmail as string,
    action: a.action as string,
    module: a.module as string,
    details: (a.details as string) || undefined,
    ipAddress: (a.ipAddress as string) || undefined,
    userAgent: (a.userAgent as string) || undefined,
    timestamp: new Date(a.createdAt as string).toISOString(),
  }
}

function mapAlertFromApi(a: Record<string, unknown>): BoAlert {
  return {
    id: a.id as string,
    severity: a.severity as BoAlert['severity'],
    title: a.title as string,
    message: a.message as string,
    module: a.module as string,
    timestamp: new Date(a.createdAt as string).toISOString(),
    acknowledged: a.acknowledged as boolean,
  }
}

function mapDashboardFromApi(d: Record<string, unknown>): DashboardData {
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

export const useBackofficeStore = create<BackofficeState>()(
  persist(
    (set, get) => ({
      // Auth
      boUser: null,
      boUserRole: 'admin_general' as BoRole,
      setBoAuth: (user) => set({ boUser: user, boUserRole: user.role as BoRole }),
      boLogout: () => set({ boUser: null, boCurrentScreen: 'bo-dashboard' }),

      // Navigation
      boCurrentScreen: 'bo-dashboard',
      boNavigate: (screen) => set({ boCurrentScreen: screen }),

      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      // Loading & error
      loading: false,
      error: null,
      setLoading: (v) => set({ loading: v }),
      setError: (e) => set({ error: e }),

      // Data - empty initial state
      users: [],
      actors: [],
      enrolments: [],
      zones: [],
      missions: [],
      auditLog: [],
      alerts: [],
      ticker: {
        transactionsPerMin: 0,
        enrolmentsPerHour: 0,
        uptime: 0,
        activeUsers: 0,
      },
      dashboard: null,

      // ============== FETCH FUNCTIONS ==============

      fetchUsers: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/users')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const users: BoUser[] = (Array.isArray(data) ? data : []).map(mapUserFromApi)
          set({ users })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des utilisateurs' })
        } finally {
          set({ loading: false })
        }
      },

      fetchActors: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/actors?limit=999')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const actors: BoActor[] = (data.actors || []).map(mapActorFromApi)
          set({ actors })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des acteurs' })
        } finally {
          set({ loading: false })
        }
      },

      fetchEnrolments: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/enrolments?limit=999')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const enrolments: BoEnrolment[] = (data.enrolments || []).map(mapEnrolmentFromApi)
          set({ enrolments })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des inscriptions' })
        } finally {
          set({ loading: false })
        }
      },

      fetchZones: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/zones')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const zones: BoZone[] = (Array.isArray(data) ? data : []).map(mapZoneFromApi)
          set({ zones })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des zones' })
        } finally {
          set({ loading: false })
        }
      },

      fetchMissions: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/missions')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const missions: BoMission[] = (Array.isArray(data) ? data : []).map(mapMissionFromApi)
          set({ missions })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des missions' })
        } finally {
          set({ loading: false })
        }
      },

      fetchAuditLog: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/audit?limit=999')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const auditLog: AuditEntry[] = (data.logs || []).map(mapAuditEntryFromApi)
          set({ auditLog })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement du journal d\'audit' })
        } finally {
          set({ loading: false })
        }
      },

      fetchAlerts: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice/alerts')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const alerts: BoAlert[] = (Array.isArray(data) ? data : []).map(mapAlertFromApi)
          set({ alerts })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement des alertes' })
        } finally {
          set({ loading: false })
        }
      },

      fetchDashboard: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/api/backoffice')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          if (data.erreur) throw new Error(data.erreur)
          const dashboard = mapDashboardFromApi(data)
          set({
            dashboard,
            ticker: {
              transactionsPerMin: 0,
              enrolmentsPerHour: data.pendingEnrolments || 0,
              uptime: data.systemHealth?.uptime || 0,
              activeUsers: data.activeActors || 0,
            },
          })
          return dashboard
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de chargement du tableau de bord' })
          return null
        } finally {
          set({ loading: false })
        }
      },

      fetchAllData: async () => {
        set({ loading: true, error: null })
        const store = get()
        const results = await Promise.allSettled([
          store.fetchUsers(),
          store.fetchActors(),
          store.fetchEnrolments(),
          store.fetchZones(),
          store.fetchMissions(),
          store.fetchAuditLog(),
          store.fetchAlerts(),
          store.fetchDashboard(),
        ])
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => r.reason?.message || r.reason || 'Erreur inconnue')
        if (errors.length > 0) {
          set({ error: errors.join('; ') })
        }
        set({ loading: false })
      },

      // ============== MUTATION ACTIONS ==============

      updateActorStatus: async (actorId, status) => {
        // Optimistic update
        set((s) => ({
          actors: s.actors.map((a) => (a.id === actorId ? { ...a, status } : a)),
        }))
        try {
          const res = await fetch('/api/backoffice/actors', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: actorId, status }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback on error
          set((s) => ({
            actors: s.actors.map((a) => (a.id === actorId ? { ...a, status: 'actif' as const } : a)),
            error: err instanceof Error ? err.message : 'Erreur de mise à jour du statut',
          }))
        }
      },

      validateEnrolment: async (enrolmentId, userId) => {
        const now = new Date().toISOString()
        // Optimistic update
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'valide' as const, validatedBy: userId, validatedAt: now }
              : e
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/enrolments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: enrolmentId, action: 'valider', validatedBy: userId }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            enrolments: s.enrolments.map((e) =>
              e.id === enrolmentId
                ? { ...e, status: 'en_attente' as const, validatedBy: undefined, validatedAt: undefined }
                : e
            ),
            error: err instanceof Error ? err.message : 'Erreur de validation',
          }))
        }
      },

      rejectEnrolment: async (enrolmentId, reason, userId) => {
        const now = new Date().toISOString()
        // Optimistic update
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'rejete' as const, validatedBy: userId, validatedAt: now, rejectReason: reason }
              : e
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/enrolments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: enrolmentId, action: 'rejeter', validatedBy: userId, rejectReason: reason }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            enrolments: s.enrolments.map((e) =>
              e.id === enrolmentId
                ? { ...e, status: 'en_attente' as const, validatedBy: undefined, validatedAt: undefined, rejectReason: undefined }
                : e
            ),
            error: err instanceof Error ? err.message : 'Erreur de rejet',
          }))
        }
      },

      acknowledgeAlert: async (alertId) => {
        // Optimistic update
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)),
        }))
        try {
          const res = await fetch('/api/backoffice/alerts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: alertId, acknowledged: true }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: false } : a)),
            error: err instanceof Error ? err.message : 'Erreur d\'acquittement',
          }))
        }
      },

      addAuditEntry: (entry) =>
        set((s) => ({
          auditLog: [
            { ...entry, id: `a-${Date.now()}`, timestamp: new Date().toISOString() },
            ...s.auditLog,
          ],
        })),

      updateUser: async (userId, updates) => {
        const previous = get().users.find((u) => u.id === userId)
        // Optimistic update
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...updates } : u)),
        }))
        try {
          const body: Record<string, unknown> = { id: userId }
          if (updates.role) body.role = updates.role
          if (updates.isActive !== undefined) body.isActive = updates.isActive
          if (updates.zone !== undefined) body.zone = updates.zone
          if (updates.name) body.name = updates.name
          const res = await fetch('/api/backoffice/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          if (previous) {
            set((s) => ({
              users: s.users.map((u) => (u.id === userId ? previous : u)),
            }))
          }
          set({ error: err instanceof Error ? err.message : 'Erreur de mise à jour de l\'utilisateur' })
        }
      },

      createUser: async (user) => {
        try {
          const res = await fetch('/api/backoffice/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              role: user.role,
              zone: user.zone || null,
              passwordHash: 'admin123',
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = await res.json()
          const newUser = mapUserFromApi(created)
          set((s) => ({ users: [...s.users, newUser] }))
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Erreur de création de l\'utilisateur' })
        }
      },

      // Theme
      boTheme: 'light' as const,
      toggleBoTheme: () => set((s) => ({ boTheme: s.boTheme === 'light' ? 'dark' : 'light' })),

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: 'julaba-backoffice-store',
      partialize: (state) => ({
        boUserRole: state.boUserRole,
        sidebarCollapsed: state.sidebarCollapsed,
        boCurrentScreen: state.boCurrentScreen,
        boTheme: state.boTheme,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (!error && state) {
            // Auto-fetch data from API after rehydration
            state.fetchAllData()
          }
        }
      },
    }
  )
)

// ============== HELPERS ==============

export const BO_COLOR = '#0F172A'
export const BO_COLOR_PRIMARY = '#3B82F6'
export const BO_COLOR_LIGHT = '#64748B'
export const BO_COLOR_BG = '#F8FAFC'
export const BO_COLOR_BORDER = '#E2E8F0'

export const ROLE_LABELS: Record<BoRole, string> = {
  super_admin: 'Super Admin',
  admin_general: 'Admin Général',
  admin_national: 'Admin National',
  gestionnaire_zone: 'Gestionnaire Zone',
  operateur_terrain: 'Opérateur Terrain',
}

export const STATUS_COLORS: Record<string, string> = {
  actif: 'bg-emerald-100 text-emerald-800',
  suspendu: 'bg-red-100 text-red-800',
  en_attente: 'bg-amber-100 text-amber-800',
  rejete: 'bg-gray-100 text-gray-800',
  info_demandee: 'bg-blue-100 text-blue-800',
  valide: 'bg-emerald-100 text-emerald-800',
  en_cours: 'bg-blue-100 text-blue-800',
  terminee: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-gray-100 text-gray-800',
}

export const STATUS_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  en_attente: 'En attente',
  rejete: 'Rejeté',
  info_demandee: 'Info demandée',
  valide: 'Validé',
  en_cours: 'En cours',
  terminee: 'Terminée',
  inactive: 'Inactif',
}

export const SEVERITY_COLORS: Record<string, string> = {
  critique: 'bg-red-500',
  haute: 'bg-orange-500',
  moyenne: 'bg-yellow-500',
  basse: 'bg-blue-500',
}

export const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand(e)',
  producteur: 'Producteur(rice)',
  cooperatif: 'Coopérative',
}

export const ACTOR_TYPE_ICONS: Record<string, string> = {
  marchand: 'Store',
  producteur: 'Wheat',
  cooperatif: 'Handshake',
}

// Sidebar menu items
export interface SidebarItem {
  id: BoScreenRoute
  label: string
  icon: string
  badge?: number
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'bo-dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
  { id: 'bo-acteurs', label: 'Acteurs', icon: 'Users' },
  { id: 'bo-enrolement', label: 'Enrôlement', icon: 'FileCheck' },
  { id: 'bo-zones', label: 'Zones & Territoires', icon: 'Map' },
  { id: 'bo-missions', label: 'Missions', icon: 'Target' },
  { id: 'bo-supervision', label: 'Supervision', icon: 'Eye' },
  { id: 'bo-utilisateurs', label: 'Utilisateurs BO', icon: 'UserCog' },
  { id: 'bo-rapports', label: 'Rapports', icon: 'BarChart3' },
  { id: 'bo-audit', label: 'Audit', icon: 'Shield' },
  { id: 'bo-institutions', label: 'Institutions', icon: 'Building2' },
  { id: 'bo-moderation', label: 'Modération', icon: 'AlertTriangle' },
  { id: 'bo-mutations', label: 'Mutations', icon: 'ArrowLeftRight' },
  { id: 'bo-contenus', label: 'Contenus', icon: 'BookOpen' },
  { id: 'bo-monitoring-ia', label: 'Monitoring IA', icon: 'Bot' },
  { id: 'bo-events', label: 'Event Monitor', icon: 'Radio' },
  { id: 'bo-analytics', label: 'Analytics Produit', icon: 'TrendingUp' },
  { id: 'bo-scores', label: 'Score Financier', icon: 'CreditCard' },
  { id: 'bo-api-keys', label: 'API Keys', icon: 'Key' },
  { id: 'bo-marketplace', label: 'Marketplace', icon: 'ShoppingCart' },
  { id: 'bo-livraison', label: 'Livraison', icon: 'Truck' },
  { id: 'bo-communication', label: 'Communication', icon: 'MessageSquare' },
  { id: 'bo-cron', label: 'Cron Dashboard', icon: 'Clock' },
  { id: 'bo-config-institution', label: 'Config Institution', icon: 'Settings' },
  { id: 'bo-keiwa', label: 'Keiwa', icon: 'Wallet' },
]
