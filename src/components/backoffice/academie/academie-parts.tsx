'use client'

// Configurations et helpers d'affichage de l'Académie back-office
// (DET-001 tranche 7, MODE-993) : badges statut/difficulté, onglets contenus,
// onglets acteurs (icônes JSX), helpers de style. Transférés verbatim depuis
// bo-academie-screen.tsx — seules les déclarations deviennent export.

import {
  Archive,
  AlertTriangle,
  BarChart3,
  BookMarked,
  BookOpen,
  FileText,
  Globe,
  HelpCircle,
  Newspaper,
  PenTool,
  Sparkles,
  Tag,
  Target,
  Users,
} from 'lucide-react'
import type { ContentStatus, Difficulty, ContentTab } from '@/lib/bo-academie-data'

export const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bgLight: string; bgDark: string; icon: React.ReactNode }> = {
  publie: {
    label: 'Publié',
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50 border-emerald-200',
    bgDark: 'bg-emerald-500/10 border-emerald-500/20',
    icon: <Globe className="h-3 w-3" />,
  },
  brouillon: {
    label: 'Brouillon',
    color: 'text-amber-700',
    bgLight: 'bg-amber-50 border-amber-200',
    bgDark: 'bg-amber-500/10 border-amber-500/20',
    icon: <PenTool className="h-3 w-3" />,
  },
  archive: {
    label: 'Archivé',
    color: 'text-gray-600',
    bgLight: 'bg-gray-50 border-gray-200',
    bgDark: 'bg-slate-700 border-slate-600',
    icon: <Archive className="h-3 w-3" />,
  },
}

export const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; color: string; icon: React.ReactNode }> = {
  debutant: { label: 'Débutant', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <Sparkles className="h-3 w-3" /> },
  intermediaire: { label: 'Intermédiaire', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: <BarChart3 className="h-3 w-3" /> },
  avance: { label: 'Avancé', color: 'text-red-600 bg-red-50 border-red-200', icon: <AlertTriangle className="h-3 w-3" /> },
}

export const DIFFICULTY_CONFIG_DARK: Record<Difficulty, { color: string }> = {
  debutant: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  intermediaire: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  avance: { color: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

export const TAB_CONFIG: Record<ContentTab, { label: string; icon: React.ReactNode; color: string }> = {
  tutoriels: { label: 'Tutoriels', icon: <BookOpen className="h-4 w-4" />, color: 'text-blue-600' },
  faq: { label: 'FAQ', icon: <HelpCircle className="h-4 w-4" />, color: 'text-purple-600' },
  articles: { label: 'Articles', icon: <Newspaper className="h-4 w-4" />, color: 'text-orange-600' },
}

// Content is browsed actor-first, module-second: an item's `targetRole`
// picks which actor tab it lives under (an empty targetRole — "tous les
// rôles" — means general content, so it shows up under every actor tab as
// well as under "Tous les acteurs"), and within a tab its `category` picks
// which module section it's grouped into.
export const ACTOR_TABS = [
  { value: 'tous', label: 'Tous les acteurs', icon: <Users className="h-4 w-4" /> },
  { value: 'marchand', label: 'Marchands', icon: <BookMarked className="h-4 w-4" /> },
  { value: 'producteur', label: 'Producteurs', icon: <Sparkles className="h-4 w-4" /> },
  { value: 'identificateur', label: 'Identificateurs', icon: <Target className="h-4 w-4" /> },
  { value: 'cooperative', label: 'Coopératives', icon: <Tag className="h-4 w-4" /> },
] as const

export function getTabConfig(tab: string | undefined) {
  return TAB_CONFIG[tab as ContentTab] ?? {
    label: tab || 'Contenu',
    icon: <FileText className="h-4 w-4" />,
    color: 'text-slate-500',
  }
}

export function getTabIcon(tab: string | undefined, isDark: boolean) {
  const config = getTabConfig(tab)
  const color = isDark ? 'text-slate-400' : config.color
  return <span className={color}>{config.icon}</span>
}

export function getStatusStyle(status: ContentStatus, isDark: boolean) {
  const cfg = STATUS_CONFIG[status]
  return {
    className: `border ${isDark ? cfg.bgDark : cfg.bgLight} ${cfg.color}`,
    icon: cfg.icon,
    label: cfg.label,
  }
}

export function getDifficultyStyle(difficulty: Difficulty | undefined, isDark: boolean) {
  if (!difficulty) return null
  const cfg = DIFFICULTY_CONFIG[difficulty]
  const darkCfg = DIFFICULTY_CONFIG_DARK[difficulty]
  return {
    className: `border ${isDark ? darkCfg.color : cfg.color}`,
    icon: cfg.icon,
    label: cfg.label,
  }
}
