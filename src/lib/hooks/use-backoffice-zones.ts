'use client'

import { useEffect, useState } from 'react'

// Mirrors the seeded BoZone rows so zone selects still work if the fetch
// fails or the caller's role can't read /api/backoffice/zones (e.g.
// operateur_terrain) — the live list from the API is preferred once it loads.
// Previously each screen (mutations, communications, scores) hardcoded its
// own zone list, and the three disagreed with each other and with the real
// BoZone table (e.g. "Plateau"/"Abobo" appeared nowhere in the database).
const FALLBACK_ZONES = ['Adjamé', 'Bouaké', 'Cocody', 'Kong', 'Korhogo', 'Marcory', 'San-Pédro', 'Yopougon']

/** Zone names for filter/select dropdowns, sourced from the real BoZone table. */
export function useBackofficeZoneNames(): string[] {
  const [zones, setZones] = useState<string[]>(FALLBACK_ZONES)

  useEffect(() => {
    let cancelled = false
    fetch('/api/backoffice/zones')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { name: string }[]) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setZones(data.map((z) => z.name).sort((a, b) => a.localeCompare(b)))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return zones
}
