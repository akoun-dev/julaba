/**
 * MODE-902 (§7-8) — lien caisse ↔ Mode Marché.
 *
 * Point UNIQUE de branchement : caisse-store importe ce module (et lui seul)
 * ; aucun des modules ici n'importe caisse-store (les sessions et stats sont
 * passées en arguments, types structurels) — aucune dépendance circulaire.
 *
 * Règles :
 * - Mode Marché inactif → no-op strict (comportement historique intact) ;
 * - jamais bloquant : toute erreur est avalée et journalisée, l'ouverture
 *   ou la clôture de caisse ne dépend jamais de la mise en file ;
 * - §6 — position capturée ponctuellement À L'OUVERTURE (mode « gps »
 *   seulement), jamais en continu ; un refus est simplement consigné.
 */

import { useAppStore } from '@/lib/stores/app-store'
import { captureCurrentPosition } from './geo'
import { useMarketModeStore } from './market-mode-store'

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

export function handleCaisseSessionOpened(session: CaisseSessionLike): void {
  const market = useMarketModeStore.getState()
  if (!market.activated) return

  const merchantId = useAppStore.getState().merchantId
  if (!merchantId) return

  void market
    .onSessionOpened({
      merchantId,
      sessionId: session.id,
      fondDeCaisse: session.fondDeCaisse,
      openedAt: session.openedAt,
    })
    .then(() => {
      const current = useMarketModeStore.getState()
      if (!current.activated) return
      if (current.market.locationMode !== 'gps') return
      // Capture ponctuelle §6 — puis re-file du contexte mis à jour (même
      // clientId, upsert idempotent côté serveur).
      void captureCurrentPosition()
        .then((result) => {
          const store = useMarketModeStore.getState()
          if (result.status === 'captured') {
            store.setPosition(result.position)
            void store.onPositionCaptured()
          } else if (result.status === 'refused') {
            store.markGpsRefused()
          } else {
            store.markGpsUnavailable()
          }
        })
        .catch(() => {})
    })
    .catch(() => {
      // La file offline est le chemin normal (offline-first) : un échec de
      // mise en file ne doit jamais empêcher la journée de commencer.
    })
}

export function handleCaisseSessionClosed(
  session: CaisseSessionLike,
  countedCash: number | null,
  stats: CaisseDayStatsLike,
): void {
  const market = useMarketModeStore.getState()
  if (!market.activated) return
  if (!session.closedAt) return

  void market
    .onSessionClosed({
      sessionId: session.id,
      closedAt: session.closedAt,
      countedCash,
      salesTotal: stats.todaySales,
      expensesTotal: stats.todayExpenses,
    })
    .catch(() => {})
}
