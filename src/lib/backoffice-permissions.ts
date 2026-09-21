// Shared Backoffice RBAC definitions — the single source of truth for which
// role can access which module. Imported both by the client store (to drive
// the sidebar/UI) and by the server-side API guard (src/lib/backoffice-auth),
// so the two can never drift apart.

export type BoRole = 'super_admin' | 'admin_general' | 'admin_national' | 'gestionnaire_zone' | 'operateur_terrain'

export const MODULE_LIST = [
  'dashboard', 'acteurs', 'carte-acteurs', 'enrolement', 'zones', 'missions',
  'identificateurs', 'objectifs', 'alertes',
  'supervision', 'utilisateurs', 'rapports', 'audit', 'institutions',
  'moderation', 'mutations', 'contenus', 'monitoring-ia', 'events',
  'analytics', 'scores', 'api-keys', 'marketplace', 'livraison',
  'communication', 'cron', 'config-institution', 'keiwa', 'producteurs',
  'tontines', 'ventes', 'device-sessions', 'sync-conflicts', 'notifications', 'academie'
] as const

export type ModuleName = typeof MODULE_LIST[number]

export const ROLE_HIERARCHY: Record<BoRole, number> = {
  super_admin: 5,
  admin_general: 4,
  admin_national: 3,
  gestionnaire_zone: 2,
  operateur_terrain: 1,
}

export const MODULE_ACCESS: Record<ModuleName, BoRole[]> = {
  'dashboard': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'acteurs': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'carte-acteurs': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'enrolement': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'zones': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  'missions': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  // Le roster des identificateurs est géré exactement comme les missions :
  // création par le back-office uniquement (nom, prénom, téléphone, email,
  // code agent unique), accessibilité identique aux gestionnaires de zone.
  'identificateurs': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  // Objectifs mensuels : pilotés depuis le BO (source de la mission
  // mensuelle mobile), mêmes rôles que missions ; alertes & seuils :
  // lecture ouverte jusqu'aux opérateurs terrain (ils vivent les alertes
  // du terrain), écriture des seuils refusée à operateur_terrain via
  // FIELD_WRITABLE_MODULES.
  'objectifs': ['super_admin', 'admin_general', 'gestionnaire_zone'],
  'alertes': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
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
  // Ventes marchands : lecture du détail des ventes de la journée — utile
  // aux gestionnaires de zone comme aux niveaux nationaux, pas aux
  // opérateurs terrain (données financières des marchands).
  'ventes': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone'],
  'producteurs': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
  'tontines': ['super_admin', 'admin_general', 'admin_national'],
  // Device claims / sync-conflict reports are security-sensitive (device
  // revocation can unlock an account) — restricted to the two top roles,
  // unlike most other modules which also open up to zone-scoped staff.
  'device-sessions': ['super_admin', 'admin_general'],
  'sync-conflicts': ['super_admin', 'admin_general'],
  'notifications': ['super_admin', 'admin_national'],
  'academie': ['super_admin', 'admin_general'],
}

export const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: 'Dashboard',
  acteurs: 'Acteurs',
  'carte-acteurs': 'Carte des acteurs',
  enrolement: 'Enrôlement',
  zones: 'Zones',
  missions: 'Missions',
  identificateurs: 'Identificateurs',
  objectifs: 'Objectifs',
  alertes: 'Alertes & seuils',
  supervision: 'Supervision',
  utilisateurs: 'Utilisateurs',
  rapports: 'Rapports',
  audit: 'Audit',
  institutions: 'Institutions',
  moderation: 'Modération',
  mutations: 'Mutations',
  contenus: 'Contenus',
  'monitoring-ia': 'Monitoring IA',
  events: 'Journal d\'événements',
  analytics: 'Analytics',
  scores: 'Score Financier',
  'api-keys': 'Clés API',
  marketplace: 'Marketplace',
  livraison: 'Livraison',
  communication: 'Communication',
  cron: 'Planificateur de tâches',
  'config-institution': 'Config Institution',
  keiwa: 'Keiwa',
  ventes: 'Ventes marchands',
  producteurs: 'Producteurs',
  tontines: 'Tontines',
  'device-sessions': 'Sessions appareil',
  'sync-conflicts': 'Conflits de synchronisation',
  notifications: 'Notifications',
  academie: 'Académie',
}

export function hasModuleAccess(role: BoRole, module: ModuleName): boolean {
  return MODULE_ACCESS[module]?.includes(role) ?? false
}

export type BoAction = 'read' | 'create' | 'update' | 'delete'

// Modules where a route handler applies a real per-record zone boundary
// (see canAccessZone in src/lib/backoffice-auth/permission.ts, used by
// /api/backoffice/actors and /api/backoffice/enrolments) — the only two
// where operateur_terrain's write access was actually designed for and is
// bounded to their own zone's records. Every other module that lists
// operateur_terrain in MODULE_ACCESS only ever meant them to have read
// visibility there; nothing enforces a zone boundary on writes anywhere
// else, so granting write there would let a field role mutate any zone's
// data — the exact gap this function exists to close.
const FIELD_WRITABLE_MODULES: ModuleName[] = ['acteurs', 'enrolement', 'alertes']

/**
 * Server-side authority for "may `role` perform `action` on `module`" —
 * module-level access (hasModuleAccess) only ever meant "may see this
 * screen"; it was previously reused, unchanged, as the sole check for
 * mutating requests too, which let any role with read/visibility access to
 * a module also call its create/update/delete routes.
 */
export function canPerformAction(role: BoRole, module: ModuleName, action: BoAction): boolean {
  if (!hasModuleAccess(role, module)) return false
  if (action === 'read') return true
  if (role === 'operateur_terrain') return FIELD_WRITABLE_MODULES.includes(module)
  return true
}

export function getAccessibleModules(role: BoRole): ModuleName[] {
  return MODULE_LIST.filter((m) => MODULE_ACCESS[m].includes(role))
}
