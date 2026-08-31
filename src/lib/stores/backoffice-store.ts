import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Store, Wheat, Handshake, type LucideIcon } from 'lucide-react'
import {
  type BoRole,
  type ModuleName,
  MODULE_LIST,
  ROLE_HIERARCHY,
  MODULE_ACCESS,
  MODULE_LABELS,
  hasModuleAccess,
  getAccessibleModules,
} from '@/lib/backoffice-permissions'

export type { BoRole, ModuleName }
export { MODULE_LIST, ROLE_HIERARCHY, MODULE_ACCESS, MODULE_LABELS, hasModuleAccess, getAccessibleModules }

// ============== TYPES ==============

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
// Moved to src/lib/backoffice-permissions.ts so the server-side API guard
// (src/lib/backoffice-auth) shares the exact same role/module matrix as the
// client UI instead of maintaining a second copy that could drift.

// ============== STORE ==============

export type BoErrorDomain = 'users' | 'actors' | 'enrolments' | 'zones' | 'missions' | 'auditLog' | 'alerts' | 'dashboard'

export type BoScreenRoute =
  | 'bo-administration'
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
  | 'bo-producteurs'
  | 'bo-tontines'
  | 'bo-device-sessions'
  | 'bo-sync-conflicts'
  | 'bo-notifications'
  | 'bo-academie'

interface BackofficeState {
  // Current BO user — authoritative only once boSessionChecked is true.
  // Never trust boUser/boUserRole for access decisions before that: they
  // are re-derived from the server session on every load, not from what
  // was persisted client-side.
  boUser: BoUser | null
  boUserRole: BoRole
  boSessionChecked: boolean
  setBoAuth: (user: BoUser) => void
  checkBoSession: () => Promise<void>
  boLogout: () => Promise<void>

  // Navigation
  boCurrentScreen: BoScreenRoute
  boNavigate: (screen: BoScreenRoute) => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Loading & error — one error per data domain, so a failure in one
  // fetch (e.g. zones) doesn't mask or get overwritten by another
  // (e.g. actors) when fetchAllData() runs them in parallel.
  loading: boolean
  errors: Partial<Record<BoErrorDomain, string>>
  setLoading: (v: boolean) => void
  setDomainError: (domain: BoErrorDomain, message: string | null) => void

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

  // Server-side totals for the paginated collections — actors/enrolments/
  // auditLog are fetched a page at a time (the API caps each page at 100),
  // so `actors.length` alone doesn't tell you whether everything has been
  // loaded. Compare against these totals, and use fetchMore*() to load the
  // next page instead of re-requesting a larger limit.
  actorsTotal: number
  enrolmentsTotal: number
  auditLogTotal: number

  // Fetch functions
  fetchUsers: () => Promise<void>
  fetchActors: (opts?: { append?: boolean }) => Promise<void>
  fetchEnrolments: (opts?: { append?: boolean }) => Promise<void>
  fetchZones: () => Promise<void>
  fetchMissions: () => Promise<void>
  fetchAuditLog: (opts?: { append?: boolean }) => Promise<void>
  fetchAlerts: () => Promise<void>
  fetchDashboard: () => Promise<DashboardData | null>
  fetchAllData: () => Promise<void>
  fetchMoreActors: () => Promise<void>
  fetchMoreEnrolments: () => Promise<void>
  fetchMoreAuditLog: () => Promise<void>

  // Mutation actions
  updateActorStatus: (actorId: string, status: BoActor['status']) => Promise<void>
  validateEnrolment: (enrolmentId: string, userId: string) => Promise<void>
  rejectEnrolment: (enrolmentId: string, reason: string, userId: string) => Promise<void>
  acknowledgeAlert: (alertId: string) => Promise<void>
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  updateUser: (userId: string, updates: Partial<BoUser>) => Promise<void>
  createUser: (user: Omit<BoUser, 'id' | 'createdAt'>) => Promise<{ tempPassword: string } | null>

