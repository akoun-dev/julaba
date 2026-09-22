/**
 * MODE-974 (AUDIT-007 G1/G2) — Source UNIQUE de navigation de l'espace
 * coopérative, sur le modèle `SIDEBAR_GROUPS` du back-office
 * (backoffice-store.ts:1583-1643) : le drawer mobile, la sidebar de grand
 * écran (option C — hybride adaptatif) et tout futur hub consomment CE
 * module, jamais une liste recopiée.
 *
 * Icônes en string sérialisable + `CoopIconProxy` (même pattern que le BO :
 * `IconProxy` + `BO_ICON_MAP`, bo-icon-proxy.tsx:45-60).
 *
 * Le hub `coop-gestion` N'EST PAS ici : c'est un méta-écran de la barre
 * basse (5ᵉ onglet), comme le hub Administration du BO qui vit dans
 * `ADMINISTRATION_ITEMS` séparé de `SIDEBAR_GROUPS` — le drawer/sidebar
 * donnent un accès DIRECT à tous les écrans, le hub est redondant là.
 */

export interface CoopNavItem {
  /** ScreenRoute coopérative ('coop-*') — cf. app-store.ts. */
  id: string
  label: string
  /** Nom Lucide (sérialisable), résolu par CoopIconProxy. */
  icon: string
  description: string
}

export interface CoopNavGroup {
  id: string
  label: string
  items: CoopNavItem[]
}

export const COOP_NAV_GROUPS: CoopNavGroup[] = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    items: [
      {
        id: 'coop-home',
        label: 'Accueil',
        icon: 'LayoutDashboard',
        description: 'Vue d\u2019ensemble : membres, trésorerie, pot commun',
      },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestion',
    items: [
      {
        id: 'coop-membres',
        label: 'Membres',
        icon: 'Users',
        description: 'Adhésions, chefs de groupe, sanctions',
      },
      {
        id: 'coop-tresorerie',
        label: 'Trésorerie',
        icon: 'Wallet',
        description: 'Entrées, sorties, validations',
      },
      {
        id: 'coop-stock',
        label: 'Stock commun',
        icon: 'Package',
        description: 'Apports et distributions du pot commun',
      },
      {
        id: 'coop-besoins',
        label: 'Achats groupés',
        icon: 'ClipboardList',
        description: 'Besoins des membres, consolidation, dispatch',
      },
    ],
  },
  {
    id: 'compte',
    label: 'Mon compte',
    items: [
      {
        id: 'coop-profil',
        label: 'Profil',
        icon: 'User',
        description: 'Identité et coopérative',
      },
    ],
  },
]

/** Dérivé (pas dupliqué) — même discipline que `SIDEBAR_ITEMS = GROUPS.flatMap`. */
export const COOP_NAV_ITEMS: CoopNavItem[] = COOP_NAV_GROUPS.flatMap((g) => g.items)

/** Label d'un écran coopératif, ou undefined si id inconnu. */
export function coopNavLabel(id: string): string | undefined {
  return COOP_NAV_ITEMS.find((item) => item.id === id)?.label
}
