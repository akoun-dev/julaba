'use client'

/**
 * MODE-903 (§6) — capture de la position du marché, contrat de l'écran
 * (peut lever — l'écran affiche l'erreur et le Mode Marché continue).
 *
 * Fusion UNION 0b209d4 : le MOTEUR unique est `captureCurrentPosition()`
 * (src/lib/market-mode/geo.ts) — natif Capacitor puis repli navigateur,
 * timeout, états explicites, jamais de throw en interne. Cette façade
 * convertit le résultat en `MarketLocation` (contrat du store/écran) et
 * lève une erreur FORMULÉE sur refus/indisponibilité — jamais d'erreur
 * technique brute.
 */

import type { MarketLocation } from '@/lib/stores/market-mode-store'
import { captureCurrentPosition } from '@/lib/market-mode/geo'

export async function captureMarketLocation(): Promise<MarketLocation> {
  const result = await captureCurrentPosition()

  if (result.status === 'captured') {
    return {
      latitude: result.position.lat,
      longitude: result.position.lng,
      accuracy: result.position.accuracy ?? null,
      capturedAt: result.position.timestamp,
    }
  }

  throw new Error(
    result.status === 'refused'
      ? 'Permission de localisation refusée'
      : 'Position indisponible',
  )
}