  // Theme
  boTheme: 'light' | 'dark'
  toggleBoTheme: () => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Global command palette (Ctrl+K)
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  // Cross-screen actor detail request (opened from command palette)
  actorDetailRequestId: string | null
  openActorDetail: (actorId: string) => void
  clearActorDetailRequest: () => void
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
      boSessionChecked: false,
      setBoAuth: (user) => set({ boUser: user, boUserRole: user.role as BoRole, boSessionChecked: true }),
      checkBoSession: async () => {
        try {
          const res = await fetch('/api/backoffice/session')
          if (!res.ok) {
            set({ boUser: null, boSessionChecked: true })
            return
          }
          const user = await res.json()
          set({
            boUser: {
              id: user.id, email: user.email, name: user.name, role: user.role,
              zone: user.zone || undefined, isActive: user.isActive, createdAt: '',
            },
            boUserRole: user.role as BoRole,
            boSessionChecked: true,
          })
          get().fetchAllData()
        } catch {
          set({ boUser: null, boSessionChecked: true })
        }
      },
      boLogout: async () => {
        try {
          await fetch('/api/backoffice/logout', { method: 'POST' })
        } catch {
          // best-effort — clear local state regardless
        }
        set({ boUser: null, boCurrentScreen: 'bo-dashboard' })
      },

      // Navigation
      boCurrentScreen: 'bo-dashboard',
      boNavigate: (screen) => set({ boCurrentScreen: screen }),

      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      // Loading & error
      loading: false,
      errors: {},
      setLoading: (v) => set({ loading: v }),
      setDomainError: (domain, message) =>
        set((s) => {
          const errors = { ...s.errors }
          if (message) errors[domain] = message
          else delete errors[domain]
          return { errors }
        }),

      // Data - empty initial state
      users: [],
      actors: [],
      enrolments: [],
      zones: [],
      missions: [],
      auditLog: [],
      alerts: [],
      actorsTotal: 0,
      enrolmentsTotal: 0,
      auditLogTotal: 0,
      ticker: {
        transactionsPerMin: 0,
        enrolmentsPerHour: 0,
        uptime: 0,
        activeUsers: 0,
      },
      dashboard: null,

      // ============== FETCH FUNCTIONS ==============

      fetchUsers: async () => {
        set({ loading: true })
        get().setDomainError('users', null)
        try {
          const res = await fetch('/api/backoffice/users')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const users: BoUser[] = (Array.isArray(data) ? data : []).map(mapUserFromApi)
          set({ users })
        } catch (err) {
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de chargement des utilisateurs')
        } finally {
          set({ loading: false })
        }
      },

