// Downloader applicatif des packs STT natifs (Sprint V, MODE-953).
//
// Les builds allégés (APK lite) n'embarquent plus les modèles ASR : ce
// module télécharge les fichiers du pack vers le DISQUE de l'appareil
// (Directory.Data/voice-models/<arborescence assets>) où le plugin natif
// VoiceService les résout (resolveModelFile — la version téléchargée prime
// sur l'asset du build).
//
// POURQUOI UN STREAMING MANUEL (fetch + appendFile) ET PAS
// Filesystem.downloadFile ? L'API Capacitor ne fournit AUCUNE progression
// de téléchargement — et un pack de 349 Mo sans progression sur un réseau
// ivoirien intermittent est un téléchargement que l'utilisateur abandonne
// (ou suppose cassé). Le streaming par blocs (512 Ko) permet :
//   - la PROGRESSION réelle (octets reçus / Content-Length) ;
//   - un empilement disque au fil de l'eau (jamais 349 Mo en mémoire) ;
//   - le skip des fichiers déjà complets (reprise par fichier, v1).
//
// HONNÊTETÉ v1 (documentée) : sans taille/checksum attendu par fichier, un
// fichier tronqué à la coupure réseau ne peut pas être distingué d'un
// fichier complet s'il n'est PAS vide — la reprise repart donc de zéro sur
// ce fichier (suppression avant re-téléchargement) et la vérification
// d'intégrité par sha256 arrivera avec la publication des releases
// (voice-models-v1, scripts/publish-voice-models.sh).

import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

/** Miroir EXACT de DISK_MODELS_DIR côté Java (VoiceServicePlugin). */
export const DISK_MODELS_DIR = 'voice-models'

/** Taille des blocs écrits sur disque (512 Ko — équilibre mémoire/appels). */
const CHUNK_WRITE_SIZE = 512 * 1024

export type ModelFileSpec = {
  /** Chemin RELATIF sous voice-models/ — miroir de l'arborescence assets. */
  diskPath: string
  /** Source du fichier (release GitHub voice-models-v1). */
  url: string
}

export type ModelDownloadResult =
  | { ok: true; filesWritten: number }
  | { ok: false; reason: string }

function describeDownloadError(error: unknown, url: string): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/404|Not Found/i.test(raw)) {
    return `Fichier introuvable sur le serveur (${url}) — la release des packs vocaux n'est pas encore publiée ou une version de l'app attend une release plus récente.`
  }
  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return 'Connexion réseau indisponible — réessayez en Wi-Fi.'
  }
  return raw
}

async function isFileOnDisk(diskPath: string): Promise<boolean> {
  try {
    const stat = await Filesystem.stat({
      path: `${DISK_MODELS_DIR}/${diskPath}`,
      directory: Directory.Data,
    })
    // Un fichier vide est corrompu par définition (jamais un modèle valide).
    return typeof stat?.size === 'number' && stat.size > 0
  } catch {
    return false
  }
}

async function deleteFileIfExists(diskPath: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: `${DISK_MODELS_DIR}/${diskPath}`,
      directory: Directory.Data,
    })
  } catch {
    // Rien à supprimer — chemin attendu absent.
  }
}

/** Supprime le DOSSIER téléchargé d'un pack (désinstallation, MODE-953). */
export async function removeModelDirectory(diskRelPath: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Filesystem.rmdir({
      path: `${DISK_MODELS_DIR}/${diskRelPath}`,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // Dossier déjà absent — suppression idempotente.
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

async function downloadOneFile(
  spec: ModelFileSpec,
  onBytes: (received: number, total: number | null) => void,
): Promise<void> {
  // Reprise v1 : un fichier présent mais tronqué ne peut pas être détecté
  // (pas de checksum encore) → on le supprime et repart de zéro.
  await deleteFileIfExists(spec.diskPath)
  const response = await fetch(spec.url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} — ${spec.url}`)
  }
  const body = response.body
  if (!body) {
    // Pas de streaming disponible : buffer complet (petits fichiers seulement).
    const buffer = new Uint8Array(await response.arrayBuffer())
    onBytes(buffer.length, buffer.length)
    await Filesystem.writeFile({
      path: `${DISK_MODELS_DIR}/${spec.diskPath}`,
      directory: Directory.Data,
      data: toBase64(buffer),
    })
    return
  }
  const totalHeader = Number(response.headers.get('content-length'))
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null
  await Filesystem.mkdir({
    path: `${DISK_MODELS_DIR}/${spec.diskPath}`.split('/').slice(0, -1).join('/'),
    directory: Directory.Data,
    recursive: true,
  }).catch(() => undefined) // existe déjà
  const reader = body.getReader()
  let received = 0
  let pending: Uint8Array[] = []
  let pendingSize = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    pending.push(value)
    pendingSize += value.byteLength
    if (pendingSize >= CHUNK_WRITE_SIZE) {
      const merged = new Uint8Array(pendingSize)
      let offset = 0
      for (const chunk of pending) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }
      await Filesystem.writeFile({
        path: `${DISK_MODELS_DIR}/${spec.diskPath}`,
        directory: Directory.Data,
        data: toBase64(merged),
      })
      pending = []
      pendingSize = 0
    }
    onBytes(received, total)
  }
  if (pendingSize > 0) {
    const merged = new Uint8Array(pendingSize)
    let offset = 0
    for (const chunk of pending) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    await Filesystem.writeFile({
      path: `${DISK_MODELS_DIR}/${spec.diskPath}`,
      directory: Directory.Data,
      data: toBase64(merged),
    })
  }
}

/**
 * Télécharge les fichiers d'un pack STT sur le disque de l'appareil.
 * Requiert la coque native (le stockage disque n'a de sens que pour le
 * moteur natif). Fichiers déjà complets → SKIPPED (reprise par fichier).
 * Renvoie { ok:false, reason } claire en cas d'échec — jamais un état
 * optimiste.
 */
export async function downloadModelFiles(
  files: readonly ModelFileSpec[],
  onProgress?: (percent: number) => void,
): Promise<ModelDownloadResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason:
        'Installation du pack indisponible dans un navigateur — ouvez Jùlaba depuis l’application.',
    }
  }
  let filesWritten = 0
  // Progression agrégée : chaque fichier pèse une part égale (les tailles
  // exactes par fichier ne sont connues qu'au fil du Content-Length).
  const perFileWeight = files.length > 0 ? 100 / files.length : 0
  try {
    for (let index = 0; index < files.length; index++) {
      const spec = files[index]
      const fileStart = index * perFileWeight
      if (await isFileOnDisk(spec.diskPath)) {
        onProgress?.(Math.round(fileStart + perFileWeight))
        continue
      }
      await downloadOneFile(spec, (received, total) => {
        const withinFile = total && total > 0 ? Math.min(1, received / total) : 0
        onProgress?.(Math.round(fileStart + withinFile * perFileWeight))
      })
      filesWritten++
      onProgress?.(Math.round(fileStart + perFileWeight))
    }
    return { ok: true, filesWritten }
  } catch (error) {
    const url = 'de la release des packs vocaux'
    return { ok: false, reason: describeDownloadError(error, url) }
  }
}
