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
import { isVoiceServicePlatformAvailable } from '../voice-service'
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
  switch (descriptor.id) {
    case 'stt-fr-native':
    case 'stt-locales-native': {
      // Coque native = les moteurs STT sont embarqués au build (APK full).
      // MODE-953 affinera avec la sonde de présence réelle (builds lite).
      const native = isVoiceServicePlatformAvailable()
      return { descriptor, supported: native, installed: native }
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
 * (mécanisme apk-assets avant MODE-953, plateforme non supportée, échec
 * réseau) ; la progression (0..100) remonte via onProgress.
 */
export async function installVoicePack(
  id: VoicePackId,
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  const descriptor = getVoicePackDescriptor(id)
  if (!descriptor) return false
  switch (descriptor.id) {
    case 'stt-fr-native':
    case 'stt-locales-native':
      // Embarqué au build (full) ou absent (lite) — le téléchargement
      // applicatif des modèles STT natifs arrive avec MODE-953. Renvoyer
      // false sans effet de bord : jamais une fausse progression.
      console.warn(
        `[pack-manager] ${id} : pack embarqué au build — téléchargement applicatif non disponible (MODE-953).`,
      )
      return false
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
    case 'stt-fr-native':
    case 'stt-locales-native':
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