      fetchActors: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().actors.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('actors', null)
        try {
          const res = await fetch(`/api/backoffice/actors?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newActors: BoActor[] = (data.actors || []).map(mapActorFromApi)
          set((s) => ({
            actors: append ? [...s.actors, ...newActors] : newActors,
            actorsTotal: (data.total as number) ?? newActors.length,
          }))
        } catch (err) {
          get().setDomainError('actors', err instanceof Error ? err.message : 'Erreur de chargement des acteurs')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreActors: async () => {
        await get().fetchActors({ append: true })
      },

      fetchEnrolments: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().enrolments.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('enrolments', null)
        try {
          const res = await fetch(`/api/backoffice/enrolments?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newEnrolments: BoEnrolment[] = (data.enrolments || []).map(mapEnrolmentFromApi)
          set((s) => ({
            enrolments: append ? [...s.enrolments, ...newEnrolments] : newEnrolments,
            enrolmentsTotal: (data.total as number) ?? newEnrolments.length,
          }))
        } catch (err) {
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de chargement des inscriptions')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreEnrolments: async () => {
        await get().fetchEnrolments({ append: true })
      },

      fetchZones: async () => {
        set({ loading: true })
        get().setDomainError('zones', null)
        try {
          const res = await fetch('/api/backoffice/zones')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const zones: BoZone[] = (Array.isArray(data) ? data : []).map(mapZoneFromApi)
          set({ zones })
        } catch (err) {
          get().setDomainError('zones', err instanceof Error ? err.message : 'Erreur de chargement des zones')
        } finally {
          set({ loading: false })
        }
      },

      fetchMissions: async () => {
        set({ loading: true })
        get().setDomainError('missions', null)
        try {
          const res = await fetch('/api/backoffice/missions')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const missions: BoMission[] = (Array.isArray(data) ? data : []).map(mapMissionFromApi)
          set({ missions })
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de chargement des missions')
        } finally {
          set({ loading: false })
        }
      },

      fetchAuditLog: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().auditLog.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('auditLog', null)
        try {
          const res = await fetch(`/api/backoffice/audit?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newEntries: AuditEntry[] = (data.logs || []).map(mapAuditEntryFromApi)
          set((s) => ({
            auditLog: append ? [...s.auditLog, ...newEntries] : newEntries,
            auditLogTotal: (data.total as number) ?? newEntries.length,
          }))
        } catch (err) {
          get().setDomainError('auditLog', err instanceof Error ? err.message : 'Erreur de chargement du journal d\'audit')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreAuditLog: async () => {
        await get().fetchAuditLog({ append: true })
      },

      fetchAlerts: async () => {
        set({ loading: true })
        get().setDomainError('alerts', null)
        try {
          const res = await fetch('/api/backoffice/alerts')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const alerts: BoAlert[] = (Array.isArray(data) ? data : []).map(mapAlertFromApi)
          set({ alerts })
        } catch (err) {
          get().setDomainError('alerts', err instanceof Error ? err.message : 'Erreur de chargement des alertes')
        } finally {
          set({ loading: false })
        }
      },

      fetchDashboard: async () => {
        set({ loading: true })
        get().setDomainError('dashboard', null)
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
          get().setDomainError('dashboard', err instanceof Error ? err.message : 'Erreur de chargement du tableau de bord')
          return null
        } finally {
          set({ loading: false })
        }
      },

      fetchAllData: async () => {
        set({ loading: true })
        const store = get()
        await Promise.allSettled([
          store.fetchUsers(),
          store.fetchActors(),
          store.fetchEnrolments(),
          store.fetchZones(),
          store.fetchMissions(),
          store.fetchAuditLog(),
          store.fetchAlerts(),
          store.fetchDashboard(),
        ])
        set({ loading: false })
      },

      // ============== MUTATION ACTIONS ==============

      updateActorStatus: async (actorId, status) => {
        const previous = get().actors.find((a) => a.id === actorId)
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
          // Rollback to the actor's previous status, not a hardcoded default
          if (previous) {
            set((s) => ({
              actors: s.actors.map((a) => (a.id === actorId ? previous : a)),
            }))
          }
          get().setDomainError('actors', err instanceof Error ? err.message : 'Erreur de mise à jour du statut')
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
          }))
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de validation')
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
          }))
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de rejet')
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
          }))
          get().setDomainError('alerts', err instanceof Error ? err.message : 'Erreur d\'acquittement')
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
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de mise à jour de l\'utilisateur')
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
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = await res.json()
          const newUser = mapUserFromApi(created)
          set((s) => ({ users: [...s.users, newUser] }))
          return { tempPassword: (created as { tempPassword: string }).tempPassword }
        } catch (err) {
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de création de l\'utilisateur')
          return null
        }
      },

      // Theme
      boTheme: 'light' as const,
      toggleBoTheme: () => {
        set((s) => {
          const next = s.boTheme === 'light' ? 'dark' : 'light'
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', next === 'dark')
          }
          return { boTheme: next }
        })
      },

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Global command palette (Ctrl+K)
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Cross-screen actor detail request (opened from command palette)
      actorDetailRequestId: null,
      openActorDetail: (actorId) =>
        set({ actorDetailRequestId: actorId, boCurrentScreen: 'bo-acteurs' }),
      clearActorDetailRequest: () => set({ actorDetailRequestId: null }),
    }),
    {
      name: 'julaba-backoffice-store',
      // boUser/boUserRole are deliberately NOT persisted: they are a
      // security-relevant claim, and must always come from the server
      // session (checkBoSession), never from client-controlled storage.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        boCurrentScreen: state.boCurrentScreen,
        boTheme: state.boTheme,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (!error && state) {
            // Apply persisted theme to DOM
            if (typeof document !== 'undefined') {
              document.documentElement.classList.toggle('dark', state.boTheme === 'dark')
            }
            // Resolve the real, server-verified session before trusting
            // anything about who is logged in or what they can access.
            state.checkBoSession()
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

export const ACTOR_TYPE_ICONS: Record<string, LucideIcon> = {
  marchand: Store,
  producteur: Wheat,
  cooperatif: Handshake,
}

// Sidebar menu items
export interface SidebarItem {
  id: BoScreenRoute
  label: string
  icon: string
  badge?: number
}

// Sidebar groups: items clustered by functional domain
export interface SidebarGroup {
  id: string
  label: string
  items: SidebarItem[]
}

// Administration modules remain individually routable and permissioned;
// the sidebar exposes them through the Administration overview.
export const ADMINISTRATION_ITEMS: SidebarItem[] = [
  { id: 'bo-utilisateurs', label: 'Utilisateurs BO', icon: 'UserCog' },
  { id: 'bo-institutions', label: 'Institutions', icon: 'Building2' },
  { id: 'bo-config-institution', label: 'Config Institution', icon: 'Settings' },
  { id: 'bo-audit', label: 'Audit', icon: 'Shield' },
  { id: 'bo-api-keys', label: 'Clés API', icon: 'Key' },
  { id: 'bo-monitoring-ia', label: 'Monitoring IA', icon: 'Bot' },
  { id: 'bo-events', label: 'Journal d\'événements', icon: 'Radio' },
  { id: 'bo-cron', label: 'Planificateur de tâches', icon: 'Clock' },
  { id: 'bo-device-sessions', label: 'Sessions appareil', icon: 'Smartphone' },
  { id: 'bo-sync-conflicts', label: 'Conflits de synchro', icon: 'CloudOff' },
]

export function hasSidebarItemAccess(role: BoRole, item: SidebarItem): boolean {
  if (item.id === 'bo-administration') {
    return ADMINISTRATION_ITEMS.some((adminItem) => hasModuleAccess(role, adminItem.id.replace('bo-', '') as ModuleName))
  }
  return hasModuleAccess(role, item.id.replace('bo-', '') as ModuleName)
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    items: [
      { id: 'bo-dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
      { id: 'bo-supervision', label: 'Supervision', icon: 'Eye' },
      { id: 'bo-rapports', label: 'Rapports', icon: 'BarChart3' },
      { id: 'bo-analytics', label: 'Analytics Produit', icon: 'TrendingUp' },
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    items: [
      { id: 'bo-acteurs', label: 'Acteurs', icon: 'Users' },
      { id: 'bo-enrolement', label: 'Enrôlement', icon: 'FileCheck' },
      { id: 'bo-producteurs', label: 'Producteurs', icon: 'Wheat' },
      { id: 'bo-zones', label: 'Zones & Territoires', icon: 'Map' },
      { id: 'bo-missions', label: 'Missions', icon: 'Target' },
      { id: 'bo-mutations', label: 'Mutations', icon: 'ArrowLeftRight' },
      { id: 'bo-moderation', label: 'Modération', icon: 'AlertTriangle' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & Paiements',
    items: [
      { id: 'bo-keiwa', label: 'Keiwa', icon: 'Wallet' },
      { id: 'bo-tontines', label: 'Tontines', icon: 'PiggyBank' },
      { id: 'bo-scores', label: 'Score Financier', icon: 'CreditCard' },
      { id: 'bo-marketplace', label: 'Marketplace', icon: 'ShoppingCart' },
      { id: 'bo-livraison', label: 'Livraison', icon: 'Truck' },
    ],
  },
  {
    id: 'contenus-com',
    label: 'Contenus & Communication',
    items: [
      { id: 'bo-contenus', label: 'Contenus', icon: 'BookOpen' },
      { id: 'bo-academie', label: 'Académie', icon: 'GraduationCap' },
      { id: 'bo-communication', label: 'Communication', icon: 'MessageSquare' },
      { id: 'bo-notifications', label: 'Notifications', icon: 'Megaphone' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [{ id: 'bo-administration', label: 'Administration', icon: 'Settings' }],
  },
]

export const SIDEBAR_ITEMS: SidebarItem[] = SIDEBAR_GROUPS.flatMap((g) => g.items)
