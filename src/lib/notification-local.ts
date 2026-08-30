import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { AppNotification } from '@/lib/stores/notifications-store'

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
// APNs) — a server that can wake the app from nothing — which requires a
// Firebase project and server-side credentials nobody has configured here.
// No-ops on web (Capacitor.isNativePlatform() is false in a browser tab).
let permissionAsked = false

async function ensurePermission(): Promise<boolean> {
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
function idFor(notificationId: string): number {
  let hash = 0
  for (let i = 0; i < notificationId.length; i++) {
    hash = (hash * 31 + notificationId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

export async function scheduleLocalNotification(notification: AppNotification): Promise<void> {
  if (!(await ensurePermission())) return
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: idFor(notification.id),
        title: notification.title,
        body: notification.body,
        schedule: { at: new Date(Date.now() + 100) }, // near-immediate; `at` is required by the plugin's types
      }],
    })
  } catch {
    // Best-effort — the in-app panel is still the source of truth.
  }
}
