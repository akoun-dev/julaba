'use client'

/**
 * MODE-904 (§34) — bandeau discret de connectivité du Mode Marché.
 *
 * Règle du cahier des charges : « Ne pas présenter l'offline comme une
 * erreur ». États (§34) : Hors connexion (+ opérations en attente),
 * Synchronisation…, N opérations en attente, À jour — jamais un ton
 * d'alerte rouge, jamais de blocage.
 *
 * La source de vérité réseau est l'unique store @capacitor/network
 * (network-store) ; le nombre d'opérations vient de la file offline
 * (offline-db), rechargé sur son événement `julaba-offline-queue-changed`
 * + rafraîchissement léger pendant que le bandeau est visible.
 */

import { useEffect, useState } from 'react'
import { CheckCheck, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { getPendingSyncEntries, isSyncFlushInProgress } from '@/lib/offline-db'
import { buildConnectivityView, type ConnectivityView } from '@/lib/market-mode/connectivity'
import { cn } from '@/lib/utils'

const POLL_MS = 1500

function useConnectivityView(): ConnectivityView {
  const connected = useNetworkStatus()
  const [view, setView] = useState<ConnectivityView>(() => buildConnectivityView(connected, 0, false))

  useEffect(() => {
    let cancelled = false
    const compute = async () => {
      try {
        const entries = await getPendingSyncEntries()
        if (!cancelled) {
          setView(buildConnectivityView(connected, entries.length, isSyncFlushInProgress()))
        }
      } catch {
        // File illisible (stockage indisponible) : état réseau seul.
        if (!cancelled) setView(buildConnectivityView(connected, 0, false))
      }
    }
    void compute()
    const interval = setInterval(() => void compute(), POLL_MS)
    window.addEventListener('julaba-offline-queue-changed', compute)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('julaba-offline-queue-changed', compute)
    }
  }, [connected])

  return view
}

const STYLES: Record<ConnectivityView['state'], { pill: string; icon: typeof Wifi; spin: boolean }> = {
  offline: { pill: 'bg-[#FBE3D0] text-[#8C4A1F]', icon: WifiOff, spin: false },
  syncing: { pill: 'bg-blue-50 text-blue-700', icon: RefreshCw, spin: true },
  pending: { pill: 'bg-amber-50 text-amber-800', icon: RefreshCw, spin: false },
  synced: { pill: 'bg-green-50 text-green-700', icon: CheckCheck, spin: false },
}

export function MarketConnectivityStrip() {
  const view = useConnectivityView()
  const style = STYLES[view.state]
  const Icon = view.state === 'offline' ? WifiOff : view.state === 'syncing' ? RefreshCw : view.state === 'pending' ? RefreshCw : CheckCheck

  return (
    <div className="flex flex-col items-center gap-0.5" aria-live="polite">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
          style.pill,
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', style.spin && 'animate-spin')} aria-hidden="true" />
        {view.label}
      </span>
      {view.detail && <span className="text-[11px] font-medium text-[#8C7B6B]">{view.detail}</span>}
    </div>
  )
}
