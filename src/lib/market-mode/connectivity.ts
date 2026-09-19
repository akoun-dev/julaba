/**
 * MODE-904 (§34) — indicateur de connectivité discret.
 *
 * Règle absolue du cahier des charges : « L'absence de réseau ne doit jamais
 * être traitée comme une panne » et « Ne pas présenter l'offline comme une
 * erreur ». Le builder est PUR (testé) — l'UI se contente de l'afficher.
 *
 * États (§34) :
 * - offline   : « Hors connexion » (+ « N opérations en attente ») ;
 * - syncing   : « Synchronisation… » (un flush offline est en vol) ;
 * - pending   : « N opérations en attente » (en ligne, sync à venir) ;
 * - synced    : « À jour ».
 */

export interface ConnectivityView {
  state: 'offline' | 'syncing' | 'pending' | 'synced'
  label: string
  detail: string | null
}

/** « 1 opération en attente » / « 3 opérations en attente ». */
export function pendingOperationsLabel(count: number): string {
  return `${count} opération${count > 1 ? 's' : ''} en attente`
}

export function buildConnectivityView(
  connected: boolean,
  pendingCount: number,
  flushing: boolean,
): ConnectivityView {
  if (!connected) {
    return {
      state: 'offline',
      label: 'Hors connexion',
      detail: pendingCount > 0 ? pendingOperationsLabel(pendingCount) : null,
    }
  }
  if (flushing) {
    return { state: 'syncing', label: 'Synchronisation…', detail: null }
  }
  if (pendingCount > 0) {
    return { state: 'pending', label: pendingOperationsLabel(pendingCount), detail: null }
  }
  return { state: 'synced', label: 'À jour', detail: null }
}
