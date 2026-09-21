import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { toSpeechText } from './speech-text'

export type VoiceRegister = 'clear' | 'natural-ivorian' | 'nouchi-controlled'
export type VoiceContext =
  | 'greeting'
  | 'navigation'
  | 'encouragement'
  | 'success_non_financial'
  | 'sale_confirmation'
  | 'payment_confirmation'
  | 'credit_balance'
  | 'refund'
  | 'stock_quantity'
  | 'identity_data'
  | 'security_code'

export type VoicePackManifest = {
  manifestVersion: number
  pack: {
    id: string
    version: string
    minAppVersion: string
    status: 'pilot' | 'stable' | 'deprecated'
    supportedLocales: string[]
    supportedRegisters: VoiceRegister[]
  }
  artifacts: {
    model: { relativePath: string; sizeBytes: number; sha256: string }
    lexicon: { relativePath: string; sha256: string }
    pronunciationRules: { relativePath: string; sha256: string }
  }
  downloadPolicy: {
    delivery: 'explicit-opt-in'
    recommendedNetwork: 'wifi' | 'any'
    allowMeteredNetwork: boolean
    allowCellularOverride: boolean
    requiresFreeSpaceBytes: number
    verifyBeforeActivation: boolean
    activationRequiresChecksum: boolean
    offlineAfterInstall: boolean
  }
  deviceRequirements: { minimumAndroidSdk: number; minimumRamMb: number; recommendedRamMb: number }
  license: { commercialUseAllowed: boolean; commercialUseReviewRequired: boolean; attributionRequired: boolean }
  languagePolicy: {
    canonicalTextLanguage: 'fr'
    nouchiIsControlledRegister: boolean
    neverInventNouchi: boolean
    neverUseNouchiForFinancialConfirmation: boolean
    fallbackRegister: 'clear'
  }
  lexicon: VoiceLexiconEntry[]
  protectedPhrases: VoiceProtectedPhrase[]
  normalization: {
    amounts: { currency: 'XOF'; spokenCurrency: string; spellOutNumbers: boolean; maxDigits: number }
    abbreviations: Record<string, string>
  }
}

export type VoiceLexiconEntry = {
  id: string
  surface: string
  normalized: string
  spokenForm: string
  category: string
  register: VoiceRegister
  contextsAllowed: VoiceContext[]
  contextsForbidden: VoiceContext[]
  semanticRisk: 'low' | 'medium' | 'high'
  review: { status: 'approved' | 'approved-with-context' | 'needs-local-validation'; reviewers: string[] }
}

export type VoiceProtectedPhrase = {
  id: string
  intent: VoiceContext
  register: 'clear'
  template: string
  allowedLexiconIds: string[]
  requiresReadBack: boolean
  requiresUserConfirmation: boolean
}

export type PreparedVoiceText = {
  text: string
  effectiveRegister: VoiceRegister
  lexiconIdsApplied: string[]
  protected: boolean
  forcedClearReason?: string
}

export interface VoicePackPlugin {
  isAvailable(): Promise<{ available: boolean; native: boolean }>
  getInstalledPacks(): Promise<{ packs: Array<{ packId: string; version: string; ready: boolean; path?: string }> }>
  getStorageInfo(options?: { requiredBytes?: number }): Promise<{ availableBytes: number; enough: boolean }>
  installPack(options: {
    packId: string
    version: string
    modelUrl: string
    lexiconUrl: string
    pronunciationRulesUrl: string
    modelSha256: string
    lexiconSha256: string
    pronunciationRulesSha256: string
    modelBytes: number
    requiredBytes: number
    allowCellularOverride?: boolean
  }): Promise<{ operationId: string; ready?: boolean }>
  cancelInstall(options: { operationId?: string }): Promise<void>
  deletePack(options: { packId: string; version: string }): Promise<void>
  activatePack(options: { packId: string; version: string; licenseAccepted: boolean }): Promise<{ path: string }>
  releaseEngine(): Promise<void>
  addListener(eventName: 'installProgress' | 'installState', listenerFunc: (event: Record<string, unknown>) => void): Promise<PluginListenerHandle>
}

export const VoicePack = registerPlugin<VoicePackPlugin>('VoicePack')

export const IVORIAN_TTS_PACK_ID = 'ivoirian-tts-nouchi-v1'

const DEFAULT_MANIFEST_URL = '/voice-packs/ivoirian-tts-nouchi-v1/manifest.json'
let manifestPromise: Promise<VoicePackManifest | null> | null = null

function isPlaceholder(value: string): boolean {
  return value.includes('REPLACE_WITH_')
}

