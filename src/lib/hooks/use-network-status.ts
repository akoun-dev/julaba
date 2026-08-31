'use client'

import { useEffect, useState } from 'react'
import { Network } from '@capacitor/network'

/**
 * Real connectivity status for screens that need to show it (e.g. a "En
 * ligne"/"Hors ligne" badge) — @capacitor/network works on the web too
 * (backed by navigator.onLine), so this is accurate in a browser tab as
 * well as the native shell. Defaults to true (matches CapacitorProvider's
 * own default) until the first real status resolves, so a screen never
 * flashes "Hors ligne" on an online device just because the check hasn't
 * landed yet.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let cancelled = false
    Network.getStatus().then((status) => {
      if (!cancelled) setOnline(status.connected)
    })
    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      setOnline(status.connected)
    })
    return () => {
      cancelled = true
      listenerPromise.then((h) => h.remove())
    }
  }, [])

  return online
}
