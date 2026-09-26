// Garde de PUBLICATION des packs vocaux (MODE-1014, AUDIT-013).
//
// CONSTAT AUDIT-013 : MODE-1003 avait rendu sha256/sizeBytes OPTIONNELS sur
// les entrées du registre (registry.ts) — une publication sans empreinte
// était donc possible : un pack publié mais invérifiable (fichier tronqué
// ou substitué sur la release = indétectable côté appareil).
//
// RÈGLE MODE-1014 — deux régimes distincts, assumés :
//
// 1. PUBLICATION STRICTE : une entrée PUBLIÉE (un pack `files` — la release
//    voice-models-v1, scripts/publish-voice-models.sh) doit porter, pour
//    CHAQUE fichier, une empreinte SHA-256 valide (64 hex) ET une taille
//    exacte (entier > 0). Le chemin de publication REFUSE toute entrée
//    incomplète : assertVoicePackPublication (script/dev) jette
//    PACK_PUBLICATION_REFUSEE ; installVoicePack (pack-manager) refuse le
//    téléchargement d'une entrée publiée sans empreintes — on ne télécharge
//    jamais depuis une publication invérifiable.
//
// 2. LECTURE TOLÉRANTE (rétrocompatibilité documentée, JAMAIS silencieuse) :
//    une entrée legacy sans empreinte se CHARGE sans crash (les packs
//    s'affichent, la sonde d'état reste exacte) mais chaque lecture émet
//    UN avertissement structuré (warnVoicePackLegacyEntry, une fois par
//    pack et par session) — la dégradation est visible, jamais avalée.
//
// Périmètre : les packs à mécanisme `apk-assets` portant `files` (chemin de
// publication release GitHub). Les packs `opfs`/`cache-api` délèguent
// l'intégrité à leur module propriétaire (Transformers.js / piper-tts-web
// vérifient leurs propres artefacts ; cf. voice-pack.ts côté nouchi qui
// applique déjà VOICE_PACK_INVALID_CHECKSUM) — hors périmètre de ce garde.

import type { VoicePackDescriptor, VoicePackFile } from './registry'

/** Empreinte SHA-256 hexadécimale canonique (64 caractères minuscules). */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

/** Empreinte valide : 64 caractères hexadécimaux (casse normalisée avant test). */
export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value.toLowerCase())
}

/** Taille attendue valide : entier sain STRICTEMENT positif (un modèle vide n'existe pas). */
export function isValidSizeBytes(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * Liste les problèmes de publication d'un descripteur — vide si l'entrée
 * est publiable telle quelle. Un problème par fichier manquant/invalide,
 * formulé pour être collé tel quel dans un message d'erreur.
 */
export function describeVoicePackPublicationProblems(
  descriptor: VoicePackDescriptor,
): string[] {
  const problems: string[] = []
  // Un pack sans `files` n'est pas publié via la release — rien à exiger ici.
  if (!descriptor.files || descriptor.files.length === 0) return problems
  for (const file of descriptor.files) {
    problems.push(...describeFilePublicationProblems(descriptor.id, file))
  }
  return problems
}

function describeFilePublicationProblems(packId: string, file: VoicePackFile): string[] {
  const problems: string[] = []
  if (file.sha256 === undefined) {
    problems.push(`${packId}/${file.name} : empreinte sha256 ABSENTE (obligatoire pour publier).`)
  } else if (!isValidSha256Hex(file.sha256)) {
    problems.push(
      `${packId}/${file.name} : empreinte sha256 INVALIDE (64 hex attendus, reçu « ${String(file.sha256).slice(0, 16)}… »).`,
    )
  }
  if (file.sizeBytes === undefined) {
    problems.push(`${packId}/${file.name} : taille sizeBytes ABSENTE (obligatoire pour publier).`)
  } else if (!isValidSizeBytes(file.sizeBytes)) {
    problems.push(
      `${packId}/${file.name} : taille sizeBytes INVALIDE (entier > 0 attendu, reçu « ${String(file.sizeBytes)} »).`,
    )
  }
  return problems
}

/** L'entrée est-elle publiable telle quelle (toutes empreintes présentes et valides) ? */
export function isVoicePackPublicationComplete(descriptor: VoicePackDescriptor): boolean {
  return describeVoicePackPublicationProblems(descriptor).length === 0
}

/**
 * Chemin de publication STRICT : refuse (throw) une entrée publiée sans
 * empreintes complètes. Message unique listant TOUS les problèmes — le
 * porteur corrige le registre en une passe (le fragment émis par
 * scripts/publish-voice-models.sh se colle tel quel).
 */
export function assertVoicePackPublication(descriptor: VoicePackDescriptor): void {
  const problems = describeVoicePackPublicationProblems(descriptor)
  if (problems.length === 0) return
  throw new Error(
    `PACK_PUBLICATION_REFUSEE — le pack « ${descriptor.id} » est publié sans empreinte(s) vérifiée(s) : ` +
      `${problems.join(' ')} ` +
      `Collez le fragment d'intégrité émis par scripts/publish-voice-models.sh dans registry.ts, puis relancez la publication.`,
  )
}

/** Packs déjà signalés comme legacy cette session (un avertissement par pack, pas un spam). */
const legacyWarned = new WeakSet<VoicePackDescriptor>()

/**
 * LECTURE TOLÉRANTE — avertissement structuré, UNE fois par descripteur et
 * par session : une entrée legacy sans empreinte se charge sans crash
 * (rétrocompatibilité), mais la dégradation reste VISIBLE (jamais
 * silencieuse). No-op pour une entrée complète.
 */
export function warnVoicePackLegacyEntry(descriptor: VoicePackDescriptor): void {
  if (isVoicePackPublicationComplete(descriptor)) return
  if (legacyWarned.has(descriptor)) return
  legacyWarned.add(descriptor)
  console.warn(
    JSON.stringify({
      source: 'voice-packs',
      niveau: 'avertissement',
      code: 'PACK_LEGACY_SANS_EMPREINTE',
      packId: descriptor.id,
      message:
        'Entrée legacy chargée sans empreinte(s) complète(s) (sha256/sizeBytes) — lecture tolérée, intégrité invérifiable au téléchargement.',
      details: describeVoicePackPublicationProblems(descriptor),
    }),
  )
}
