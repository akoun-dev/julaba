'use client'

import { useNotificationsWatcher } from '@/lib/hooks/use-notifications-watcher'

/** Invisible — mounts the polling/voice/local-notification watcher for the
 * lifetime of an authenticated session. See use-notifications-watcher.ts. */
export function NotificationsWatcher() {
  useNotificationsWatcher()
  return null
}
