'use client'

import { useEffect, useState } from 'react'
import { Network } from '@capacitor/network'
import { WifiOff } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { initCapacitorNative } from '@/lib/capacitor'
import { flushAllPendingSync } from '@/lib/offline-db'
import { registerSyncHandlers } from '@/lib/sync-handlers'

/**
 * Mounted once in the root layout. Wires the native shell (status bar,
 * splash screen, Android back button) and a connectivity banner shared by
 * every mode (marchand/identificateur/backoffice). @capacitor/network works
 * on the web too (backed by navigator.onLine), so this behaves consistently
 * whether the app is running in a browser tab or the native shell.
 */
export function CapacitorProvider() {
  const [online, setOnline] = useState(true)
  const goBack = useAppStore((s) => s.goBack)

  useEffect(() => {
    const cleanupNative = initCapacitorNative(goBack, () => useAppStore.getState().previousScreen !== null)
    registerSyncHandlers()

    let cancelled = false
    Network.getStatus().then((status) => {
      if (!cancelled) {
        setOnline(status.connected)
        // Catch anything queued while offline in a previous session.
        if (status.connected) flushAllPendingSync().catch(() => {})
      }
    })
    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      setOnline(status.connected)
      if (status.connected) flushAllPendingSync().catch(() => {})
    })

    return () => {
      cancelled = true
      cleanupNative()
      listenerPromise.then((h) => h.remove())
    }
    // goBack is a stable zustand action reference; run this setup once.
  }, [goBack])

  if (online) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Hors ligne — certaines actions seront synchronisées au retour du réseau
    </div>
  )
}
