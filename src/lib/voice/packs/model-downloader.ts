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
// ce fichier (suppression avant re-téléchargement).
//
// A11-F03 (AUDIT-011, MODE-1003) : la vérification d'intégrité EXISTE
// désormais, et le bug de troncature qui la rendait vitale est corrigé :
//   1. Filesystem.writeFile TRONQUE le fichier à chaque appel — les
//      écritures par blocs utilisent désormais appendFile() (API v8 —
//      l'option append de writeFile n'existe plus dans
//      @capacitor/filesystem 8.x), avec le fichier créé VIDE avant le
//      premier bloc. AVANT : le fichier final ne contenait que le DERNIER
//      bloc de 512 Ko — corrompu mais accepté (seul length() > 0 est exigé
//      nativement) → sherpa exit() = le crash corrigé par 32b70a8
//      réintroduit par la voie « corrompu ».
//   2. TROIS gardes refusent la divergence AVANT tout « installé » : le
//      Content-Length transport (bloc manquant), la taille sur disque
//      (écriture perdue — ce garde aurait attrapé le bug 1), et le
//      SHA-256 + taille attendus par le registre (registry.ts — les
//      valeurs seront publiées avec la release voice-models-v1,
//      scripts/publish-voice-models.sh). Fichier divergent → supprimé +
//      erreur explicite, jamais un pack corrompu marqué installé.

import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { IncrementalSha256 } from './sha256'

/** Miroir EXACT de DISK_MODELS_DIR côté Java (VoiceServicePlugin). */
export const DISK_MODELS_DIR = 'voice-models'

/** Taille des blocs écrits sur disque (512 Ko — équilibre mémoire/appels). */
const CHUNK_WRITE_SIZE = 512 * 1024

export type ModelFileSpec = {
  /** Chemin RELATIF sous voice-models/ — miroir de l'arborescence assets. */
  diskPath: string
  /** Source du fichier (release GitHub voice-models-v1). */
  url: string
  /**
   * A11-F03 : empreinte SHA-256 hex attendue du fichier COMPLET (registry).
   * Fournie → divergence = fichier supprimé + échec explicite.
   */
  sha256?: string
  /** A11-F03 : taille attendue en octets (registry) — divergence = refus. */
  sizeBytes?: number
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
  // Reprise v1 : tout fichier présent est retéléchargé de zéro (la
  // vérification d'intégrité porte sur le téléchargement COURANT).
  await deleteFileIfExists(spec.diskPath)
  const fullPath = `${DISK_MODELS_DIR}/${spec.diskPath}`
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
      path: fullPath,
      directory: Directory.Data,
      data: toBase64(buffer),
    })
    // A11-F03 : les gardes s'appliquent aussi au chemin sans streaming.
    await verifyDownloadedFile(spec, buffer.length)
    return
  }
  const totalHeader = Number(response.headers.get('content-length'))
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null
  await Filesystem.mkdir({
    path: fullPath.split('/').slice(0, -1).join('/'),
    directory: Directory.Data,
    recursive: true,
  }).catch(() => undefined) // existe déjà
  // A11-F03 — CORRECTIF CENTRAL : fichier créé VIDE, puis appendFile() sur
  // chaque bloc (l'option append de writeFile n'existe plus en v8). Sans
  // append, writeFile TRONQUE à chaque appel : le fichier final ne
  // contenait que le dernier bloc de 512 Ko.
  await Filesystem.writeFile({
    path: fullPath,
    directory: Directory.Data,
    data: '',
  })
  const hash = new IncrementalSha256()
  const reader = body.getReader()
  let received = 0
  let pending: Uint8Array[] = []
  let pendingSize = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    hash.update(value) // empreinte AU FIL de l'eau — mémoire constante
    pending.push(value)
    pendingSize += value.byteLength
    if (pendingSize >= CHUNK_WRITE_SIZE) {
      const merged = new Uint8Array(pendingSize)
      let offset = 0
      for (const chunk of pending) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
      }
      await Filesystem.appendFile({
        path: fullPath,
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
    await Filesystem.appendFile({
      path: fullPath,
      directory: Directory.Data,
      data: toBase64(merged),
    })
  }
  // Garde transport : un Content-Length annoncé et non atteint = bloc(s)
  // perdu(s) — refus AVANT tout marquage « installé ».
  if (total !== null && received !== total) {
    await deleteFileIfExists(spec.diskPath)
    throw new Error(
      `PACK_TRUNCATED — ${spec.diskPath} : ${received} octets reçus sur ${total} annoncés (fichier supprimé, à retélécharger).`
    )
  }
  // Garde disque : la taille réellement écrite doit égaler les octets
  // reçus — toute divergence trahit une écriture perdue/tronquée (ce
  // garde aurait attrapé le bug d'absence d'append).
  const stat = await Filesystem.stat({ path: fullPath, directory: Directory.Data })
  if (typeof stat?.size === 'number' && stat.size !== received) {
    await deleteFileIfExists(spec.diskPath)
    throw new Error(
      `PACK_WRITE_DIVERGENCE — ${spec.diskPath} : ${stat.size} octets sur disque pour ${received} reçus (fichier supprimé, à retélécharger).`
    )
  }
  await verifyDownloadedFile(spec, received, hash.digestHex())
}

/**
 * A11-F03 — gardes d'intégrité registre : taille attendue et SHA-256
 * (quand le registre les porte — release voice-models-v1). Toute
 * divergence supprime le fichier et jette : le pack n'est JAMAIS marqué
 * installé avec un fichier divergent.
 */
async function verifyDownloadedFile(
  spec: ModelFileSpec,
  receivedBytes: number,
  digestHex?: string,
): Promise<void> {
  const refuser = async (raison: string): Promise<never> => {
    await deleteFileIfExists(spec.diskPath)
    throw new Error(
      `PACK_INTEGRITY_REFUSEE — ${spec.diskPath} : ${raison} (fichier supprimé, à retélécharger).`
    )
  }
  if (spec.sizeBytes !== undefined && spec.sizeBytes > 0 && receivedBytes !== spec.sizeBytes) {
    await refuser(`${receivedBytes} octets reçus, ${spec.sizeBytes} attendus (registre).`)
  }
  if (spec.sha256 && digestHex && spec.sha256.toLowerCase() !== digestHex) {
    await refuser(
      `empreinte SHA-256 attendue ${spec.sha256.slice(0, 12)}…, obtenue ${digestHex.slice(0, 12)}….`
    )
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
