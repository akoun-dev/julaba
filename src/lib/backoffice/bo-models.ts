// MODE-990 (DET-001 tranche 4) — types du back-office extraits VERBATIM
// de src/lib/stores/backoffice-store.ts (preuve octet-pour-octet) ;
// le store les ré-exporte — les 45 consommateurs restent inchangés.
import { type BoRole } from '@/lib/backoffice-permissions'

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
  /** Classification marchand (détaillant / semi-grossiste / grossiste). */
  categorieMarchand?: string | null
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
  /** Classification marchand collectée au wizard (détaillant / semi-grossiste /
   * grossiste). NULL pour les dossiers antérieurs à la classification. */
  categorieMarchand?: string | null
  activite?: string | null
  zone: string
  identificateurName: string
  status: 'en_attente' | 'valide' | 'rejete' | 'info_demandee'
  submittedAt: string
  validatedBy?: string
  validatedAt?: string
  rejectReason?: string
  /** Message adressé à l'identificateur quand le statut est info_demandee. */
  infoRequestReason?: string
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

export interface BoMissionAssignee {
  id: string
  name: string
}

export interface BoMission {
  id: string
  title: string
  description: string
  zone: string
  status: 'en_cours' | 'terminee' | 'suspendue'
  targetCount: number
  currentCount: number
  startDate: string
  endDate?: string
  teamId?: string
  teamName?: string
  assignees: BoMissionAssignee[]
}

export interface BoTeam {
  id: string
  name: string
  zone?: string
  description?: string
  memberCount: number
  createdAt: string
}

export interface BoIdentificateur {
  id: string
  name: string
  firstName?: string
  lastName?: string
  /** Code agent unique (JID-0001) attribué à la création par le back-office. */
  agentCode?: string
  phone?: string
  email?: string
  zone?: string
  teamId?: string
  isActive: boolean
  createdAt: string
}

/** Objectif mensuel de dossiers, défini depuis le BO (identificateur ou zone). */
export interface BoObjectif {
  id: string
  scope: 'identificateur' | 'zone'
  cibleId: string
  cibleLabel: string
  month: number
  year: number
  target: number
  /** Dossiers soumis pendant le mois par la cible — calculé côté API. */
  current: number
  createdAt: string
  updatedAt: string
}

/** Seuil configurable du moteur d'alertes BO. */
export interface BoAlertRule {
  ruleType: 'dossiers_en_attente' | 'identificateur_inactif' | 'chute_ventes' | 'objectif_en_retard'
  unit: 'heures' | 'jours' | '%'
  threshold: number
  enabled: boolean
  updatedAt?: string
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

export type BoErrorDomain = 'users' | 'actors' | 'enrolments' | 'zones' | 'missions' | 'auditLog' | 'alerts' | 'dashboard' | 'objectifs' | 'alertRules'

export type BoScreenRoute =
  | 'bo-administration'
  | 'bo-dashboard'
  | 'bo-acteurs'
  | 'bo-carte-acteurs'
  | 'bo-enrolement'
  | 'bo-zones'
  | 'bo-missions'
  | 'bo-identificateurs'
  | 'bo-objectifs'
  | 'bo-alertes'
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
  | 'bo-ventes'
  | 'bo-device-sessions'
  | 'bo-sync-conflicts'
  | 'bo-notifications'
  | 'bo-academie'
  | 'bo-cooperatives'
  | 'bo-demandes-info'
  | 'bo-loyalty'
