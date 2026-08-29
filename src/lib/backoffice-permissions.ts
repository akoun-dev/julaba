// Shared Backoffice RBAC definitions — the single source of truth for which
// role can access which module. Imported both by the client store (to drive
// the sidebar/UI) and by the server-side API guard (src/lib/backoffice-auth),
// so the two can never drift apart.

export type BoRole = 'super_admin' | 'admin_general' | 'admin_national' | 'gestionnaire_zone' | 'operateur_terrain'

export const MODULE_LIST = [
  'dashboard', 'acteurs', 'enrolement', 'zones', 'missions',
  'supervision', 'utilisateurs', 'rapports', 'audit', 'institutions',
  'moderation', 'mutations', 'contenus', 'monitoring-ia', 'events',
  'analytics', 'scores', 'api-keys', 'marketplace', 'livraison',
  'communication', 'cron', 'config-institution', 'keiwa', 'producteurs'
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
  'producteurs': ['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone', 'operateur_terrain'],
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
  producteurs: 'Producteurs',
}

export function hasModuleAccess(role: BoRole, module: ModuleName): boolean {
  return MODULE_ACCESS[module]?.includes(role) ?? false
}

export function getAccessibleModules(role: BoRole): ModuleName[] {
  return MODULE_LIST.filter((m) => MODULE_ACCESS[m].includes(role))
}
