// AUDIT-013 (MODE-1014) — médias d'enrôlement : validation serveur des
// pièces (photo acteur, CNI recto/verso) et téléversement dans le bucket
// Storage PRIVÉ `enrolments-media`.
//
// D'où ça vient : le POST /api/backoffice/enrolments ne recevait que des
// indicateurs hasPhoto/hasCniRecto/hasCniVerso (AUDIT-013 P1) — les images
// restaient sur l'appareil. Le client envoie désormais les DataURL base64
// capturées au wizard ; ce module les valide (mime + cap dur décodé) puis
// les dépose dans Storage, la route ne stockant en DB que les CHEMINS.
//
// Le module est PUR (aucun import Next/Supabase) : le client Storage est
// passé en paramètre (même pattern que creerAdhesionDepuisEnrolement) et
// sa surface est typée structurellement — le client admin réel (DET-008,
// typé `any`) s'y conforme tel quel, les tests injectent un double.
//
// NB : la whitelist mime est LA MÊME que la voie producteur
// (src/lib/storage/device-upload.ts, dataUrlToBlob) — image/jpeg|png|webp,
// ce que le plugin Camera Capacitor produit réellement.

/** Bucket privé créé par la migration 20260925160000_enrolments_media.sql.
 *  Aucune policy publique : lecture/écriture uniquement via le client admin
 *  (service_role) — l'affichage back-office passera plus tard par des URLs
 *  signées, jamais par un objet public. */
export const ENROLMENTS_MEDIA_BUCKET = 'enrolments-media'

/** Cap dur par pièce, binaire DÉCODÉ (la base64 voyage à ~+33 %). */
export const ENROLMENTS_MEDIA_MAX_BYTES = 2 * 1024 * 1024

const MIME_PAR_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type EnrolmentsMediaMime = keyof typeof MIME_PAR_EXTENSION

export type EnrolmentMediaKind = 'photo' | 'cni-recto' | 'cni-verso'

export interface ParsedEnrolmentMedia {
  mime: EnrolmentsMediaMime
  /** Contenu décodé — Buffer (Node) accepté par supabase-js Storage. */
  bytes: Buffer
}

export type MediaParseRaison = 'format' | 'mime' | 'trop_lourd'

export type ParseEnrolmentMediaResult =
  | { ok: true; media: ParsedEnrolmentMedia }
  | { ok: false; raison: MediaParseRaison }

/**
 * Valide une pièce transmise en DataURL base64 (`data:image/jpeg;base64,…`).
 *  - 'format'    : pas une DataURL base64 (payload altéré) ;
 *  - 'mime'      : type hors whitelist image/jpeg|png|webp ;
 *  - 'trop_lourd': binaire décodé au-delà du cap de 2 Mo.
 * La route traduit ces raisons en 415 / 413 avec le contrat { erreur }.
 */
export function parseEnrolmentMedia(value: unknown): ParseEnrolmentMediaResult {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, raison: 'format' }
  }
  // Même regex que la voie producteur (device-upload.ts) : une pièce
  // enrôlement est forcément une capture image base64.
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value)
  if (!match) {
    // data: présent mais type exotique → mime ; chaîne quelconque → format.
    if (value.startsWith('data:')) return { ok: false, raison: 'mime' }
    return { ok: false, raison: 'format' }
  }
  const mime = match[1] as EnrolmentsMediaMime
  const base64 = match[2]
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.byteLength > ENROLMENTS_MEDIA_MAX_BYTES) {
    return { ok: false, raison: 'trop_lourd' }
  }
  return { ok: true, media: { mime, bytes } }
}

export function extensionPourMime(mime: EnrolmentsMediaMime): string {
  return MIME_PAR_EXTENSION[mime]
}

/** Chemin Storage : {enrolmentId}/{kind}-{timestamp}.{ext} — le préfixe par
 *  dossier isole chaque enrôlement (même convention que harvest-photos). */
export function cheminMediaEnrolement(enrolmentId: string, kind: EnrolmentMediaKind, mime: EnrolmentsMediaMime, now: number = Date.now()): string {
  return `${enrolmentId}/${kind}-${now}.${extensionPourMime(mime)}`
}

/** Colonnes de chemins écrites dans legacy_bo_enrolments
 *  (migration 20260925160000 — ADDITIVE). */
export interface EnrolmentMediaPaths {
  photo_path?: string
  cni_recto_path?: string
  cni_verso_path?: string
}

/** Surface Storage minimale utilisée ici (client admin réel ou double de test). */
interface StorageBucketLike {
  upload: (path: string, body: Buffer, opts: { contentType: string }) => Promise<{ data: { path: string } | null; error: { message: string } | null }>
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>
}

interface StorageClientLike {
  storage: { from: (bucket: string) => StorageBucketLike }
}

/**
 * Téléverse chaque pièce validée dans le bucket privé et retourne les
 * chemins à persister. Lève à la PREMIÈRE erreur — la route annule alors
 * l'insertion du dossier (rollback), pour qu'un dossier ne soit jamais
 * visible au back-office sans ses pièces (l'appareil remettra en file et
 * re-téléversera). Les pièces déjà déposées avant l'échec sont retirées en
 * best-effort pour ne pas laisser d'orphelins.
 */
export async function televerserMediasEnrolement(
  supabase: StorageClientLike,
  enrolmentId: string,
  medias: { kind: EnrolmentMediaKind; media: ParsedEnrolmentMedia }[]
): Promise<EnrolmentMediaPaths> {
  const bucket = supabase.storage.from(ENROLMENTS_MEDIA_BUCKET)
  const paths: EnrolmentMediaPaths = {}
  const deposes: string[] = []
  try {
    for (const { kind, media } of medias) {
      const path = cheminMediaEnrolement(enrolmentId, kind, media.mime)
      const { error } = await bucket.upload(path, media.bytes, { contentType: media.mime })
      if (error) throw new Error(`Téléversement ${kind} impossible : ${error.message}`)
      deposes.push(path)
      if (kind === 'photo') paths.photo_path = path
      else if (kind === 'cni-recto') paths.cni_recto_path = path
      else paths.cni_verso_path = path
    }
  } catch (err) {
    if (deposes.length > 0) {
      try {
        await bucket.remove(deposes)
      } catch {
        // Orphelins assumés — l'échec original prime, jamais masqué.
      }
    }
    throw err
  }
  return paths
}
