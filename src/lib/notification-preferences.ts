import { useAppStore } from '@/lib/stores/app-store'
import type { NotificationType } from '@/lib/stores/notifications-store'

// Only marchand has a "Notifications" preferences sub-screen today
// (profile-screen.tsx) — its toggles previously controlled nothing real.
// This is the one place that connects a real notification type to the
// preference key that's supposed to govern it. Types with no entry here
// (bienvenue, dossier_valide/rejete, commande_recue) are never muted: a
// one-time welcome and role-critical business events (a dossier's fate, an
// incoming order) aren't the kind of thing a generic toggle should silence.
const TYPE_TO_PREFERENCE: Partial<Record<NotificationType, string>> = {
  sync_conflict: 'systeme',
  tontine_cotisation: 'tontines',
}

/** Mirrors profile-screen.tsx's own read of the same localStorage key — kept
 * here rather than imported from that (client component) file so this stays
 * usable from the notification watcher without pulling in screen code. */
function readMerchantNotificationPrefs(): Record<string, boolean> | null {
  try {
    const phone = useAppStore.getState().merchantPhone
    if (!phone) return null
    const raw = localStorage.getItem(`julaba-profile-${phone}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.preferences?.notifications ?? null
  } catch {
    return null
  }
}

/** True if this notification type is both mutable and currently muted by
 * the signed-in marchand's own preference. Always false for producteur/
 * identificateur (they have no preferences screen to have muted anything). */
export function isNotificationMuted(type: NotificationType): boolean {
  if (useAppStore.getState().userRole !== 'marchand') return false
  const prefKey = TYPE_TO_PREFERENCE[type]
  if (!prefKey) return false
  const prefs = readMerchantNotificationPrefs()
  if (!prefs) return false
  return prefs[prefKey] === false
}
