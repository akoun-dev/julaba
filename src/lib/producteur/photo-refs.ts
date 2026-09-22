/**
 * PF-04 — résolution des références photo en URLs lisibles.
 *
 * photos[] peut contenir trois formes (coexistence voulue, rétro-
 * compatible avec les DataURL historiques déjà en base) :
 *  - `data:image/…`            → DataURL historique (laissée telle quelle) ;
 *  - `harvest-photos/<chemin>` → référence Storage (PF-04), à signer ;
 *  - `https://…`               → URL absolue déjà prête (laissée telle quelle).
 *
 * Module PUR : aucun appel réseau — la signature batch (un seul appel
 * createSignedUrls pour tout le GET) est à la charge de l'appelant.
 */

export const RECOLTE_PHOTOS_BUCKET = 'harvest-photos'
const STORAGE_REF_PREFIX = `${RECOLTE_PHOTOS_BUCKET}/`

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

export function isStorageRef(value: string): boolean {
  return value.startsWith(STORAGE_REF_PREFIX)
}

/** Parse la valeur DB de photos (string JSON, array ou null) — tolérante. */
export function parsePhotosJson(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'string' && value) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string')
      }
    } catch {
      // Ligne historique malformée : aucune photo résolue, jamais de 500.
      return []
    }
  }
  return []
}

/** Références Storage à signer (une fois chacune, ordre stable). */
export function collectStorageRefs(photos: string[]): string[] {
  const refs = photos.filter(isStorageRef)
  return [...new Set(refs)]
}

/**
 * Substitue les références par leur URL signée. `signed` associe la
 * référence (ex. `harvest-photos/p1/uuid.jpg`) à l'URL prête pour <img>.
 * Les entrées sans URL signée restent sous forme de référence (jamais de
 * crash d'affichage — le fallback visuel de l'écran s'applique).
 */
export function applySignedUrls(photos: string[], signed: ReadonlyMap<string, string>): string[] {
  return photos.map((photo) => {
    if (isStorageRef(photo)) {
      return signed.get(photo) ?? photo
    }
    return photo
  })
}
