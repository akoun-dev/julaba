/**
 * MODE-979 (DET-COOP-008) — proximité géographique coopérative.
 *
 * Fondation du tri Haversine de la parité julaba-app §4.3 : les
 * « Récoltes prévues » d'un grossiste membre sont triées par distance
 * depuis la commune de SA coopérative de référence. La dette était
 * double : commune coopérative en texte libre (aucune position) et
 * producteurs sans commune — les récoltes étaient donc « non triables ».
 *
 * Le module est PUR (aucun réseau, aucune base) : les routes
 * /api/cooperatives/recoltes-prevues et /api/cooperatives/commune
 * appellent ces fonctions avec les coordonnées lues dans le
 * référentiel `communes` (41 communes GPS, migration 20260922100000).
 *
 * Convention d'honnêteté : si la coopérative n'a PAS de commune liée,
 * il n'existe aucune distance à calculer — le tri retombe sur la date
 * seule (le plus récent d'abord) et chaque récolte reçoit
 * distanceKm = null. JAMAIS de distance approximative inventée.
 */

export interface Coords {
  lat: number
  lng: number
}

/** Récolte enrichie de proximité (entrée/sortie du tri). */
export interface RecolteProximite {
  dateRecolte: string
  distanceKm: number | null
  tranche: TrancheProximite | null
  /** Commune du producteur, jointe par la route (nullable). */
  commune?: Coords | null
}

export const TRANCHES_PROXIMITE = [
  { cle: 'proche', maxKm: 25, libelle: 'Proximité' },
  { cle: 'moyenne', maxKm: 100, libelle: 'Moyenne distance' },
  { cle: 'loin', maxKm: Infinity, libelle: 'Longue distance' },
] as const

export type TrancheProximite = (typeof TRANCHES_PROXIMITE)[number]['cle']

const RAYON_TERRE_KM = 6371

function enRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Distance orthodromique (Haversine) entre deux points, en kilomètres
 * arrondis au km entier. La précision du référentiel (centre de commune,
 * ~1 km) et le rendu à l'écran (« ~34 km ») rendent la décimale
 * illusoire : on l'arrondit dès la frontière du module.
 */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = enRadians(b.lat - a.lat)
  const dLng = enRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(enRadians(a.lat)) * Math.cos(enRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h)))
}

/**
 * Tranche de proximité d'une distance — null si la distance est nulle
 * (coordonnées absentes) : la tranche n'est jamais devinée.
 */
export function trancheProximite(km: number | null): TrancheProximite | null {
  if (km == null) return null
  for (const t of TRANCHES_PROXIMITE) {
    if (km <= t.maxKm) return t.cle
  }
  return 'loin'
}

/**
 * Enrichit et trie des récoltes par proximité depuis la coopérative :
 *   - coordsCoop connues  → distance + tranche, tri par distance
 *     croissante puis par date (plus récente d'abord) pour les ex æquo ;
 *   - coordsCoop absentes → distanceKm/tranche null, tri par date seule.
 * Le tri est PUR : la liste en entrée n'est jamais mutée.
 */
export function trierRecoltesParProximite<T extends RecolteProximite>(
  recoltes: T[],
  coordsCoop: Coords | null
): T[] {
  const enrichies = recoltes.map((r) => {
    // Honnêteté : une récolte sans commune producteur jointe (ou une
    // coopérative sans commune) n'a AUCUNE distance — jamais de calcul
    // depuis des coordonnées par défaut (0,0) ou partielles.
    if (!coordsCoop || !r.commune) {
      return { ...r, distanceKm: null, tranche: null }
    }
    const d = distanceKm(coordsCoop, r.commune)
    return { ...r, distanceKm: d, tranche: trancheProximite(d) }
  })
  // distanceKm null (récolte sans commune producteur) passe en fin de
  // liste, après les récoltes localisées — jamais masquée, jamais en tête.
  enrichies.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) {
      if (a.distanceKm == null) return 1
      if (b.distanceKm == null) return -1
      return a.distanceKm - b.distanceKm
    }
    return (b.dateRecolte ?? '').localeCompare(a.dateRecolte ?? '')
  })
  return enrichies
}
