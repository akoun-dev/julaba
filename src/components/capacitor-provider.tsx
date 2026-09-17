'use client'

import { useEffect, useState } from 'react'
import { Network } from '@capacitor/network'
import { WifiOff } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { initCapacitorNative } from '@/lib/capacitor'
import { claimDeviceSession, type ClaimSubjectType } from '@/lib/claim-device-session'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { notify, notifyConnectionRestored } from '@/lib/notifications/triggers'
import { connectionLostInput } from '@/lib/notifications/events'
import { syncPendingPushToken } from '@/lib/notifications/native'

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

    // Re-asserts the device's session claim on every reconnect — cheap (a
    // no-op renewal once already bound) and covers an account that logged
    // in before device sessions existed, or whose original claim never made
    // it through, without which it would stay 401'd forever otherwise.
    const reclaimIfAuthenticated = () => {
      const state = useAppStore.getState()
      if (!state.isAuthenticated || !state.merchantId) return
      const subjectType: ClaimSubjectType | null =
        state.userRole === 'marchand' ? 'merchant'
        : state.userRole === 'producteur' ? 'producteur'
        : state.userRole === 'identificateur' ? 'identificateur'
        : null
      if (subjectType) {
        claimDeviceSession(subjectType, state.merchantId).catch(() => {})
        // Le token push (FCM) a pu rester en attente (appareil en ligne mais
        // requête échouée au lancement) : le retour réseau est le moment
        // naturel pour réessayer — même contrat que syncPending des
        // notifications device.
        void syncPendingPushToken()
      }
    }

    let cancelled = false
    Network.getStatus().then((status) => {
      if (!cancelled) {
        setOnline(status.connected)
        if (status.connected) {
          reclaimIfAuthenticated()
        }
      }
    })
    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      setOnline(status.connected)
      if (status.connected) {
        reclaimIfAuthenticated()
        // Retour du réseau : les notifications créées hors ligne partent au
        // serveur (le watcher fait de même, les deux sont idempotents) et
        // une notification « connexion rétablie » informe l'utilisateur.
        if (useAppStore.getState().isAuthenticated) {
          useNotificationsStore.getState().syncPending().catch(() => {})
          void notifyConnectionRestored()
        }
      } else if (useAppStore.getState().isAuthenticated) {
        // Perte de connexion : une info unique par heure (dédup) pour
        // rassurer — les ventes continuent de fonctionner hors ligne.
        void notify(connectionLostInput())
      }
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
      className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
       Hors ligne — reconnectez-vous pour enregistrer vos actions dans Supabase
    </div>
  )
}
