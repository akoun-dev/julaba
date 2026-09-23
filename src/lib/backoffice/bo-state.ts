// MODE-990 (DET-001 tranche 4) — le contrat complet du store back-office.
// L'interface monolithique est découpée en 5 sous-interfaces (une par
// slice) dont les CHAMPS restent verbatim ; BackofficeState les étend —
// le type public du store est inchangé.
import { type BoRole } from '@/lib/backoffice-permissions'
import type {
  BoUser, BoActor, BoEnrolment, BoZone, BoMission, BoTeam, BoIdentificateur,
  BoObjectif, BoAlertRule, AuditEntry, BoAlert, TickerData, DashboardData,
  BoErrorDomain, BoScreenRoute,
} from './bo-models'

export interface BoUiState {
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

export interface BoDataState {
  // Data
  users: BoUser[]
  actors: BoActor[]
  enrolments: BoEnrolment[]
  zones: BoZone[]
  missions: BoMission[]
  teams: BoTeam[]
  identificateurs: BoIdentificateur[]
  auditLog: AuditEntry[]
  alerts: BoAlert[]
  objectifs: BoObjectif[]
  /** Période actuellement chargée (mois/year 0-11) — pilote l'affichage. */
  objectifsPeriode: { month: number; year: number } | null
  /** Vrai quand la base hébergée n'a pas encore la migration objectifs. */
  objectifsMigrationPending: boolean
  alertRules: BoAlertRule[]
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
}

export interface BoObjectifsState {
  fetchObjectifs: (month?: number, year?: number) => Promise<void>
  fetchAlertRules: () => Promise<void>
  upsertObjectif: (payload: {
    scope: BoObjectif['scope']; cibleId: string; cibleLabel: string
    month: number; year: number; target: number
  }) => Promise<BoObjectif | null>
  deleteObjectif: (id: string) => Promise<boolean>
  saveAlertRules: (rules: { ruleType: BoAlertRule['ruleType']; threshold: number; enabled: boolean }[]) => Promise<boolean>
  evaluateAlerts: () => Promise<{ generated: number; skipped: string[] } | null>
}

export interface BoIdentState {
  fetchTeams: () => Promise<void>
  fetchIdentificateurs: () => Promise<void>
  createIdentificateur: (
    agent: { firstName: string; lastName: string; phone: string; email?: string; zone?: string; teamId?: string }
  ) => Promise<BoIdentificateur | null>
  updateIdentificateur: (
    id: string,
    updates: { isActive?: boolean; zone?: string | null; email?: string | null; teamId?: string | null }
  ) => Promise<boolean>
  // MODE-937 — émet (ou régénère) un code de liaison one-shot 30 j pour un
  // agent ; renvoie null en cas d'échec (l'erreur est posée sur le domaine).
  issueIdentificateurLiaisonCode: (id: string) => Promise<string | null>
}

export interface BoMutationsState {
  // Mutation actions
  createZone: (zone: Omit<BoZone, 'id' | 'identificateurCount' | 'actorCount'>) => Promise<BoZone | null>
  createMission: (
    mission: Omit<BoMission, 'id' | 'currentCount' | 'status' | 'assignees' | 'teamName'> & {
      identificateurIds: string[]
    }
  ) => Promise<BoMission | null>
  updateMissionStatus: (missionId: string, status: BoMission['status']) => Promise<void>
  createTeam: (team: { name: string; zone?: string; description?: string }) => Promise<BoTeam | null>
  updateActorStatus: (actorId: string, status: BoActor['status']) => Promise<void>
  updateActorCategorie: (actorId: string, categorie: string | null) => Promise<void>
  validateEnrolment: (enrolmentId: string, userId: string) => Promise<void>
  rejectEnrolment: (enrolmentId: string, reason: string, userId: string) => Promise<void>
  requestInfoEnrolment: (enrolmentId: string, userId: string, reason?: string) => Promise<void>
  acknowledgeAlert: (alertId: string) => Promise<void>
  updateUser: (userId: string, updates: Partial<BoUser>) => Promise<void>
  createUser: (user: Omit<BoUser, 'id' | 'createdAt'>) => Promise<{ tempPassword: string } | null>
}

export interface BackofficeState extends BoUiState, BoDataState, BoObjectifsState, BoIdentState, BoMutationsState {}
