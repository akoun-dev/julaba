'use client'

import { type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, RefreshCw, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ADMINISTRATION_ITEMS, useBackofficeStore } from '@/lib/stores/backoffice-store'

/**
 * Composants partagés du backoffice Jùlaba.
 * Garantissent un en-tête, une barre de filtres, une bannière d'erreur,
 * un état vide et des cartes de statistiques identiques sur tous les écrans.
 * Thème : variantes Tailwind `dark:` (la classe est togglée sur <html>).
 */

// ============== PAGE HEADER ==============

export function BoPageHeader({ title, description, actions, className }: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  const { boCurrentScreen, boNavigate } = useBackofficeStore()
  const showAdministrationBack = ADMINISTRATION_ITEMS.some((item) => item.id === boCurrentScreen)

  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {showAdministrationBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => boNavigate('bo-administration')}
            className="mb-2 -ml-2 h-8 gap-1.5 px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à Administration
          </Button>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}

// ============== FILTER BAR ==============

export function BoFilterBar({ children, className }: {
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('bg-white dark:bg-slate-800', className)}>
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        {children}
      </CardContent>
    </Card>
  )
}

// ============== ERROR BANNER ==============

export function BoErrorBanner({ message, onRetry, className }: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'animate-in fade-in slide-in-from-top-1 duration-300 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="truncate">
          <strong className="font-semibold">Erreur de chargement :</strong>{' '}
          {message}
        </span>
      </span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-auto shrink-0 p-1 text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
        >
          <RefreshCw className="size-3.5" />
          <span className="ml-1.5 hidden sm:inline">Réessayer</span>
        </Button>
      )}
    </div>
  )
}

// ============== EMPTY STATE ==============

export function BoEmptyState({ icon: Icon, title, description, action, className }: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-12 text-center',
        'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/30',
        className
      )}
    >
      {Icon && (
        <div className="flex size-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Icon className="size-8 text-slate-400 dark:text-slate-500" />
        </div>
      )}
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

// ============== STAT CARD ==============

const STAT_TONES: Record<string, { iconBox: string; icon: string }> = {
  default: { iconBox: 'bg-slate-100 dark:bg-slate-700', icon: 'text-slate-600 dark:text-slate-300' },
  blue: { iconBox: 'bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400' },
  orange: { iconBox: 'bg-orange-500/10', icon: 'text-orange-600 dark:text-orange-400' },
  emerald: { iconBox: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400' },
  amber: { iconBox: 'bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400' },
  red: { iconBox: 'bg-red-500/10', icon: 'text-red-600 dark:text-red-400' },
}

export function BoStatCard({ icon: Icon, label, value, tone = 'default', hint, className }: {
  icon?: LucideIcon
  label: string
  value: ReactNode
  tone?: keyof typeof STAT_TONES
  hint?: ReactNode
  className?: string
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.default
  return (
    <Card className={cn('group bg-white dark:bg-slate-800 dark:border-slate-700 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md', className)}>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105', t.iconBox)}>
            <Icon className={cn('size-5', t.icon)} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {label}
            {hint && <span className="ml-1 opacity-70">· {hint}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
