// Passerelle toast (§6 de la spec) — pont entre le système de notifications
// et sonner (déjà le toaster des écrans BO). Respecte :
//  • les préférences (toastsEnabled, mode silencieux, catégories) — les
//    critiques et les erreurs d'action immédiate passent toujours ;
//  • la déduplication d'AFFICHAGE : deux notifications de même clé ne
//    peuvent pas empiler deux toasts identiques simultanément ;
//  • les durées par sévérité (toastDurationFor) — critique = persistant ;
//  • l'accessibilité : icône Lucide (jamais d'emoji), action unique, aria.
//
// Le toast ne remplace pas le centre : il ne porte que les événements que
// l'utilisateur doit voir MAINTENANT (succès d'action, erreur d'action,
// avertissement chaud). Le reste ne vit que dans le centre.

import { toast } from 'sonner'
import { AlertTriangle, Bell, CheckCircle2, Clock3, Info, XCircle, type LucideIcon } from 'lucide-react'
import type { InAppNotification } from './types'
import { shouldDisplayNotification, toastDurationFor, deduplicationKeyOf } from './rules'
import { getNotificationPrefs } from './preferences'
import { trackNotificationMetric } from './metrics'

export const SEVERITY_ICON: Record<InAppNotification['severity'], LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  reminder: Clock3,
}

// Toasts actuellement à l'écran, par clé de déduplication — empêche le
// double affichage simultané d'un même événement (retours réseau rapides,
// double clic, Realtime + création locale).
const activeToastKeys = new Set<string>()

function releaseKey(key: string): void {
  activeToastKeys.delete(key)
}

/** Affiche (ou non) une notification en toast. Retourne true si affiché. */
export function showNotificationToast(notification: InAppNotification): boolean {
  const prefs = getNotificationPrefs()
  const isErrorOfAction = notification.severity === 'error'
  // Les toasts « non critiques » peuvent être désactivés ; les erreurs
  // nécessaires à la compréhension d'une action et tout ce qui est critique
  // passent quoi qu'il arrive (spec §8).
  if (!isErrorOfAction && !shouldDisplayNotification(notification, prefs, { forToast: true })) {
    return false
  }
  if (prefs.toastsEnabled === false && !isErrorOfAction && notification.priority !== 'critical') {
    return false
  }

  const key = deduplicationKeyOf(notification)
  if (activeToastKeys.has(key)) return false
  activeToastKeys.add(key)

  const Icon = SEVERITY_ICON[notification.severity] ?? Bell
  const duration = toastDurationFor(notification)
  trackNotificationMetric('displayed', { category: notification.category, severity: notification.severity })

  const common = {
    description: notification.body,
    icon: <Icon className="w-4 h-4" aria-hidden />,
    onDismiss: () => {
      releaseKey(key)
      trackNotificationMetric('ignored', { category: notification.category })
    },
    onAutoClose: () => releaseKey(key),
  }

  if (notification.actionLabel && notification.actionRoute) {
    toast(notification.title, {
      ...common,
      duration,
      action: {
        label: notification.actionLabel,
        onClick: () => {
          releaseKey(key)
          trackNotificationMetric('action_executed', { category: notification.category, createdAt: notification.createdAt })
          void executeNotificationAction(notification)
        },
      },
    })
  } else {
    toast(notification.title, { ...common, duration })
  }
  return true
}

/** Exécute l'action de navigation d'une notification (séparé pour être
 * appelable depuis le centre et le toast sans dépendre du store au chargement). */
export async function executeNotificationAction(notification: InAppNotification): Promise<void> {
  if (!notification.actionRoute) return
  try {
    const { useAppStore } = await import('@/lib/stores/app-store')
    const store = useAppStore.getState()
    // Les routes du centre sont des ScreenRoute connues ; une route
    // inconnue (donnée corrompue) ne doit jamais planter l'écran.
    const route = notification.actionRoute as Parameters<typeof store.navigate>[0]
    store.navigate(route)
    trackNotificationMetric('opened', { category: notification.category, createdAt: notification.createdAt })
  } catch {
    trackNotificationMetric('navigation_failed', { category: notification.category })
  }
}

/** Purge l'état d'affichage (utile aux tests). */
export function resetToastStateForTests(): void {
  activeToastKeys.clear()
}
