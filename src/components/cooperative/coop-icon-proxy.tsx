'use client'

/**
 * MODE-974 — Proxy d'icônes de la navigation coopérative (pattern du BO :
 * `IconProxy` + `BO_ICON_MAP`, bo-icon-proxy.tsx:45-60). Les icônes sont
 * stockées en STRING dans `COOP_NAV_GROUPS` (sérialisable, lisible depuis
 * n'importe quel module) et résolues ici en composants Lucide.
 * Renvoie null pour un nom inconnu (jamais de crash de navigation).
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  Wallet,
  Package,
  ClipboardList,
  User,
} from 'lucide-react'

export const COOP_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Wallet,
  Package,
  ClipboardList,
  User,
}

export function CoopIconProxy({ name, className }: { name: string; className?: string }) {
  const Icon = COOP_ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}
