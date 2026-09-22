import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  RECOLTE_PHOTOS_BUCKET,
  applySignedUrls,
  collectStorageRefs,
  parsePhotosJson,
} from './photo-refs'

/**
 * MODE-979 — résolution SERVEUR des URLs de photos, partagée par les
 * routes qui servent des lignes de récoltes (GET /api/producteur/recoltes
 * et GET /api/cooperatives/recoltes-prevues).
 *
 * PF-04 : remplace les références Storage (`harvest-photos/…`) par des
 * URLs de lecture signées (1 h, batch : UN appel createSignedUrls pour
 * tout le GET). Les DataURL historiques et les URL absolues passent
 * intactes. Aucune erreur de signature ne fait échouer le GET : les
 * références restent sous forme brute (fallback visuel de l'écran).
 */
export async function resoudreUrlsPhotosLignes(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  lignes: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const parsedByRow = lignes.map((r) => parsePhotosJson(r.photos))
  const refs = [...new Set(parsedByRow.flatMap((photos) => collectStorageRefs(photos)))]
  const signed = new Map<string, string>()
  if (refs.length > 0) {
    const { data } = await supabase.storage
      .from(RECOLTE_PHOTOS_BUCKET)
      .createSignedUrls(refs.map((ref) => ref.slice(`${RECOLTE_PHOTOS_BUCKET}/`.length)), 3600)
    for (const item of data ?? []) {
      if (item && !item.error && item.signedUrl) {
        signed.set(`${RECOLTE_PHOTOS_BUCKET}/${item.path}`, item.signedUrl)
      }
    }
  }
  return lignes.map((r, i) => ({
    ...r,
    photos: applySignedUrls(parsedByRow[i], signed),
  }))
}
