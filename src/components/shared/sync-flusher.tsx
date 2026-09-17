'use client'

import { useEffect } from 'react'
import { flushAllPendingSync, getPendingSyncEntries } from '@/lib/offline-db'
import { registerAllSyncHandlers } from '@/lib/sync-handlers'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { useNetworkStore } from '@/lib/stores/network-store'

/**
 * Invisible lifecycle component for the offline sync queue (src/lib/offline-db.ts).
 * Mounted once at the app root for every authenticated actor, it:
 * - registers the replay handlers (src/lib/sync-handlers.ts) exactly once;
 * - flushes the queue when connectivity returns (the main trigger — a write
 *   queued offline should reach the server as soon as the network does,
 *   without waiting for a relaunch or the next write);
 * - flushes on window focus / tab visibility (covers the "device slept
 *   through the online event" case, common on mobile);
 * - flushes right away if the page loaded with entries already pending
 *   (queued by a previous session that closed before the flush).
 *
 * Silent by design: a successful flush repairs data the user already saw
 * acknowledged as "en attente de synchronisation" — speaking over it would
 * interrupt whatever Tata is currently saying (see tata-tts.ts single-callback
 * notes), and the notifications watcher handles anything the user should
 * actually be told about.
 */
export function SyncFlusher() {
  const online = useNetworkStatus()

  useEffect(() => {
    registerAllSyncHandlers()
    // Catch a queue left over from a previous session — if we are already
    // online on mount, this is the flush that clears it.
    getPendingSyncEntries().then((entries) => {
      if (entries.length > 0 && useNetworkStore.getState().connected) {
        flushAllPendingSync()
      }
    })
  }, [])

  useEffect(() => {
    if (!online) return
    flushAllPendingSync()
  }, [online])

  useEffect(() => {
    // Source de vérité = store réseau (@capacitor/network, lui-même adossé
    // à navigator.onLine sur web) — plus de lecture navigator.onLine en
    // direct, qui ne voyait ni le natif ni le même état que le reste de
    // l'app. L'événement window 'online' reste branché en filet de sécurité
    // : il complète la transition [online] ci-dessus quand le navigateur
    // signale la reconnexion entre deux mises à jour du plugin.
    const flushIfOnline = () => {
      if (useNetworkStore.getState().connected) flushAllPendingSync()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') flushIfOnline()
    }
    window.addEventListener('online', flushIfOnline)
    window.addEventListener('focus', flushIfOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', flushIfOnline)
      window.removeEventListener('focus', flushIfOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
