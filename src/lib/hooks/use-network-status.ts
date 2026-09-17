'use client'

import { useNetworkStore } from '@/lib/stores/network-store'

/**
 * Real connectivity status for screens that need to show it (e.g. a "En
 * ligne"/"Hors ligne" badge) — read from useNetworkStore, which is fed by a
 * single app-wide @capacitor/network watcher (see network-store.ts). The
 * plugin works on the web too (backed by navigator.onLine), so this is
 * accurate in a browser tab as well as the native shell. Defaults to true
 * (optimistic store default) until the first real status resolves, so a
 * screen never flashes "Hors ligne" on an online device just because the
 * check hasn't landed yet.
 */
export function useNetworkStatus(): boolean {
  return useNetworkStore((s) => s.connected)
}
