// Pack-manager — contrat uniforme sur les packs vocaux (Sprint V, MODE-952).
//
// CONTRAT (une seule forme pour l'UI, quel que soit le mécanisme réel) :
//   listVoicePackStates()                        → l'état VRAI de chaque pack
//   installVoicePack(id, onProgress?)            → consentement + téléchargement
//   removeVoicePack(id)                          → libération d'espace
//
// PRINCIPES NON NÉGOCIABLES (hérités du projet) :
// 1. Aucune logique dupliquée : chaque pack délègue à son module
//    propriétaire (piper-tts, kokoro-tts, nllb-translation, mms-tts,
//    voice-service) — ce module reste la source de vérité. Le manager
//    traduit, n'invente rien.
// 2. Le téléchargement n'est JAMAIS implicite : installVoicePack est
//    appelé depuis une action utilisateur explicite (réglages voix).
// 3. État exact, jamais supposé : installed vient de la sonde réelle du
//    module propriétaire ; un échec renvoie false / une chaîne d'erreur
//    — jamais un état optimiste.
// 4. Les packs apk-assets (STT natif) ne sont PAS téléchargeables depuis
//    cette version : ils sont embarqués au build (full) ou absents
//    (lite) — MODE-953 introduira leur chemin disque + sonde de présence
//    réelle. Le manager annonce ça franchement (installed = coque native,
//    supported = coque native, install impossible → false).
// 5. MODE-1014 (AUDIT-013) — publication stricte, lecture tolérante :
//    une entrée PUBLIÉE sans empreintes complètes (sha256/sizeBytes,
//    registry.ts) refuse l'installation (on ne télécharge jamais depuis
//    une publication invérifiable) ; une entrée LEGACY se charge sans
//    crash mais émet un avertissement structuré (jamais silencieux) —
//    cf. ./publication.ts.

import {
  isKokoroSupported,
  isKokoroVoiceReady,
  downloadKokoroVoice,
  removeKokoroVoice,
} from '../kokoro-tts'
import {
  downloadMmsBciVoice,
  downloadMmsDyuVoice,
  isMmsBciVoiceReady,
  isMmsDyuVoiceReady,
  isMmsSupported,
  removeMmsBciVoice,
  removeMmsDyuVoice,
} from '../mms-tts'
import {
  downloadNllbModel,
  isNllbModelReady,
  isNllbSupported,
  removeNllbModel,
} from '../nllb-translation'
import {
  isPiperSupported,
  isPiperVoiceReady,
  downloadPiperVoice,
  removePiperVoice,
} from '../piper-tts'
import {
  isVoiceServicePlatformAvailable,
  probeVoiceModelAvailability,
} from '../voice-service'
import {
  downloadModelFiles,
  removeModelDirectory,
} from './model-downloader'
import {
  describeVoicePackPublicationProblems,
  warnVoicePackLegacyEntry,
} from './publication'
import {
  getVoicePackDescriptor,
  VOICE_PACKS,
  type VoicePackDescriptor,
  type VoicePackId,
} from './registry'

/** État RÉEL d'un pack pour cette installation (sonde du module propriétaire). */
export type VoicePackState = {
  descriptor: VoicePackDescriptor
  /** Le mécanisme est-il utilisable sur cette plateforme ? (web vs coque native) */
  supported: boolean
  /** La ressource est-elle réellement disponible ici et maintenant ? */
  installed: boolean
}

async function probePack(descriptor: VoicePackDescriptor): Promise<VoicePackState> {
  // MODE-1014 — lecture tolérante : une entrée legacy sans empreinte se
  // charge normalement (sonde exacte, aucun crash) mais signe son passage
  // par UN avertissement structuré par pack et par session.
  warnVoicePackLegacyEntry(descriptor)
  switch (descriptor.id) {
    case 'stt-fr-native':
    case 'stt-locales-native': {
      // Sonde natif RÉELLE (MODE-953) : assets du build full OU disque
      // (pack téléchargé) — sans jamais charger le moteur. La langue
      // sondée est le fichier clé du pack : 'fr' → zipformer ; 'bci' →
      // omnilingual (le MÊME moteur couvre bci ET dyu).
      if (!isVoiceServicePlatformAvailable()) {
        return { descriptor, supported: false, installed: false }
      }
      const availability = await probeVoiceModelAvailability(
        descriptor.id === 'stt-fr-native' ? 'fr' : 'bci',
      )
      return { descriptor, supported: true, installed: availability.available }
    }
    case 'tts-piper-fr': {
      const supported = isPiperSupported()
      const installed = supported ? await isPiperVoiceReady().catch(() => false) : false
      return { descriptor, supported, installed }
    }
    case 'tts-kokoro-fr': {
      const supported = isKokoroSupported()
      const installed = supported ? await isKokoroVoiceReady().catch(() => false) : false
      return { descriptor, supported, installed }
    }
    case 'nllb-bci': {
      const supported = isNllbSupported()
      const installed = supported ? await isNllbModelReady('bci').catch(() => false) : false
      return { descriptor, supported, installed }
    }
    case 'nllb-dyu': {
      const supported = isNllbSupported()
      const installed = supported ? await isNllbModelReady('dyu').catch(() => false) : false
      return { descriptor, supported, installed }
    }
    case 'tts-mms-bci': {
      const supported = isMmsSupported()
      const installed = supported ? await isMmsBciVoiceReady().catch(() => false) : false
      return { descriptor, supported, installed }
    }
    case 'tts-mms-dyu': {
      const supported = isMmsSupported()
      const installed = supported ? await isMmsDyuVoiceReady().catch(() => false) : false
      return { descriptor, supported, installed }
    }
  }
}

