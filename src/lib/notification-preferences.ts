import { useAppStore } from '@/lib/stores/app-store'
import type { NotificationType } from '@/lib/stores/notifications-store'

// Connects a real notification type to the preference key that's supposed
// to govern it. Types with no entry here (bienvenue, dossier_valide/rejete,
// commande_recue) are never muted: a one-time welcome and role-critical
// business events (a dossier's fate, an incoming order) aren't the kind of
// thing a generic toggle should silence. 'annonce' (an admin broadcast) is
// deliberately under the same 'systeme' key as sync_conflict — that's what
// its own toggle label ("Alertes de synchronisation et annonces Jùlaba")
// already promised, a promise the code didn't originally keep.
const TYPE_TO_PREFERENCE: Partial<Record<NotificationType, string>> = {
  sync_conflict: 'systeme',
  annonce: 'systeme',
  tontine_cotisation: 'tontines',
}

/** Mirrors profile-screen.tsx's own read of its localStorage key — kept
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

/** Producteur/identificateur have no full profile object the way marchand
 * does — just this one toggle, under its own small storage key per role. */
function simplePrefsKey(role: 'producteur' | 'identificateur', phone: string): string {
  return `julaba-notif-prefs-${role}-${phone}`
}

export function getSimpleNotifPrefs(role: 'producteur' | 'identificateur'): { systeme: boolean } {
  try {
    const phone = useAppStore.getState().merchantPhone
    if (!phone) return { systeme: true }
    const raw = localStorage.getItem(simplePrefsKey(role, phone))
    if (!raw) return { systeme: true }
    const parsed = JSON.parse(raw)
    return { systeme: parsed?.systeme !== false }
  } catch {
    return { systeme: true }
  }
}

export function setSimpleNotifPrefs(role: 'producteur' | 'identificateur', prefs: { systeme: boolean }): void {
  try {
    const phone = useAppStore.getState().merchantPhone
    if (!phone) return
    localStorage.setItem(simplePrefsKey(role, phone), JSON.stringify(prefs))
  } catch {
    // Best-effort — worst case the toggle doesn't stick across reloads.
  }
}

/** True if this notification type is both mutable and currently muted by
 * the signed-in user's own preference, whichever of the three roles they
 * are. Marchand reads its full profile object; producteur/identificateur
 * read the single 'systeme' toggle above (they have no 'tontines' category
 * — that preference key is simply never looked up for them). */
export function isNotificationMuted(type: NotificationType): boolean {
  const role = useAppStore.getState().userRole
  const prefKey = TYPE_TO_PREFERENCE[type]
  if (!prefKey) return false

  if (role === 'marchand') {
    const prefs = readMerchantNotificationPrefs()
    if (!prefs) return false
    return prefs[prefKey] === false
  }
  if (role === 'producteur' || role === 'identificateur') {
    if (prefKey !== 'systeme') return false // no 'tontines' category outside marchand
    return getSimpleNotifPrefs(role).systeme === false
  }
  return false
}
