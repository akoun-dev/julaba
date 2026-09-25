'use client'

import { type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * États UI partagés marchand/producteur (MODE-1008).
 *
 * Miroir mobile de `bo-ui.tsx` (BoErrorBanner / BoEmptyState) pour les
 * côtés NON backoffice : mêmes motifs (erreur rouge subtile avec réessai,
 * état vide centré muet), adaptés aux écrans de terrain (cibles tactiles
 * min-h-11, mode soleil). Composants purs : aucune donnée, aucun fetch —
 * l'écran reste propriétaire de ses états et passe `soleilMode`
 * (accessibilité : texte agrandi, pas recoloré — surfaces-marchand.md).
 */

// ============== LOADING ==============

/**
 * État de chargement localisé (MODE-1008, miroir `bo-ui.tsx`).
 * `role="status" aria-live="polite"` (UI-MP-019) + spinner Loader2.
 * Pour le chargement d'une liste entière, les squelettes restent la
 * référence (UI-MP-030 — transferts-screen) ; ce composant cible les
 * chargements courts/locaux qui affichaient un « Chargement… » inline.
 */
export function AppLoading({ label = 'Chargement…', soleilMode = false, className }: {
  label?: string
  soleilMode?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground',
        className
      )}
    >
      <Loader2 aria-hidden="true" className="size-6 animate-spin" />
      <p className={soleilMode ? 'text-base' : ''}>{label}</p>
    </div>
  )
}

// ============== ERROR ==============

/**
 * État d'erreur (MODE-1008, miroir `bo-ui.tsx` → BoErrorBanner) :
 * bannière rouge subtile, `role="alert"`, bouton « Réessayer » optionnel
 * (cible tactile min-h-11). L'écran fournit `message` (et garde son
 * handler de rechargement) — aucun texte n'est deviné ici.
 */
export function AppError({ message, description, onRetry, retryLabel = 'Réessayer', soleilMode = false, className }: {
  message: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  soleilMode?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'animate-in fade-in duration-300 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
        className
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-8 shrink-0 opacity-60" />
      <p className={cn('font-medium', soleilMode ? 'text-base' : 'text-sm')}>{message}</p>
      {description && (
        <p className={soleilMode ? 'text-sm' : 'text-xs'}>{description}</p>
      )}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 min-h-11"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          <span className="ml-1.5">{retryLabel}</span>
        </Button>
      )}
    </div>
  )
}

// ============== EMPTY STATE ==============

/**
 * État vide (MODE-1008, miroir `bo-ui.tsx` → BoEmptyState) : icône + titre
 * + description optionnels, texte centré muet, action optionnelle (bouton
 * de l'écran). Version compacte du motif backoffice, calibrée mobile.
 */
export function AppEmpty({ title, description, icon: Icon, action, soleilMode = false, className }: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  soleilMode?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'animate-in fade-in duration-300 flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground',
        className
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-12 opacity-30" />}
      <p className={soleilMode ? 'text-base' : 'text-sm'}>{title}</p>
      {description && (
        <p className={soleilMode ? 'text-sm' : 'text-xs'}>{description}</p>
      )}
      {action}
    </div>
  )
}
