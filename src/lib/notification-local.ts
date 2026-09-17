import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { AppNotification } from '@/lib/stores/notifications-store'
import type { InAppNotification } from '@/lib/notifications/types'
import { channelIdFor } from '@/lib/notifications/channels'

// Fires a real system notification for a newly-arrived in-app notification
// — the in-app bell/panel only shows something while the app is actually
// open on screen, so without this a notification silently sits unseen the
// moment the phone is locked or the user switches apps. This is genuinely
// real (the @capacitor/local-notifications plugin was already installed
// but never wired to anything), and it works whenever the app process is
// alive — foreground or backgrounded within what the OS allows.
//
// What this deliberately does NOT do: deliver a notification after the app
// has been force-quit or the phone rebooted. That needs remote push (FCM/
// APNs) — see native.ts (Task 29) for the push side and schedule.ts for
// reminders that DO fire while the app is closed. No-ops on web
// (Capacitor.isNativePlatform() is false in a browser tab).
let permissionAsked = false

/** Vérifie (et demande une seule fois) la permission d'affichage Android
 * 13+. Exporté pour les planificateurs de schedule.ts qui partagent la
 * même permission. */
export async function ensureLocalDisplayPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const status = await LocalNotifications.checkPermissions()
    if (status.display === 'granted') return true
    if (permissionAsked) return false // don't re-prompt every poll tick if the user said no
    permissionAsked = true
    const requested = await LocalNotifications.requestPermissions()
    return requested.display === 'granted'
  } catch {
    return false
  }
}

// Local notification ids must be 32-bit ints — derive a stable one from the
// notification's own cuid so the same server-side row never double-fires.
// Exported: schedule.ts uses the same space of ids for its reminders.
export function idFor(notificationId: string): number {
  let hash = 0
  for (let i = 0; i < notificationId.length; i++) {
    hash = (hash * 31 + notificationId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

export async function scheduleLocalNotification(notification: InAppNotification | AppNotification): Promise<void> {
  if (!(await ensureLocalDisplayPermission())) return
  try {
    const rich = notification as Partial<InAppNotification>
    await LocalNotifications.schedule({
      notifications: [{
        id: idFor(notification.id),
        title: notification.title,
        body: notification.body,
        // isExactNotification: false — a near-immediate delivery does not
        // need an exact alarm, and since plugin 8.3.0 the default (true)
        // would open the system « Alarmes & rappels » screen on Android 12+
        // on EVERY new notification arrival. See schedule.ts for the same
        // choice on scheduled reminders.
        isExactNotification: false,
        schedule: { at: new Date(Date.now() + 100) }, // near-immediate; `at` is required by the plugin's types
        // Canal par sévérité (canaux créés au démarrage — native.ts) et
        // extra porté au tap : la navigation vers action_route passe par
        // handleNotificationTap (native.ts), comme pour les push.
        channelId: channelIdFor(rich.severity ?? 'info', rich.priority ?? 'normal'),
        extra: {
          actionRoute: rich.actionRoute ?? null,
          actionLabel: rich.actionLabel ?? null,
          deduplicationKey: rich.deduplicationKey ?? null,
          category: rich.category ?? null,
        },
      }],
    })
  } catch {
    // Best-effort — the in-app panel is still the source of truth.
  }
}
