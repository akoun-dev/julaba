/**
 * MODE-903 (§6) — géolocalisation au moment utile.
 *
 * Règles du cahier des charges :
 * - demander la permission uniquement quand elle est utile (activation du
 *   Mode Marché avec « position actuelle », ouverture de journée) ;
 * - un refus ne bloque JAMAIS le Mode Marché ;
 * - ne pas collecter la position en continu — une capture ponctuelle, à
 *   l'ouverture du marché ou sur une opération importante.
 *
 * Contrat technique (pattern `biometric-auth.ts`) : cette fonction ne lève
 * JAMAIS d'exception — elle retourne un état explicite. Moteur natif
 * Capacitor d'abord (Android), repli navigateur ensuite.
 */

import { Geolocation } from '@capacitor/geolocation'

export interface MarketPosition {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
}

export type GeoCaptureResult =
  | { status: 'captured'; position: MarketPosition }
  | { status: 'refused' }
  | { status: 'unavailable' }

const CAPTURE_TIMEOUT_MS = 10_000

/** Erreur web PERMISSION_DENIED (GeolocationPositionError.code 1). */
const WEB_PERMISSION_DENIED = 1

function toPosition(coords: {
  latitude: number
  longitude: number
  accuracy?: number | null
}, timestamp: number): MarketPosition {
  const position: MarketPosition = {
    lat: coords.latitude,
    lng: coords.longitude,
    timestamp,
  }
  if (typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)) {
    position.accuracy = coords.accuracy
  }
  return position
}

function captureWeb(): Promise<MarketPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation indisponible'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toPosition(pos.coords, pos.timestamp)),
      (err) => reject(new WebGeoError(err.code)),
      { enableHighAccuracy: true, timeout: CAPTURE_TIMEOUT_MS, maximumAge: 30_000 },
    )
  })
}

class WebGeoError extends Error {
  constructor(public readonly code: number) {
    super(`geolocation web erreur ${code}`)
    this.name = 'WebGeoError'
  }
}

async function captureNative(): Promise<MarketPosition> {
  const result = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: CAPTURE_TIMEOUT_MS,
  })
  return toPosition(result.coords, result.timestamp)
}

/**
 * Capture ponctuelle de la position — jamais bloquante, jamais throw.
 * Ordre : moteur natif Capacitor → repli navigateur. Un refus de permission
 * est rapporté comme `refused` (état normal, non bloquant) ; toute autre
 * impossibilité comme `unavailable`.
 */
export async function captureCurrentPosition(): Promise<GeoCaptureResult> {
  // 1) Moteur natif.
  try {
    const position = await captureNative()
    return { status: 'captured', position }
  } catch {
    // Natif indisponible (web, plugin absent, permission native refusée) →
    // on tente le repli navigateur, qui possède son propre verdict de refus.
  }

  // 2) Repli navigateur.
  try {
    const position = await captureWeb()
    return { status: 'captured', position }
  } catch (err) {
    if (err instanceof WebGeoError && err.code === WEB_PERMISSION_DENIED) {
      return { status: 'refused' }
    }
    return { status: 'unavailable' }
  }
}
