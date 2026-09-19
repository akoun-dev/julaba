'use client'

import { useEffect } from 'react'
import { flushAllPendingSync, getPendingSyncEntries } from '@/lib/offline-db'
import { registerAllSyncHandlers } from '@/lib/sync-handlers'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { useNetworkStore } from '@/lib/stores/network-store'
import { useAppStore } from '@/lib/stores/app-store'
import { useStockStore } from '@/lib/stores/stock-store'
import { useMarketModeStore } from '@/lib/stores/market-mode-store'

/** Throttle du rafraîchissement post-flush (STK-808) : plusieurs flush
 * rapprochés (focus + online + visibility) ne doivent pas déclencher
 * autant de rechargements balances/produits — 2 s suffisent et restent
 * invisibles pour l'utilisatrice. */
const POST_FLUSH_REFRESH_THROTTLE_MS = 2000
let lastRefreshAt = 0

/**
 * Après chaque flush réussi (et chaque flush tenté : des entrées ont pu
 * partir), les BALANCES SERVEUR redeviennent la source de vérité affichée
 * (§2.8) : les deltas locaux optimistes (adjustLocalStock) sont réalignés
 * par fetchProducts, et la config stock (unités/seuils STK-806) est
 * rechargée. Best-effort : en cas d'échec réseau, les valeurs locales
 * restent affichées — jamais de crash ni d'écran vide.
 */
function refreshStockAfterFlush(): void {
  const now = Date.now()
  if (now - lastRefreshAt < POST_FLUSH_REFRESH_THROTTLE_MS) return
  lastRefreshAt = now
  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return
  const stock = useStockStore.getState()
  void stock.fetchProducts(merchantId)
  void stock.loadStockConfig(merchantId)
}

async function updateMarketSyncState(status?: 'success' | 'error'): Promise<void> {
  const market = useMarketModeStore.getState()
  const entries = await getPendingSyncEntries()
  market.setPendingSyncCount(entries.length)
  if (status) {
    if (status === 'success') market.markSynced()
    else market.setSyncStatus('error')
  }
}

async function flushForMarket(): Promise<void> {
  useMarketModeStore.getState().setSyncStatus('syncing')
  try {
    await flushAllPendingSync()
    await updateMarketSyncState('success')
  } catch {
    await updateMarketSyncState('error')
  }
}

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
 *   (queued by a previous session that closed before the flush);
 * - refreshes the server stock balances after each flush (STK-808 — the
 *   local deltas were projections, the server just told the truth).
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
        void flushForMarket().then(refreshStockAfterFlush)
      }
    })
  }, [])

  useEffect(() => {
    if (!online) return
    void flushForMarket().then(refreshStockAfterFlush)
  }, [online])

  useEffect(() => {
    // Source de vérité = store réseau (@capacitor/network, lui-même adossé
    // à navigator.onLine sur web) — plus de lecture navigator.onLine en
    // direct, qui ne voyait ni le natif ni le même état que le reste de
    // l'app. L'événement window 'online' reste branché en filet de sécurité
    // : il complète la transition [online] ci-dessus quand le navigateur
    // signale la reconnexion entre deux mises à jour du plugin.
    const flushIfOnline = () => {
      if (useNetworkStore.getState().connected) {
          void flushForMarket().then(refreshStockAfterFlush)
      }
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
