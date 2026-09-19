/**
 * MODE-902 (§7-8) — session de journée marché.
 *
 * La session de caisse (`caisse-store`) reste la source de vérité des
 * montants ; l'enregistrement `market-session` porte le CONTEXTE de la
 * journée (marché, position, caisse de départ, clôture) et part dans la
 * file offline standard. Il est construit par des builders PURS (testés)
 * et envoyé en upsert idempotent : le rejeu offline rejoue le MÊME payload
 * et le serveur reconnaît `client_id` (§31-32 du cahier des charges).
 *
 * Champs posés par le cahier des charges (§7) : id, userId, marketId,
 * startedAt, startingCash, location, status — déclinés ici en :
 * clientId (= id de session de caisse), merchantId, marketName,
 * locationMode, latitude/longitude/accuracyM, startedAt, startingCash,
 * status (+ champs de clôture §8 : closedAt, endingCash, salesTotal,
 * expensesTotal).
 */

export type LocationMode = 'gps' | 'select' | 'none'

export interface MarketModeConfig {
  /** Nom de marché résolu (null si « ne pas enregistrer la position »). */
  marketName: string | null
  locationMode: LocationMode
}

export interface MarketPosition {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
}

/** Enregistrement upserté sur POST /api/marchand/market-sessions. */
export interface MarketSessionRecord {
  merchantId: string
  clientId: string
  marketName: string | null
  locationMode: LocationMode
  latitude: number | null
  longitude: number | null
  accuracyM: number | null
  startedAt: string
  startingCash: number
  status: 'open' | 'closed'
  closedAt: string | null
  endingCash: number | null
  salesTotal: number | null
  expensesTotal: number | null
}

export interface OpenSessionInput {
  merchantId: string
  /** Id de la session de caisse — sert de clientId d'idempotence. */
  sessionId: string
  fondDeCaisse: number
  openedAt: string
  config: MarketModeConfig
  position: MarketPosition | null
}

/** La position n'est collectée qu'en mode « gps » — jamais autrement (§6). */
function positionFields(position: MarketPosition | null, locationMode: LocationMode) {
  if (locationMode !== 'gps' || !position) {
    return { latitude: null, longitude: null, accuracyM: null }
  }
  return {
    latitude: position.lat,
    longitude: position.lng,
    accuracyM: typeof position.accuracy === 'number' ? position.accuracy : null,
  }
}

export function buildMarketSessionOpen(input: OpenSessionInput): MarketSessionRecord {
  const marketName = input.config.locationMode === 'none' ? null : input.config.marketName
  return {
    merchantId: input.merchantId,
    clientId: input.sessionId,
    marketName,
    locationMode: input.config.locationMode,
    ...positionFields(input.position, input.config.locationMode),
    startedAt: input.openedAt,
    startingCash: input.fondDeCaisse,
    status: 'open',
    closedAt: null,
    endingCash: null,
    salesTotal: null,
    expensesTotal: null,
  }
}

export interface CloseSessionInput {
  open: MarketSessionRecord
  closedAt: string
  /** Caisse réellement comptée — sinon estimation §8 (départ + ventes − dépenses). */
  countedCash: number | null
  salesTotal: number
  expensesTotal: number
}

export function buildMarketSessionClosed(input: CloseSessionInput): MarketSessionRecord {
  const estimated =
    input.open.startingCash + (input.salesTotal ?? 0) - (input.expensesTotal ?? 0)
  return {
    ...input.open,
    status: 'closed',
    closedAt: input.closedAt,
    endingCash: input.countedCash ?? estimated,
    salesTotal: input.salesTotal,
    expensesTotal: input.expensesTotal,
  }
}
