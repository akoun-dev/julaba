'use client'

import { Capacitor } from '@capacitor/core'
import { Geolocation as CapacitorGeolocation } from '@capacitor/geolocation'
import type { MarketLocation } from '@/lib/stores/market-mode-store'

export async function captureMarketLocation(): Promise<MarketLocation> {
  if (Capacitor.isNativePlatform()) {
    const position = await CapacitorGeolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    })
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: Date.now(),
    }
  }

  if (!navigator.geolocation) throw new Error('Géolocalisation indisponible sur cet appareil')

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: Date.now(),
      }),
      (error) => reject(new Error(error.code === 1 ? 'Permission de localisation refusée' : 'Position indisponible')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
