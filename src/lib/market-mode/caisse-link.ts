/**
 * MODE-902 (§7-8) — lien caisse ↔ Mode Marché.
 *
 * Point UNIQUE de branchement : caisse-store importe ce module (et lui seul)
 * ; aucun des modules ici n'importe caisse-store (les sessions et stats sont
 * passées en arguments, types structurels) — aucune dépendance circulaire.
 *
 * Le store de référence est celui de l'écran Mode Marché
 * (`src/lib/stores/market-mode-store.ts` — fusion UNION 0b209d4) ; ce lien
 * y lit la configuration (enabled, locationChoice, marketName, location) et
 * construit l'enregistrement de journée marché via les builders purs de
 * `market-session.ts`, mis en file offline standard (upsert idempotent par
 * client_id côté serveur).
 *
 * Règles :
 * - Mode Marché inactif → no-op strict (comportement historique intact) ;
 * - jamais bloquant : toute erreur est avalée, l'ouverture ou la clôture de
 *   caisse ne dépend jamais de la mise en file ;
 * - §6 — position capturée ponctuellement À L'OUVERTURE (mode « position
 *   actuelle » seulement), jamais en continu ; un refus est simplement
 *   consigné dans le store (`locationStatus`).
 */

import { useAppStore } from '@/lib/stores/app-store'
import { useMarketModeStore } from '@/lib/stores/market-mode-store'
import { captureCurrentPosition } from './geo'
import {
  buildMarketSessionOpen,
  buildMarketSessionClosed,
  type LocationMode,
  type MarketPosition,
  type MarketSessionRecord,
} from './market-session'

/** Forme structurelle minimale d'une session de caisse (évite tout import de caisse-store). */
export interface CaisseSessionLike {
  id: string
  fondDeCaisse: number
  openedAt: string
  closedAt?: string | null
}

export interface CaisseDayStatsLike {
  todaySales: number
  todayExpenses: number
}

interface MarketSnapshot {
  activated: boolean
  locationMode: LocationMode
  marketName: string | null
  position: MarketPosition | null
}

/** Lit la configuration du store du Mode Marché (contrat de l'écran). */
function readMarketSnapshot(): MarketSnapshot {
  const market = useMarketModeStore.getState()
  const locationMode: LocationMode =
    market.locationChoice === 'current' ? 'gps' : market.locationChoice === 'market' ? 'select' : 'none'
  const activated = market.enabled
  const position: MarketPosition | null =
    market.locationChoice === 'current' && market.location
      ? {
          lat: market.location.latitude,
          lng: market.location.longitude,
          accuracy: market.location.accuracy ?? undefined,
          timestamp: market.location.capturedAt,
        }
      : null
  return {
    activated,
    locationMode,
    marketName: market.locationChoice === 'market' ? market.marketName || null : null,
    position,
  }
}

export function handleCaisseSessionOpened(session: CaisseSessionLike): void {
  const snapshot = readMarketSnapshot()
  if (!snapshot.activated) return

  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return

  const queueRecord = (record: MarketSessionRecord): Promise<void> =>
    import('@/lib/offline-db').then(({ queuePendingSync }) => queuePendingSync('market-session', record).then(() => undefined))

  void buildAndQueue(snapshot, merchantId, session, queueRecord)

  function buildAndQueue(
    snap: MarketSnapshot,
    merchant: string,
    caisseSession: CaisseSessionLike,
    queue: (record: MarketSessionRecord) => Promise<void>,
  ): Promise<void> {
    const record = buildMarketSessionOpen({
      merchantId: merchant,
      sessionId: caisseSession.id,
      fondDeCaisse: caisseSession.fondDeCaisse,
      openedAt: caisseSession.openedAt,
      config: { marketName: snap.marketName, locationMode: snap.locationMode },
      position: snap.position,
    })
    useMarketModeStore.setState({ lastMarketSession: record })
    return queue(record)
  }

  // §6 — rafraîchissement ponctuel de la position à l'ouverture (mode
  // « position actuelle ») puis re-file du contexte mis à jour (même
  // clientId, upsert idempotent). Jamais bloquant, jamais en continu.
  if (snapshot.locationMode === 'gps') {
    void captureCurrentPosition()
      .then((result) => {
        const store = useMarketModeStore.getState()
        if (result.status === 'captured') {
          store.setLocation({
            latitude: result.position.lat,
            longitude: result.position.lng,
            accuracy: result.position.accuracy ?? null,
            capturedAt: result.position.timestamp,
          })
          const refreshed = readMarketSnapshot()
          if (!refreshed.activated || !useAppStore.getState().merchantId) return
          const updated = buildMarketSessionOpen({
            merchantId,
            sessionId: session.id,
            fondDeCaisse: session.fondDeCaisse,
            openedAt: session.openedAt,
            config: { marketName: refreshed.marketName, locationMode: refreshed.locationMode },
            position: refreshed.position,
          })
          useMarketModeStore.setState({ lastMarketSession: updated })
          void queueRecord(updated)
        } else if (result.status === 'refused') {
          store.setLocationStatus('refused')
        } else {
          store.setLocationStatus('unavailable')
        }
      })
      .catch(() => {})
  }
}

export function handleCaisseSessionClosed(
  session: CaisseSessionLike,
  countedCash: number | null,
  stats: CaisseDayStatsLike,
): void {
  const snapshot = readMarketSnapshot()
  if (!snapshot.activated) return
  if (!session.closedAt) return
  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return

  // La session locale connue : on ne clôt que celle ouverte précédemment
  // (garde de cohérence par clientId).
  const open = useMarketModeStore.getState().lastMarketSession
  if (!open || open.clientId !== session.id) return

  const record = buildMarketSessionClosed({
    open,
    closedAt: session.closedAt,
    countedCash,
    salesTotal: stats.todaySales,
    expensesTotal: stats.todayExpenses,
  })
  useMarketModeStore.setState({ lastMarketSession: record })
  void import('@/lib/offline-db')
    .then(({ queuePendingSync }) => queuePendingSync('market-session', record))
    .then(() => undefined)
    .catch(() => {})
}
