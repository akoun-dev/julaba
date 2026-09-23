// MODE-990 (DET-001 tranche 4) — bloc déplacé VERBATIM de
// src/lib/stores/backoffice-store.ts (preuve octet-pour-octet via le
// script de chirurgie persisté) ; comportement inchangé.
// Libellés/couleurs de statut et structure de la barre latérale BO.
import { Store, Wheat, Handshake, type LucideIcon } from 'lucide-react'
import { type BoRole, type ModuleName, hasModuleAccess } from '@/lib/backoffice-permissions'
import type { BoScreenRoute } from './bo-models'

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
      { id: 'bo-objectifs', label: 'Objectifs', icon: 'Flag' },
      { id: 'bo-alertes', label: 'Alertes & seuils', icon: 'BellRing' },
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    items: [
      { id: 'bo-acteurs', label: 'Acteurs', icon: 'Users' },
      { id: 'bo-carte-acteurs', label: 'Carte des acteurs', icon: 'MapPinned' },
      { id: 'bo-enrolement', label: 'Enrôlement', icon: 'FileCheck' },
      { id: 'bo-demandes-info', label: 'Demandes d’information', icon: 'MessageCircleQuestion' },
      { id: 'bo-producteurs', label: 'Producteurs', icon: 'Wheat' },
      { id: 'bo-cooperatives', label: 'Coopératives', icon: 'Landmark' },
      { id: 'bo-zones', label: 'Zones & Territoires', icon: 'Map' },
      { id: 'bo-missions', label: 'Missions', icon: 'Target' },
      { id: 'bo-identificateurs', label: 'Identificateurs', icon: 'IdCard' },
      { id: 'bo-mutations', label: 'Mutations', icon: 'ArrowLeftRight' },
      { id: 'bo-moderation', label: 'Modération', icon: 'AlertTriangle' },
      { id: 'bo-loyalty', label: 'Avantages fidélité', icon: 'Gift' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & Paiements',
    items: [
      { id: 'bo-keiwa', label: 'Keiwa', icon: 'Wallet' },
      { id: 'bo-tontines', label: 'Tontines', icon: 'PiggyBank' },
      { id: 'bo-ventes', label: 'Ventes marchands', icon: 'ShoppingBag' },
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
