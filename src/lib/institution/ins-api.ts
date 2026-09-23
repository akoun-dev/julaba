// Helpers fetch typés de l'univers institution (INS-*).
//
// Contrat ROUTE/MODULE (AUDIT_MATRICE_47_CAS I-01) — chaque route consommée
// est gardée par requireBackofficePermission(request, <module>, 'read') et
// le module figure dans la liste de LECTURE du rôle 'institution'
// (src/lib/backoffice-permissions.ts) :
//   - Tableau de bord  → GET /api/backoffice        (module 'dashboard')
//   - Acteurs          → GET /api/backoffice/actors (module 'acteurs')
//   - Supervision      → GET /api/backoffice/alerts (garde 'dashboard')
//   - Audit            → GET /api/backoffice/audit  (module 'audit')
// NB : /api/backoffice/analytics (module 'analytics') n'autorise PAS le rôle
// institution — le tableau de bord institution consomme donc la route
// dashboard racine, qui renvoie les agrégats nationaux réels.

export class InsApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'InsApiError'
    this.status = status
  }
}

async function insApiGet<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new InsApiError(0, 'Pas de connexion. Vérifiez votre réseau.')
  }
  if (!res.ok) {
    let message = 'Une erreur est survenue. Réessayez.'
    if (res.status === 403) message = 'Lecture non autorisée pour votre rôle.'
    if (res.status === 401) message = 'Session expirée. Reconnectez-vous.'
    try {
      const data = (await res.json()) as { erreur?: string }
      if (data?.erreur) message = data.erreur
    } catch {
      // corps non-JSON : garder le message par défaut
    }
    throw new InsApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

// ============== TABLEAU DE BORD (GET /api/backoffice) ==============

export interface InsDashboardData {
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

export async function getInsDashboard(): Promise<InsDashboardData> {
  return insApiGet<InsDashboardData>('/api/backoffice')
}

// ============== ACTEURS (GET /api/backoffice/actors) ==============

interface RawActor {
  id: string
  actor_id: string
  first_name: string
  last_name: string | null
  type: string
  phone: string
  zone: string
  status: string
  identificateur_name: string | null
  created_at: string
}

interface RawActorPage {
  actors: RawActor[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface InsActor {
  id: string
  actorId: string
  firstName: string
  lastName: string | null
  type: string
  phone: string
  zone: string
  status: string
  identificateurName: string | null
  createdAt: string
}

export interface InsActorFilters {
  search?: string
  status?: string
  type?: string
  page?: number
}

export interface InsActorPage {
  actors: InsActor[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function getInsActors(filters: InsActorFilters): Promise<InsActorPage> {
  const qs = new URLSearchParams()
  if (filters.search) qs.set('search', filters.search)
  if (filters.status) qs.set('status', filters.status)
  if (filters.type) qs.set('type', filters.type)
  qs.set('page', String(filters.page ?? 1))
  qs.set('limit', '20')

  const raw = await insApiGet<RawActorPage>(`/api/backoffice/actors?${qs.toString()}`)
  return {
    ...raw,
    actors: (raw.actors || []).map((a) => ({
      id: a.id,
      actorId: a.actor_id,
      firstName: a.first_name,
      lastName: a.last_name,
      type: a.type,
      phone: a.phone,
      zone: a.zone,
      status: a.status,
      identificateurName: a.identificateur_name,
      createdAt: a.created_at,
    })),
  }
}

// ============== SUPERVISION / ALERTES (GET /api/backoffice/alerts) ==============

interface RawAlert {
  id: string
  severity: string
  title: string
  message: string
  module: string
  acknowledged: boolean
  created_at: string
}

export interface InsAlert {
  id: string
  severity: string
  title: string
  message: string
  module: string
  acknowledged: boolean
  createdAt: string
}

export async function getInsAlerts(): Promise<InsAlert[]> {
  const raw = await insApiGet<RawAlert[]>('/api/backoffice/alerts')
  return (Array.isArray(raw) ? raw : []).map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    message: a.message,
    module: a.module,
    acknowledged: a.acknowledged,
    createdAt: a.created_at,
  }))
}

// ============== AUDIT (GET /api/backoffice/audit) ==============

interface RawAuditLog {
  id: string
  user_name: string
  user_email: string
  action: string
  module: string
  details: string | null
  created_at: string
}

interface RawAuditPage {
  logs: RawAuditLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface InsAuditEntry {
  id: string
  userName: string
  userEmail: string
  action: string
  module: string
  details: string | null
  createdAt: string
}

export interface InsAuditFilters {
  module?: string
  page?: number
}

export interface InsAuditPage {
  logs: InsAuditEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function getInsAudit(filters: InsAuditFilters): Promise<InsAuditPage> {
  const qs = new URLSearchParams()
  if (filters.module) qs.set('module', filters.module)
  qs.set('page', String(filters.page ?? 1))
  qs.set('limit', '25')

  const raw = await insApiGet<RawAuditPage>(`/api/backoffice/audit?${qs.toString()}`)
  return {
    ...raw,
    logs: (raw.logs || []).map((l) => ({
      id: l.id,
      userName: l.user_name,
      userEmail: l.user_email,
      action: l.action,
      module: l.module,
      details: l.details,
      createdAt: l.created_at,
    })),
  }
}

// ============== FORMATAGE / LIBELLÉS ==============

export function formatInsDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatInsDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d)
}

export function formatInsCount(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('fr-FR')
}

export const INS_STATUS_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  en_attente: 'En attente',
  rejete: 'Rejeté',
}

export const INS_STATUS_BADGE: Record<string, string> = {
  actif: 'bg-emerald-100 text-emerald-800',
  suspendu: 'bg-red-100 text-red-800',
  en_attente: 'bg-amber-100 text-amber-800',
  rejete: 'bg-gray-100 text-gray-800',
}

export const INS_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand(e)',
  producteur: 'Producteur(rice)',
  cooperatif: 'Coopérative',
}

export const INS_SEVERITY_BADGE: Record<string, string> = {
  critique: 'bg-red-100 text-red-800',
  haute: 'bg-orange-100 text-orange-800',
  moyenne: 'bg-amber-100 text-amber-800',
  basse: 'bg-blue-100 text-blue-800',
  faible: 'bg-slate-100 text-slate-700',
}

const INS_ACTION_LABELS: Record<string, string> = {
  login_success: 'Connexion réussie',
  login_failed: 'Échec de connexion',
  login_locked: 'Connexion bloquée',
  logout: 'Déconnexion',
  actor_status_update: 'Statut acteur modifié',
  actor_categorie_update: 'Classification marchand',
  alert_acknowledge: 'Alerte acquittée',
  enrolement_valide: 'Dossier validé',
  enrolement_rejete: 'Dossier rejeté',
  enrolement_info_demandee: 'Info demandée',
  mission_created: 'Mission créée',
  mission_updated: 'Mission modifiée',
  user_created: 'Compte créé',
  user_updated: 'Compte modifié',
}

export function insActionLabel(action: string): string {
  if (INS_ACTION_LABELS[action]) return INS_ACTION_LABELS[action]
  return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

export function insModuleLabel(module: string): string {
  if (!module) return '—'
  const known: Record<string, string> = {
    enrolement: 'Enrôlement',
    'enrôlement': 'Enrôlement',
    authentification: 'Identification',
    parametres: 'Paramètres',
    rapport: 'Rapports',
    paiement: 'Keiwa Wallet',
  }
  return known[module] || module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}