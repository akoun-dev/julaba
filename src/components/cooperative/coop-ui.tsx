'use client'

/**
 * MODE-974 (AUDIT-007 G8/G11) — Primitives UI de l'espace coopérative,
 * déclinées des primitives BO (`bo-ui.tsx:19-181`) mais AUX JETONS DESIGN
 * COOP (COOP_COLOR #2072AF, design-tokens.ts:38) :
 *  - PAS de ternaires `isDark` (anti-pattern BO documenté, AUDIT-006 §3) ;
 *  - PAS de hex BO (bleu slate) — la couleur d'accent vient du jeton.
 *
 * Consommatrices : CoopScreenShell et les écrans coopératifs. Chaque
 * primitive est volontairement sans dépendance au domaine (pas d'import
 * du store coop) pour rester testable et réutilisable.
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { COOP_COLOR } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'

/** Bannière d'erreur réessayable (pattern `BoErrorBanner`, bo-ui.tsx:75-108). */
export function CoopErrorBanner({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'mx-4 mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700',
        className
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 leading-snug">{message}</span>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="min-h-[36px] shrink-0 border-red-300 text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Réessayer
        </Button>
      )}
    </div>
  )
}

/** Bandeau de chargement partiel (sections en erreur, données restées affichées). */
export function CoopPartialBanner({ sections }: { sections: string[] }) {
  if (sections.length === 0) return null
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-xs text-amber-800 leading-snug">
        Chargement partiel — indisponible : {sections.join(', ')}. Les données affichées
        sont les dernières connues.
      </p>
    </div>
  )
}

/** État vide honnête (pattern `BoEmptyState`, bo-ui.tsx:112-141). */
export function CoopEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-8 text-center',
        className
      )}
    >
      {Icon && (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${COOP_COLOR}15` }}
        >
          <Icon className="w-6 h-6" style={{ color: COOP_COLOR }} />
        </div>
      )}
      <p className="text-sm font-semibold text-stone-800">{title}</p>
      {description && <p className="text-xs text-stone-500 leading-snug max-w-xs">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** Carte KPI aux jetons COOP (pattern `BoStatCard` sans tones BO). */
export function CoopStatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon?: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className="w-4 h-4" style={{ color: COOP_COLOR }} />}
          <p className="text-xs text-stone-500">{label}</p>
        </div>
        <p className="text-2xl font-bold text-stone-900">{value}</p>
        {hint && <div className="text-[11px] text-stone-500">{hint}</div>}
      </CardContent>
    </Card>
  )
}

/** Skeleton de chargement (écart G4 / AUDIT-006 #4 — fin des « Chargement… » bruts). */
export function CoopSkeleton({ lignes = 3, className }: { lignes?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}

/** Pastille de comptage de navigation (badge d'onglet / item de menu). */
export function CoopBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
