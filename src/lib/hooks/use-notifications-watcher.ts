'use client'

import { useEffect, useRef } from 'react'
import { Network } from '@capacitor/network'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { useAppStore } from '@/lib/stores/app-store'
import { isNotificationMuted } from '@/lib/notification-preferences'
import { scheduleLocalNotification } from '@/lib/notification-local'
import { tataSpeak } from '@/lib/voice/tata-tts'

const POLL_INTERVAL_MS = 45000

/**
 * Keeps the notification bell live while the app is open — without this, the
 * badge/panel only ever reflected whatever was true the instant the home
 * screen mounted, so a dossier validated (or any other trigger) five
 * minutes into a session sat invisible until the user happened to leave and
 * come back to Home. Mounted once at the page root (see page.tsx), not per
 * home screen, so it keeps polling on every other screen too.
 *
 * On each tick that turns up something genuinely new (not just "still here
 * since last poll"), it's read aloud via the same TTS voice used everywhere
 * else in the app — this app leans on voice specifically so an illiterate
 * user isn't left staring at a red dot they can't read — and mirrored as a
 * real system notification (see notification-local.ts) so it's still
 * noticed if the phone is locked or another app is in front.
 *
 * A tick that would do nothing useful is skipped entirely — no fetch while
 * the tab/app is backgrounded (document.hidden) or the device is offline
 * (@capacitor/network, the same plugin capacitor-provider.tsx already uses
 * for the connectivity banner — works on web too, backed by navigator.onLine).
 * A rural, connectivity-poor userbase pays real battery/data for a poll that
 * can't succeed anyway; visibilitychange/networkStatusChange trigger an
 * immediate catch-up tick the moment either condition clears, so nothing is
 * actually delayed beyond what was already unavoidable.
 */
export function useNotificationsWatcher() {
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications)
  const consumeNewlyArrived = useNotificationsStore((s) => s.consumeNewlyArrived)
  const onlineRef = useRef(true)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      if (!onlineRef.current) return

      await fetchNotifications()
      if (cancelled) return

      const fresh = consumeNewlyArrived().filter((n) => !isNotificationMuted(n.type))
      if (fresh.length === 0) return

      // Reading out a burst of several at once would be worse than reading
      // none — only the newest genuinely new arrival gets spoken.
      const newest = fresh[0]
      if (useAppStore.getState().voiceEnabled) {
        tataSpeak(`${newest.title}. ${newest.body}`)
      }
      for (const n of fresh) scheduleLocalNotification(n)
    }

    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    Network.getStatus().then((status) => { onlineRef.current = status.connected })
    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      const wasOffline = !onlineRef.current
      onlineRef.current = status.connected
      if (status.connected && wasOffline) tick()
    })

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      listenerPromise.then((h) => h.remove())
    }
  }, [fetchNotifications, consumeNewlyArrived])
}
