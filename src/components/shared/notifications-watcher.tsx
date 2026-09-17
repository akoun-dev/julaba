'use client'

import { useNotificationsWatcher } from '@/lib/hooks/use-notifications-watcher'
import { useNotificationTriggers } from '@/lib/notifications/triggers'

/** Invisible — mounts the notification infrastructure for the lifetime of
 * an authenticated session:
 *  • the polling/voice/local-notification watcher (see
 *    use-notifications-watcher.ts — 45 s poll, Realtime signal, toasts);
 *  • the offline-queue listeners that turn "operation queued while offline"
 *    and "queue drained" into notifications (triggers.ts). */
export function NotificationsWatcher() {
  useNotificationsWatcher()
  useNotificationTriggers()
  return null
}
