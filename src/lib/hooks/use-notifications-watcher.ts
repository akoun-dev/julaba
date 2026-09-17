'use client'

import { useEffect, useRef } from 'react'
import { Network } from '@capacitor/network'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { useAppStore } from '@/lib/stores/app-store'
import { shouldDisplayNotification, getNotificationPrefs, subscribeToNotifications, syncPendingDeviceNotifications, type RealtimeHandle } from '@/lib/notifications'
import { showNotificationToast } from '@/lib/notifications/toast'
import { scheduleLocalNotification } from '@/lib/notification-local'
import { syncClosingReminder } from '@/lib/notifications/schedule'
import { useCaisseStore } from '@/lib/stores/caisse-store'
import { tataSpeak } from '@/lib/voice/tata-tts'

const POLL_INTERVAL_MS = 45000

/**
 * Keeps the notification bell live while the app is open — via three
 * complementary channels:
 *  1. a 45 s poll (the historical, always-works fallback);
 *  2. an immediate catch-up on visibilitychange / network restore;
 *  3. a Realtime *signal* channel (Task 28): the server broadcasts an
 *     opaque "{id}" on `julaba-notif:<subject>` whenever it creates a
 *     notification, and this hook re-fetches on signal — sub-second
 *     delivery while the app is open, with zero content in the payload
 *     (content always comes from the cookie-protected GET).
 *
 * Every arrival that is genuinely new (not "still here since last tick")
 * and passes the user's preferences (category mute, "important only",
 * silent mode — see shouldDisplayNotification) is:
 *  - shown as a toast (visual, respects durations and dedup);
 *  - spoken via Tata (voice ENABLED only, and only the newest of a burst —
 *    reading out a burst would be worse than reading none);
 *  - mirrored as a real system notification (Capacitor, native only) so a
 *    locked phone still notices.
 *
 * Task 29 — rappel de clôture planifié : une notification locale quotidienne
 * à 19h est programmée tant que la caisse est ouverte, annulée à la
 * fermeture (syncClosingReminder). Contrairement au trigger existant de
 * l'accueil (hour >= 19 au montage), elle tire même app fermée. No-op web
 * et producteur/identificateur (session de caisse inexistante → cancel).
 *
 * On network restore, device-origin notifications created offline are
 * pushed to the server (syncPending) BEFORE the fetch, so the badge
 * doesn't briefly show a stale pending count.
 */
export function useNotificationsWatcher() {
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications)
  const syncPending = useNotificationsStore((s) => s.syncPending)
  const consumeNewlyArrived = useNotificationsStore((s) => s.consumeNewlyArrived)
  const onlineRef = useRef(true)
  const realtimeRef = useRef<RealtimeHandle | null>(null)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      if (!onlineRef.current) return

      await fetchNotifications()
      if (cancelled) return

      const prefs = getNotificationPrefs()
      const fresh = consumeNewlyArrived().filter((n) => shouldDisplayNotification(n, prefs, { forToast: true }))
      if (fresh.length === 0) return

      for (const n of fresh) showNotificationToast(n)

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
      if (status.connected && wasOffline) {
        // Les notifications créées hors ligne partent au serveur d'abord,
        // puis le feed se rafraîchit.
        syncPending().finally(() => tick())
      }
    })

    // Rappel de clôture planifié (Task 29) : suit l'état de la caisse —
    // programmé quand une session est ouverte, annulé à la fermeture.
    // Synchronisé immédiatement puis à chaque changement du store caisse.
    const syncClosing = () => {
      void syncClosingReminder(useCaisseStore.getState().session?.isOpen === true)
    }
    syncClosing()
    const unsubscribeCaisse = useCaisseStore.subscribe(syncClosing)

    // Realtime signal — best-effort : un échec (WS bloqué, Realtime
    // indisponible) laisse simplement le polling 45 s faire le travail.
    const state = useAppStore.getState()
    if (state.merchantId && state.isAuthenticated) {
      const roleSubject = state.userRole === 'marchand' ? 'merchant' : state.userRole
      subscribeToNotifications(`${roleSubject}:${state.merchantId}`, () => {
        if (!cancelled && !onlineRef.current) return
        tick()
      }).then((handle) => { realtimeRef.current = handle })
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      unsubscribeCaisse()
      document.removeEventListener('visibilitychange', onVisible)
      listenerPromise.then((h) => h.remove())
      realtimeRef.current?.unsubscribe()
    }
  }, [fetchNotifications, syncPending, consumeNewlyArrived])
}
