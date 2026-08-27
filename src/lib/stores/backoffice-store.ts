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

// ============== RBAC PERMISSION MATRIX ==============

const MODULE_LIST = [
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

export function hasModuleAccess(role: BoRole, module: ModuleName): boolean {
  return MODULE_ACCESS[module]?.includes(role) ?? false
}

export function getAccessibleModules(role: BoRole): ModuleName[] {
  return MODULE_LIST.filter(m => MODULE_ACCESS[m].includes(role))
}

// ============== MOCK DATA ==============

const MOCK_BO_USERS: BoUser[] = [
  { id: 'bo-u-1', email: 'aminata@julaba.ci', name: 'Aminata KONÉ', role: 'super_admin', isActive: true, lastLogin: '2026-08-27T14:30:00Z', createdAt: '2025-01-15T08:00:00Z' },
  { id: 'bo-u-2', email: 'koffi@julaba.ci', name: 'Koffi YAO', role: 'admin_general', isActive: true, lastLogin: '2026-08-27T13:45:00Z', createdAt: '2025-02-10T09:00:00Z' },
  { id: 'bo-u-3', email: 'moussa@dge.ci', name: 'Moussa TRAORÉ', role: 'admin_national', zone: 'National', isActive: true, lastLogin: '2026-08-27T12:00:00Z', createdAt: '2025-03-01T10:00:00Z' },
  { id: 'bo-u-4', email: 'fatou@julaba.ci', name: 'Fatou SORO', role: 'gestionnaire_zone', zone: 'Adjamé', isActive: true, lastLogin: '2026-08-27T11:30:00Z', createdAt: '2025-04-15T08:00:00Z' },
  { id: 'bo-u-5', email: 'jean@julaba.ci', name: 'Jean KOUADIO', role: 'operateur_terrain', zone: 'Adjamé', isActive: true, lastLogin: '2026-08-26T16:00:00Z', createdAt: '2025-06-01T08:00:00Z' },
  { id: 'bo-u-6', email: 'affi@julaba.ci', name: 'Affi COULIBALY', role: 'gestionnaire_zone', zone: 'Bouaké', isActive: true, lastLogin: '2026-08-27T09:00:00Z', createdAt: '2025-05-10T08:00:00Z' },
  { id: 'bo-u-7', email: 'yao@julaba.ci', name: 'Yao KONAN', role: 'operateur_terrain', zone: 'Kong', isActive: false, lastLogin: '2026-08-20T10:00:00Z', createdAt: '2025-07-01T08:00:00Z' },
]

const FIRST_NAMES = ['Awa', 'Ibrahim', 'Marie', 'Paul', 'Fatoumata', 'Kouadio', 'Aminata', 'Bamba', 'Soro', 'Diaby', 'Koné', 'Traoré', 'Ouattara', 'Konan', 'Coulibaly', 'Bakayoko', 'Diallo', 'Camara', 'Kone', 'Yao']
const LAST_NAMES = ['KOUASSI', 'DIABY', 'BAKAYOKO', 'BAMBA', 'SORO', 'KONÉ', 'TRAORÉ', 'OUATTARA', 'KONAN', 'COULIBALY', 'DIALLO', 'CAMARA']
const ZONES = ['Adjamé', 'Cocody', 'Plateau', 'Yopougon', 'Abobo', 'Bouaké', 'Kong', 'Yamoussoukro', 'Daloa', 'San-Pédro', 'Korhogo', 'Man']
const IDENTIFICATEURS = ['Kouadio Jean', 'Bamba Fatou', 'Diaby Ibrahim', 'Soro Marie', 'Bamba Paul', 'Traoré Moussa', 'Koné Aminata', 'Ouattara Yao']

function randomPhone() {
  const prefixes = ['07', '05', '01']
  return `+225 ${prefixes[Math.floor(Math.random() * prefixes.length)]} ${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`
}

function generateMockActors(count: number): BoActor[] {
  const actors: BoActor[] = []
  const types: BoActor['type'][] = ['marchand', 'producteur', 'cooperatif']
  const statuses: BoActor['status'][] = ['actif', 'actif', 'actif', 'actif', 'suspendu', 'en_attente']
  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(Math.random() * types.length)
    const typePrefix = types[typeIdx] === 'marchand' ? 'M' : types[typeIdx] === 'producteur' ? 'P' : 'C'
    actors.push({
      id: `actor-${i + 1}`,
      actorId: `#${typePrefix}-${String(845 + i).padStart(4, '0')}`,
      firstName: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
      lastName: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
      type: types[typeIdx],
      phone: randomPhone(),
      zone: ZONES[Math.floor(Math.random() * ZONES.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      identificateurName: IDENTIFICATEURS[Math.floor(Math.random() * IDENTIFICATEURS.length)],
      validatedBy: MOCK_BO_USERS[Math.floor(Math.random() * MOCK_BO_USERS.length)].name,
      validatedAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - Math.random() * 90 * 86400000).toISOString(),
      gpsLat: 5.3 + Math.random() * 1.5,
      gpsLng: -4 + Math.random() * 2,
      hasPhoto: true,
    } as BoActor)
  }
  return actors
}

const MOCK_ACTORS = generateMockActors(50)

function generateMockEnrolments(count: number): BoEnrolment[] {
  const enrolments: BoEnrolment[] = []
  const statuses: BoEnrolment['status'][] = ['en_attente', 'en_attente', 'en_attente', 'valide', 'valide', 'rejete', 'info_demandee']
  const types: BoEnrolment['actorType'][] = ['marchand', 'producteur', 'cooperatif']
  for (let i = 0; i < count; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    enrolments.push({
      id: `enrol-${i + 1}`,
      dossierId: `#ID-2026-${String(1000 + i).padStart(4, '0')}`,
      actorName: `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`,
      actorType: types[Math.floor(Math.random() * types.length)],
      zone: ZONES[Math.floor(Math.random() * ZONES.length)],
      identificateurName: IDENTIFICATEURS[Math.floor(Math.random() * IDENTIFICATEURS.length)],
      status,
      submittedAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      validatedBy: status !== 'en_attente' ? MOCK_BO_USERS[Math.floor(Math.random() * 3)].name : undefined,
      validatedAt: status !== 'en_attente' ? new Date(Date.now() - Math.random() * 5 * 86400000).toISOString() : undefined,
      rejectReason: status === 'rejete' ? 'Photo illisible' : undefined,
      hasPhoto: Math.random() > 0.1,
      hasGps: Math.random() > 0.05,
      phone: randomPhone(),
    })
  }
  return enrolments
}

const MOCK_ENROLMENTS = generateMockEnrolments(30)

const MOCK_ZONES: BoZone[] = ZONES.map((name, i) => ({
  id: `zone-${i + 1}`,
  name,
  region: i < 6 ? 'Abidjan' : i < 8 ? 'Centre' : i < 10 ? 'Ouest' : 'Nord',
  identificateurCount: Math.floor(Math.random() * 15) + 2,
  actorCount: Math.floor(Math.random() * 2000) + 100,
  isActive: true,
  target: 1500,
}))

const MOCK_MISSIONS: BoMission[] = [
  { id: 'm-1', title: 'Enrôlement Adjamé Q3', description: 'Objectif : 500 marchands dans la zone Adjamé', zone: 'Adjamé', assigneeName: 'Kouadio Jean', status: 'en_cours', targetCount: 500, currentCount: 345, startDate: '2026-07-01', endDate: '2026-09-30' },
  { id: 'm-2', title: 'Couverture Bouaké', description: 'Enrôlement complet de la zone Bouaké', zone: 'Bouaké', assigneeName: 'Bamba Fatou', status: 'en_cours', targetCount: 300, currentCount: 198, startDate: '2026-08-01', endDate: '2026-10-31' },
  { id: 'm-3', title: 'Producteurs Kong', description: 'Identification des producteurs agricoles', zone: 'Kong', assigneeName: 'Diaby Ibrahim', status: 'en_cours', targetCount: 200, currentCount: 167, startDate: '2026-06-15', endDate: '2026-08-31' },
  { id: 'm-4', title: 'Expansion San-Pédro', description: 'Ouverture de la zone San-Pédro', zone: 'San-Pédro', status: 'suspendue', targetCount: 150, currentCount: 42, startDate: '2026-08-01', endDate: '2026-11-30' },
  { id: 'm-5', title: 'Audit Yamoussoukro', description: 'Vérification et mise à jour des données', zone: 'Yamoussoukro', assigneeName: 'Soro Marie', status: 'terminee', targetCount: 100, currentCount: 100, startDate: '2026-05-01', endDate: '2026-07-31' },
]

const MOCK_AUDIT: AuditEntry[] = [
  { id: 'a-1', userName: 'Aminata KONÉ', userEmail: 'aminata@julaba.ci', action: 'VALIDATE', module: 'Enrôlement', details: '{"dossier_id":"ID-2026-0845","actor":"Awa KOUASSI"}', ipAddress: '41.66.XXX.XXX', userAgent: 'Chrome 120 / Windows 11', timestamp: '2026-08-27T14:32:15Z' },
  { id: 'a-2', userName: 'Koffi YAO', userEmail: 'koffi@julaba.ci', action: 'SUSPEND', module: 'Acteurs', details: '{"actor_id":"M-0847","reason":"Signalement fraude"}', ipAddress: '41.66.XXX.XXX', userAgent: 'Chrome 120 / Windows 11', timestamp: '2026-08-27T14:31:02Z' },
  { id: 'a-3', userName: 'Fatou SORO', userEmail: 'fatou@julaba.ci', action: 'CREATE_ZONE', module: 'Zones', details: '{"zone":"Adjamé Nord"}', ipAddress: '102.15.XXX.XXX', userAgent: 'Firefox 115 / macOS', timestamp: '2026-08-27T14:29:45Z' },
  { id: 'a-4', userName: 'Jean KOUADIO', userEmail: 'jean@julaba.ci', action: 'REJECT', module: 'Enrôlement', details: '{"dossier_id":"ID-2026-0844","reason":"Photo illisible"}', ipAddress: '102.15.XXX.XXX', userAgent: 'Chrome Mobile / Android', timestamp: '2026-08-27T14:28:12Z' },
  { id: 'a-5', userName: 'Aminata KONÉ', userEmail: 'aminata@julaba.ci', action: 'LOGIN', module: 'Auth', timestamp: '2026-08-27T14:25:33Z' },
  { id: 'a-6', userName: 'Koffi YAO', userEmail: 'koffi@julaba.ci', action: 'CREATE_USER', module: 'Utilisateurs', details: '{"user":"jean@julaba.ci","role":"operateur_terrain"}', timestamp: '2026-08-27T13:00:00Z' },
  { id: 'a-7', userName: 'Moussa TRAORÉ', userEmail: 'moussa@dge.ci', action: 'EXPORT', module: 'Rapports', details: '{"format":"pdf","period":"mensuel"}', timestamp: '2026-08-27T12:30:00Z' },
  { id: 'a-8', userName: 'Fatou SORO', userEmail: 'fatou@julaba.ci', action: 'ASSIGN_MISSION', module: 'Missions', details: '{"mission":"Enrôlement Adjamé Q3","assignee":"Kouadio Jean"}', timestamp: '2026-08-27T11:00:00Z' },
  { id: 'a-9', userName: 'Jean KOUADIO', userEmail: 'jean@julaba.ci', action: 'FREEZE', module: 'Supervision', details: '{"actor_id":"M-0900","reason":"Activité suspecte"}', timestamp: '2026-08-27T10:45:00Z' },
  { id: 'a-10', userName: 'Aminata KONÉ', userEmail: 'aminata@julaba.ci', action: 'UPDATE_ROLE', module: 'Utilisateurs', details: '{"user":"fatou@julaba.ci","old_role":"operateur","new_role":"gestionnaire_zone"}', timestamp: '2026-08-26T16:00:00Z' },
  { id: 'a-11', userName: 'Koffi YAO', userEmail: 'koffi@julaba.ci', action: 'VALIDATE', module: 'Enrôlement', details: '{"dossier_id":"ID-2026-0840"}', timestamp: '2026-08-26T15:30:00Z' },
  { id: 'a-12', userName: 'Moussa TRAORÉ', userEmail: 'moussa@dge.ci', action: 'LOGIN', module: 'Auth', timestamp: '2026-08-26T14:00:00Z' },
  { id: 'a-13', userName: 'Aminata KONÉ', userEmail: 'aminata@julaba.ci', action: 'DELETE_ACTOR', module: 'Acteurs', details: '{"actor_id":"M-0801","reason":"Doublon"}', timestamp: '2026-08-26T13:00:00Z' },
  { id: 'a-14', userName: 'Fatou SORO', userEmail: 'fatou@julaba.ci', action: 'CREATE_MISSION', module: 'Missions', details: '{"mission":"Audit Yamoussoukro"}', timestamp: '2026-08-26T10:00:00Z' },
  { id: 'a-15', userName: 'Jean KOUADIO', userEmail: 'jean@julaba.ci', action: 'MODERATE', module: 'Modération', details: '{"report_id":"R-123","action":"warning"}', timestamp: '2026-08-26T09:30:00Z' },
]

const MOCK_ALERTS: BoAlert[] = [
  { id: 'al-1', severity: 'critique', title: 'Tentative de connexion multiple', message: '5 tentatives échouées pour le compte koffi@julaba.ci en 2 minutes', module: 'Auth', timestamp: '2026-08-27T14:35:00Z', acknowledged: false },
  { id: 'al-2', severity: 'haute', title: 'Pic de rejets', message: 'Taux de rejet supérieur à 15% dans la zone Kong aujourd\'hui', module: 'Enrôlement', timestamp: '2026-08-27T14:20:00Z', acknowledged: false },
  { id: 'al-3', severity: 'moyenne', title: 'Latence SMS élevée', message: 'Le service SMS affiche une latence de 4.2s (seuil : 2s)', module: 'Système', timestamp: '2026-08-27T13:45:00Z', acknowledged: true },
  { id: 'al-4', severity: 'basse', title: 'Stockage à 72%', message: 'L\'espace de stockage des photos atteint 72% de capacité', module: 'Système', timestamp: '2026-08-27T12:00:00Z', acknowledged: true },
  { id: 'al-5', severity: 'haute', title: 'Zone inactive détectée', message: 'Aucune activité dans la zone Man depuis 48h', module: 'Supervision', timestamp: '2026-08-27T11:00:00Z', acknowledged: false },
]

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

  // Data
  users: BoUser[]
  actors: BoActor[]
  enrolments: BoEnrolment[]
  zones: BoZone[]
  missions: BoMission[]
  auditLog: AuditEntry[]
  alerts: BoAlert[]
  ticker: TickerData

  // Actions
  updateActorStatus: (actorId: string, status: BoActor['status']) => void
  validateEnrolment: (enrolmentId: string, userId: string) => void
  rejectEnrolment: (enrolmentId: string, reason: string, userId: string) => void
  acknowledgeAlert: (alertId: string) => void
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  updateUser: (userId: string, updates: Partial<BoUser>) => void
  createUser: (user: Omit<BoUser, 'id' | 'createdAt'>) => void

  // Theme
  boTheme: 'light' | 'dark'
  toggleBoTheme: () => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void
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

      // Data
      users: MOCK_BO_USERS,
      actors: MOCK_ACTORS,
      enrolments: MOCK_ENROLMENTS,
      zones: MOCK_ZONES,
      missions: MOCK_MISSIONS,
      auditLog: MOCK_AUDIT,
      alerts: MOCK_ALERTS,
      ticker: {
        transactionsPerMin: 89,
        enrolmentsPerHour: 12,
        uptime: 99.98,
        activeUsers: 1245,
      },

      // Actions
      updateActorStatus: (actorId, status) =>
        set((s) => ({
          actors: s.actors.map((a) => (a.id === actorId ? { ...a, status } : a)),
        })),

      validateEnrolment: (enrolmentId, userId) =>
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'valide' as const, validatedBy: userId, validatedAt: new Date().toISOString() }
              : e
          ),
        })),

      rejectEnrolment: (enrolmentId, reason, userId) =>
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'rejete' as const, validatedBy: userId, validatedAt: new Date().toISOString(), rejectReason: reason }
              : e
          ),
        })),

      acknowledgeAlert: (alertId) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)),
        })),

      addAuditEntry: (entry) =>
        set((s) => ({
          auditLog: [
            { ...entry, id: `a-${Date.now()}`, timestamp: new Date().toISOString() },
            ...s.auditLog,
          ],
        })),

      updateUser: (userId, updates) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...updates } : u)),
        })),

      createUser: (user) =>
        set((s) => ({
          users: [...s.users, { ...user, id: `bo-u-${Date.now()}`, createdAt: new Date().toISOString() }],
        })),

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