/** L'état vrai de TOUS les packs (ordre du registre, sonde sans effet de bord). */
export async function listVoicePackStates(): Promise<VoicePackState[]> {
  return Promise.all(VOICE_PACKS.map((descriptor) => probePack(descriptor)))
}

/** L'état vrai d'UN pack. */
export async function getVoicePackState(id: VoicePackId): Promise<VoicePackState | null> {
  const descriptor = getVoicePackDescriptor(id)
  if (!descriptor) return null
  return probePack(descriptor)
}

/**
 * Installe un pack — UNIQUEMENT depuis une action utilisateur explicite.
 * Renvoie false (jamais throw) si le pack n'est pas installable ici
 * (plateforme non supportée, échec réseau/release absente) ; la
 * progression (0..100) remonte via onProgress.
 */
export async function installVoicePack(
  id: VoicePackId,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  const descriptor = getVoicePackDescriptor(id)
  if (!descriptor) return false
  switch (descriptor.id) {
    case 'stt-fr-native':
    case 'stt-locales-native': {
      // MODE-953 : téléchargement applicatif sur le disque de l'appareil
      // (coque native uniquement) — le plugin natif résout ensuite le
      // modèle depuis le disque (prioritaire sur l'asset du build).
      if (!isVoiceServicePlatformAvailable()) return false
      if (!descriptor.files || descriptor.files.length === 0 || !descriptor.diskRelPath) {
        console.warn(`[pack-manager] ${id} : descripteur incomplet (files/diskRelPath).`)
        return false
      }
      // MODE-1014 (AUDIT-013) — garde de publication STRICTE : une entrée
      // publiée (release voice-models-v1) sans empreintes complètes est
      // refusée AVANT tout téléchargement. Sans ce garde, un pack publié
      // sans sha256/sizeBytes serait installé INVÉRIFIABLE (MODE-1003).
      const publicationProblems = describeVoicePackPublicationProblems(descriptor)
      if (publicationProblems.length > 0) {
        console.error(
          `[pack-manager] [PUBLICATION REFUSÉE] ${id} : entrée publiée sans empreinte(s) vérifiée(s) — ` +
            `${publicationProblems.join(' ')} ` +
            `Collez le fragment d'intégrité émis par scripts/publish-voice-models.sh dans registry.ts.`,
        )
        return false
      }
      const result = await downloadModelFiles(
        descriptor.files.map((f) => ({
          diskPath: `${descriptor.diskRelPath}/${f.name}`,
          url: f.url,
          // A11-F03 : intégrité transportée du registre jusqu'au downloader
          // (divergence taille/SHA-256 = refus avant tout « installé »).
          sha256: f.sha256,
          sizeBytes: f.sizeBytes,
        })),
        onProgress,
      )
      if (!result.ok) {
        console.warn(`[pack-manager] ${id} : ${result.reason}`)
        return false
      }
      return true
    }
    case 'tts-piper-fr':
      if (!isPiperSupported()) return false
      return downloadPiperVoice(onProgress).catch(() => false)
    case 'tts-kokoro-fr':
      if (!isKokoroSupported()) return false
      return downloadKokoroVoice(onProgress).catch(() => false)
    case 'nllb-bci':
      if (!isNllbSupported()) return false
      return downloadNllbModel(onProgress, 'bci').catch(() => false)
    case 'nllb-dyu':
      if (!isNllbSupported()) return false
      return downloadNllbModel(onProgress, 'dyu').catch(() => false)
    case 'tts-mms-bci':
      if (!isMmsSupported()) return false
      return downloadMmsBciVoice(onProgress).catch(() => false)
    case 'tts-mms-dyu':
      if (!isMmsSupported()) return false
      return downloadMmsDyuVoice(onProgress).catch(() => false)
  }
}

/**
 * Désinstalle un pack (libère l'espace). No-op silencieux pour un pack
 * non amovible (cœur de l'APK) ou absent — la sonde reste la vérité.
 */
export async function removeVoicePack(id: VoicePackId): Promise<void> {
  const descriptor = getVoicePackDescriptor(id)
  if (!descriptor || !descriptor.removable) return
  switch (descriptor.id) {
    case 'stt-locales-native':
      // MODE-953 : suppression du dossier DISQUE du pack (les assets du
      // build full restent — la sonde repassera à installed via assets).
      if (descriptor.diskRelPath) await removeModelDirectory(descriptor.diskRelPath)
      return
    case 'stt-fr-native':
      return // non amovible de toute façon (removable=false) — gardé pour l'exhaustivité du switch
    case 'tts-piper-fr':
      await removePiperVoice().catch(() => undefined)
      return
    case 'tts-kokoro-fr':
      await removeKokoroVoice().catch(() => undefined)
      return
    case 'nllb-bci':
      await removeNllbModel('nllb-baoule-v1').catch(() => undefined)
      return
    case 'nllb-dyu':
      await removeNllbModel('Xenova/nllb-200-distilled-600M').catch(() => undefined)
      return
    case 'tts-mms-bci':
      await removeMmsBciVoice().catch(() => undefined)
      return
    case 'tts-mms-dyu':
      await removeMmsDyuVoice().catch(() => undefined)
      return
  }
}
