'use client'

import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { classifyNetworkTransition, initNetworkWatcher, useNetworkStore } from '@/lib/stores/network-store'
import { initCapacitorNative } from '@/lib/capacitor'
import { claimDeviceSession, type ClaimSubjectType } from '@/lib/claim-device-session'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { notify, notifyConnectionRestored } from '@/lib/notifications/triggers'
import { connectionLostInput } from '@/lib/notifications/events'
import { syncPendingPushToken } from '@/lib/notifications/native'

/**
 * Mounted once in the root layout. Wires the native shell (system bars,
 * splash screen, Android back button) and a connectivity banner shared by
 * every mode (marchand/identificateur/backoffice).
 *
 * Task 30 — l'état réseau vit désormais dans useNetworkStore (un seul
 * listener natif @capacitor/network pour toute l'app, alimentant aussi le
 * watcher de notifications, le hook useNetworkStatus et le sync flusher) ;
 * ce provider initialise le watcher et réagit aux transitions classées par
 * classifyNetworkTransition :
 *  - initial-connected : re-claim de la session (compte connecté avant
 *    l'existence des device sessions, ou claim initial perdu) ;
 *  - went-online : idem + sync des notifications device + « connexion
 *    rétablie » (les ventes hors ligne repartent, le watcher de notifs
 *    fait de même — les deux sont idempotents) ;
 *  - went-offline : info « connexion instable » unique par heure (dédup)
 *    pour rassurer — les ventes continuent de fonctionner hors ligne.
 */
export function CapacitorProvider() {
  const online = useNetworkStore((s) => s.connected)
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

    // S'abonner AVANT initNetworkWatcher : la résolution du getStatus()
    // initial (async) est ainsi garantie d'être vue par cet abonné.
    const unsubscribeNetwork = useNetworkStore.subscribe((state, prev) => {
      const transition = classifyNetworkTransition(state, prev)
      if (transition === 'initial-connected') {
        reclaimIfAuthenticated()
      } else if (transition === 'went-online') {
        reclaimIfAuthenticated()
        if (useAppStore.getState().isAuthenticated) {
          useNotificationsStore.getState().syncPending().catch(() => {})
          void notifyConnectionRestored()
        }
      } else if (transition === 'went-offline' && useAppStore.getState().isAuthenticated) {
        void notify(connectionLostInput())
      }
    })
    const cleanupNetwork = initNetworkWatcher()

    return () => {
      unsubscribeNetwork()
      cleanupNetwork()
      cleanupNative()
    }
    // goBack is a stable zustand action reference; run this setup once.
  }, [goBack])

  if (online) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top), var(--safe-area-inset-top, 0px))' }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
       Hors ligne — reconnectez-vous pour enregistrer vos actions dans Supabase
    </div>
  )
}