export function validateVoicePackManifest(input: unknown): VoicePackManifest {
  if (!input || typeof input !== 'object') throw new Error('VOICE_PACK_INVALID_MANIFEST')
  const m = input as Partial<VoicePackManifest>
  if (m.manifestVersion !== 1 || !m.pack?.id || !m.pack.version) throw new Error('VOICE_PACK_UNSUPPORTED_VERSION')
  if (m.pack.id !== IVORIAN_TTS_PACK_ID) throw new Error('VOICE_PACK_INVALID_MANIFEST')
  if (!m.artifacts?.model?.relativePath || !m.artifacts.model.sizeBytes || !m.artifacts.lexicon?.relativePath) {
    throw new Error('VOICE_PACK_MISSING_ARTIFACT')
  }
  if (!m.languagePolicy?.neverUseNouchiForFinancialConfirmation || !m.languagePolicy.neverInventNouchi) {
    throw new Error('VOICE_PACK_INVALID_MANIFEST')
  }
  if (!m.downloadPolicy?.verifyBeforeActivation || !m.downloadPolicy.activationRequiresChecksum) {
    throw new Error('VOICE_PACK_INVALID_MANIFEST')
  }
  return input as VoicePackManifest
}

export async function loadIvorianVoiceManifest(url = DEFAULT_MANIFEST_URL): Promise<VoicePackManifest | null> {
  if (manifestPromise) return manifestPromise
  manifestPromise = fetch(url, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`VOICE_PACK_MANIFEST_HTTP_${response.status}`)
      return validateVoicePackManifest(await response.json())
    })
    .catch((error) => {
      manifestPromise = null
      console.warn('[voice-pack] manifeste indisponible', error)
      return null
    })
  return manifestPromise
}

export function isProtectedVoiceContext(context: VoiceContext): boolean {
  return [
    'sale_confirmation',
    'payment_confirmation',
    'credit_balance',
    'refund',
    'stock_quantity',
    'identity_data',
    'security_code',
  ].includes(context)
}

export function prepareIvorianVoiceText(
  text: string,
  context: VoiceContext,
  requestedRegister: VoiceRegister = 'natural-ivorian',
  manifest?: VoicePackManifest | null,
): PreparedVoiceText {
  const protectedContext = isProtectedVoiceContext(context)
  const effectiveRegister: VoiceRegister = protectedContext ? 'clear' : requestedRegister
  const canonical = toSpeechText(text)
  if (!manifest || effectiveRegister === 'clear') {
    return {
      text: canonical,
      effectiveRegister,
      lexiconIdsApplied: [],
      protected: protectedContext,
      ...(protectedContext ? { forcedClearReason: 'protected-business-context' } : {}),
    }
  }

  const applied: string[] = []
  let prepared = canonical
  for (const entry of manifest.lexicon) {
    if (!['approved', 'approved-with-context'].includes(entry.review.status)) continue
    if (entry.register !== effectiveRegister) continue
    if (!entry.contextsAllowed.includes(context) || entry.contextsForbidden.includes(context)) continue
    const pattern = new RegExp(`\\b${escapeRegExp(entry.normalized)}\\b`, 'giu')
    if (pattern.test(prepared)) {
      prepared = prepared.replace(pattern, entry.spokenForm)
      applied.push(entry.id)
    }
  }
  return { text: prepared, effectiveRegister, lexiconIdsApplied: applied, protected: false }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function canUseIvorianPack(manifest: VoicePackManifest | null): boolean {
  if (!manifest) return false
  if (manifest.pack.status === 'deprecated') return false
  if (manifest.license.commercialUseReviewRequired && !manifest.license.commercialUseAllowed) return false
  return Capacitor.isNativePlatform() || typeof window !== 'undefined'
}

export function resetVoicePackManifestCache(): void {
  manifestPromise = null
}

export function hasUsableChecksums(manifest: VoicePackManifest): boolean {
  return [
    manifest.artifacts.model.sha256,
    manifest.artifacts.lexicon.sha256,
    manifest.artifacts.pronunciationRules.sha256,
  ].every((value) => /^[a-f0-9]{64}$/i.test(value) && !isPlaceholder(value))
}

export type VoicePackArtifactUrls = {
  modelUrl: string
  lexiconUrl: string
  pronunciationRulesUrl: string
}

/** Installs the pack described by the manifest after explicit user consent. */
export async function installIvorianVoicePack(
  manifest: VoicePackManifest,
  urls: VoicePackArtifactUrls,
  licenseAccepted: boolean,
  allowCellularOverride = false,
): Promise<{ operationId: string; ready?: boolean }> {
  if (!licenseAccepted) throw new Error('VOICE_PACK_LICENSE_NOT_ACCEPTED')
  if (!hasUsableChecksums(manifest)) throw new Error('VOICE_PACK_INVALID_CHECKSUM')
  if (manifest.downloadPolicy.delivery !== 'explicit-opt-in') throw new Error('VOICE_PACK_DOWNLOAD_NOT_EXPLICIT')
  return VoicePack.installPack({
    packId: manifest.pack.id,
    version: manifest.pack.version,
    ...urls,
    modelSha256: manifest.artifacts.model.sha256,
    lexiconSha256: manifest.artifacts.lexicon.sha256,
    pronunciationRulesSha256: manifest.artifacts.pronunciationRules.sha256,
    modelBytes: manifest.artifacts.model.sizeBytes,
    requiredBytes: manifest.downloadPolicy.requiresFreeSpaceBytes,
    allowCellularOverride,
  })
}
