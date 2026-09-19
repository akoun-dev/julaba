/**
 * MODE-901 (§4-5) + MODE-902 (§7-8) — état du Mode Marché.
 *
 * Le Mode Marché est un ÉTAT LOCAL (D1 de PLAN_MARKET_MODE) : il module le
 * contexte et l'affichage, jamais les droits — l'offline-first est déjà la
 * nature de l'app. Tant que le mode n'est pas activé, le comportement
 * historique est intact : aucune session marché n'est construite, rien ne
 * part en file.
 *
 * Sens de dépendance STRICTEMENT unidirectionnel (piège d'audit §1.3-1) :
 * caisse-store → market-mode-store (les stats de caisse sont passées en
 * arguments) — market-mode-store n'importe JAMAIS caisse-store.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queuePendingSync } from '@/lib/offline-db'
import {
  buildMarketSessionOpen,
  buildMarketSessionClosed,
  type LocationMode,
  type MarketPosition,
  type MarketSessionRecord,
} from './market-session'

export type GpsStatus = 'idle' | 'captured' | 'refused' | 'unavailable'

export interface MarketModeMarketConfig {
  name: string | null
  locationMode: LocationMode
}

export interface ActivateMarketModeInput {
  marketName: string | null
  locationMode: LocationMode
}

export interface SessionOpenedInput {
  merchantId: string
  sessionId: string
  fondDeCaisse: number
  openedAt: string
}

export interface SessionClosedInput {
  sessionId: string
  closedAt: string
  countedCash: number | null
  salesTotal: number
  expensesTotal: number
}

interface MarketModeState {
  activated: boolean
  market: MarketModeMarketConfig
  lastPosition: MarketPosition | null
  gpsStatus: GpsStatus
  /** Dernière session de journée connue localement (contexte §7-8). */
  lastSession: MarketSessionRecord | null

  activateMarketMode: (config: ActivateMarketModeInput) => void
  deactivate: () => void
  setPosition: (position: MarketPosition) => void
  markGpsRefused: () => void
  markGpsUnavailable: () => void

  /** Appelé par caisse-store à l'ouverture de la caisse (point unique). */
  onSessionOpened: (input: SessionOpenedInput) => Promise<void>
  /** Appelé par caisse-store à la clôture (point unique). */
  onSessionClosed: (input: SessionClosedInput) => Promise<void>
  /**
   * Re-file le contexte de la session OUVERTE avec la dernière position
   * connue (après une capture §6 réussie à l'ouverture). No-op si aucune
   * session ouverte — même clientId, upsert idempotent.
   */
  onPositionCaptured: () => Promise<void>
}

export const useMarketModeStore = create<MarketModeState>()(
  persist(
    (set, get) => ({
      activated: false,
      market: { name: null, locationMode: 'none' },
      lastPosition: null,
      gpsStatus: 'idle',
      lastSession: null,

      activateMarketMode: (config) =>
        set({ activated: true, market: { name: config.marketName, locationMode: config.locationMode } }),

      deactivate: () =>
        set({ activated: false, lastSession: null }),

      setPosition: (position) =>
        set({ lastPosition: position, gpsStatus: 'captured' }),

      markGpsRefused: () => set({ gpsStatus: 'refused' }),

      markGpsUnavailable: () => set({ gpsStatus: 'unavailable' }),

      onSessionOpened: async (input) => {
        if (!get().activated) return
        const market = get().market
        // §6 — la position ne part qu'en mode « gps », sinon jamais.
        const position = market.locationMode === 'gps' ? get().lastPosition : null
        const record = buildMarketSessionOpen({
          merchantId: input.merchantId,
          sessionId: input.sessionId,
          fondDeCaisse: input.fondDeCaisse,
          openedAt: input.openedAt,
          config: { marketName: market.name, locationMode: market.locationMode },
          position,
        })
        set({ lastSession: record })
        // File offline standard : le rejeu rejoue le MÊME payload, le serveur
        // upserte par client_id (§31-32). L'échec de mise en file n'empêche
        // jamais l'ouverture de la caisse (le contexte est de toute façon
        // conservé dans lastSession, persisté localement).
        await queuePendingSync('market-session', record)
      },

      onSessionClosed: async (input) => {
        if (!get().activated) return
        const open = get().lastSession
        // Garde de cohérence : on ne clôt que la session localement connue.
        if (!open || open.clientId !== input.sessionId) return
        const record = buildMarketSessionClosed({
          open,
          closedAt: input.closedAt,
          countedCash: input.countedCash,
          salesTotal: input.salesTotal,
          expensesTotal: input.expensesTotal,
        })
        set({ lastSession: record })
        await queuePendingSync('market-session', record)
      },

      onPositionCaptured: async () => {
        const open = get().lastSession
        if (!get().activated || !open || open.status !== 'open') return
        // Reconstruction depuis lastSession : mêmes champs d'ouverture,
        // position rafraîchie si le mode le permet (§6).
        const market = get().market
        const position = market.locationMode === 'gps' ? get().lastPosition : null
        const record = buildMarketSessionOpen({
          merchantId: open.merchantId,
          sessionId: open.clientId,
          fondDeCaisse: open.startingCash,
          openedAt: open.startedAt,
          config: { marketName: market.name, locationMode: market.locationMode },
          position,
        })
        set({ lastSession: record })
        await queuePendingSync('market-session', record)
      },
    }),
    {
      name: 'julaba-market-mode-store',
      // Convention dépôt : persist minimal (pas de version/migrate). La
      // position est persistée : elle est capturée ponctuellement et sert à
      // l'ouverture suivante si l'utilisateur a choisi le mode « gps ».
      partialize: (state) => ({
        activated: state.activated,
        market: state.market,
        lastPosition: state.lastPosition,
        gpsStatus: state.gpsStatus,
        lastSession: state.lastSession,
      }),
    }
  )
)
