/**
 * PF-04 — pipeline photo côté APPAREIL (sessions device, hors auth.users).
 *
 * Les captures Camera arrivent en DataURL base64 (`photo.dataUrl`). Avant
 * PF-04, ces chaînes partaient telles quelles dans le POST récoltes et
 * étaient stockées JSON-stringifiées en base (lignes de plusieurs Mo).
 *
 * APRÈS : au flush de synchronisation (handler `recolte-create`), chaque
 * entrée `data:` est convertie en Blob puis uploadée DIRECTEMENT au
 * Storage via une URL signée obtenue de
 * `/api/v1/storage/sign-upload-device` (authentification par token, PAS
 * par JWT — le serveur ne proxifie jamais le binaire). La récolte part
 * ensuite avec des RÉFÉRENCES `harvest-photos/<…>` au lieu de DataURL.
 *
 * Contrat d'échec : toute erreur lève — l'opération RESTE dans la file
 * offline et sera rejouée (aucune récolte ne part avec des photos
 * manquantes). Hors ligne, le fetch échoue naturellement → file intacte.
 * Les DataURL restent valables pour l'affichage local (offline-first).
 */

const DATA_URL_MAX_BYTES = 8 * 1024 * 1024 // 8 Mo de base64 ≈ 6 Mo de binaire

export const RECOLTE_PHOTOS_BUCKET = 'harvest-photos'

/** Préfixe des références storage (bucket inclus) inscrites dans photos[]. */
const STORAGE_REF_PREFIX = `${RECOLTE_PHOTOS_BUCKET}/`

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

export function isStorageRef(value: string): boolean {
  return value.startsWith(STORAGE_REF_PREFIX)
}

/** Convertit `data:<mime>;base64,<payload>` en Blob. Lève si invalide. */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new Error('DataURL photo invalide (mime non image ou encodage inattendu)')
  }
  const [, contentType, base64] = match
  if (base64.length > DATA_URL_MAX_BYTES) {
    throw new Error(`Photo trop volumineuse (${Math.round(base64.length / 1024 / 1024)} Mo de base64)`)
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: contentType }), contentType }
}

export interface SignedUploadTicket {
  bucket: string
  path: string
  signedUrl: string
}

/** Demande une URL d'upload signée pour la session appareil courante. */
async function requestSignedUpload(fileName: string, contentType: string): Promise<SignedUploadTicket> {
  const response = await fetch('/api/v1/storage/sign-upload-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket: RECOLTE_PHOTOS_BUCKET,
      fileName,
      contentType,
    }),
  })
  if (!response.ok) {
    throw new Error(`sign-upload-device ${response.status}`)
  }
  return (await response.json()) as SignedUploadTicket
}

/**
 * POSTe le binaire sur l'URL signée (protocole Storage « upload/signature »,
 * identique à supabase-js uploadToSignedUrl : formData cacheControl + file).
 */
async function uploadToSignedUrl(ticket: SignedUploadTicket, blob: Blob): Promise<void> {
  const formData = new FormData()
  formData.append('cacheControl', '3600')
  formData.append('file', blob)
  const response = await fetch(ticket.signedUrl, { method: 'POST', body: formData })
  if (!response.ok) {
    throw new Error(`upload storage ${response.status}`)
  }
}

/**
 * Upload UNE photo DataURL et retourne la référence storage
 * `harvest-photos/<producteurId>/<uuid>.<ext>`.
 */
export async function uploadDevicePhoto(dataUrl: string): Promise<string> {
  const { blob, contentType } = dataUrlToBlob(dataUrl)
  const fileName = `photo.${contentType.split('/')[1]}`
  const ticket = await requestSignedUpload(fileName, contentType)
  if (ticket.bucket !== RECOLTE_PHOTOS_BUCKET || !ticket.path || !ticket.signedUrl) {
    throw new Error('Ticket sign-upload incomplet')
  }
  await uploadToSignedUrl(ticket, blob)
  return `${ticket.bucket}/${ticket.path}`
}

/**
 * Transforme un tableau photos[] : les DataURL partent au Storage et sont
 * remplacées par leur référence ; toute autre entrée (référence déjà
 * convertie, URL http(s)) passe intacte — la conversion est idempotente.
 */
export async function uploadRecoltePhotos(photos: readonly string[]): Promise<string[]> {
  const out: string[] = []
  for (const photo of photos) {
    if (isDataUrl(photo)) {
      out.push(await uploadDevicePhoto(photo))
    } else {
      out.push(photo)
    }
  }
  return out
}

/**
 * Variante SCALAIRE (PF-04 extension journal) : uploade la photo d'une
 * entrée de carnet si c'est une DataURL ; toute autre valeur (référence
 * déjà convertie, URL http(s), null/undefined) passe intacte.
 */
export async function uploadDevicePhotoValue(
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null
  if (isDataUrl(value)) {
    return uploadDevicePhoto(value)
  }
  return value
}
