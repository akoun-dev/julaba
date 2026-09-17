import { create } from 'zustand'
import { Network, type ConnectionStatus, type ConnectionType } from '@capacitor/network'

/**
 * Source de vérité unique pour l'état réseau de l'app (Task 30).
 *
 * Avant ce store, chaque consommateur gérait le sien : le CapacitorProvider
 * avait son propre listener + useState pour le bandeau « Hors ligne », le
 * watcher de notifications son propre onlineRef, use-network-status son
 * propre listener par composant, et deux écrans lisaient navigator.onLine
 * en direct (un îlot qui ignore le plugin natif). Désormais UN listener
 * natif (@capacitor/network — qui fonctionne aussi sur web via
 * navigator.onLine) alimente ce store, et tout le monde s'y abonne.
 *
 * `connected` démarre à true (optimiste, comportement historique) : aucun
 * écran ne doit flasher « Hors ligne » pendant que le premier getStatus()
 * est en vol. `hydrated` passe à true une fois ce premier statut résolu —
 * les abonnés s'en servent pour distinguer la résolution initiale d'une
 * vraie transition (voir classifyNetworkTransition).
 */
export interface NetworkState {
  connected: boolean
  connectionType: ConnectionType | null
  hydrated: boolean
  setStatus: (status: ConnectionStatus) => void
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  connected: true,
  connectionType: null,
  hydrated: false,
  setStatus: (status) =>
    set({
      connected: status.connected,
      connectionType: status.connectionType,
      hydrated: true,
    }),
}))

// Singleton : le provider racine initialise, les autres consommateurs
// s'abonnent au store sans jamais re-poser de listener natif.
let watcherCleanup: (() => void) | null = null

/**
 * Démarre le watcher réseau global (idempotent) : statut initial + listener
 * networkStatusChange vers le store. Retourne le cleanup — appelé une seule
 * fois, le retour nettoie le listener natif et ré-arme le singleton.
 */
export function initNetworkWatcher(): () => void {
  if (watcherCleanup) return watcherCleanup

  Network.getStatus()
    .then((status) => useNetworkStore.getState().setStatus(status))
    .catch(() => {
      // Statut indéterminable (plugin indisponible, web exotique) : on
      // s'hydrate quand même pour que les abonnés sachent que plus rien
      // n'arrivera de ce côté — l'optimisme connected:true reste en vigueur.
      useNetworkStore.setState({ hydrated: true })
    })

  const handlePromise = Network.addListener('networkStatusChange', (status) => {
    useNetworkStore.getState().setStatus(status)
  })

  watcherCleanup = () => {
    handlePromise
      .then((handle) => handle.remove())
      .catch(() => {})
    watcherCleanup = null
  }
  return watcherCleanup
}

export interface NetworkSnapshot {
  connected: boolean
  hydrated: boolean
}

export type NetworkTransition =
  /** Rien à faire (pas de changement, ou hydratation pas encore prête). */
  | 'none'
  /** Premier statut résolu, en ligne : session à re-claimer éventuellement. */
  | 'initial-connected'
  /** Premier statut résolu, hors ligne : pas de notification (pas une perte). */
  | 'initial-offline'
  /** Reconnexion effective : reclaim + sync + « connexion rétablie ». */
  | 'went-online'
  /** Perte effective : info « connexion instable » (dédup horaire). */
  | 'went-offline'

/**
 * Classe la transition entre deux snapshots du store — pure, testée. Le
 * premier statut résolu (hydrated false → true) n'est JAMAIS une perte ni
 * un rétablissement : l'app vient de démarrer, pas de notifier l'utilisateur
 * qu'elle est « hors ligne » alors qu'elle ne faisait que s'initialiser.
 */
export function classifyNetworkTransition(next: NetworkSnapshot, prev: NetworkSnapshot): NetworkTransition {
  if (next.hydrated && !prev.hydrated) {
    return next.connected ? 'initial-connected' : 'initial-offline'
  }
  if (!prev.hydrated || !next.hydrated) return 'none'
  if (next.connected === prev.connected) return 'none'
  return next.connected ? 'went-online' : 'went-offline'
}
