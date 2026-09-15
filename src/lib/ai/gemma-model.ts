import { Capacitor } from '@capacitor/core'
import { LiteRtModel, type GemmaDownloadProgress, type GemmaDownloadState } from './litert-model-plugin'
import { parseNavigationOutput, type NavigationIntent, isNavigationCandidate } from './navigation-intent'
import { isProducteurNavigationCandidate, parseProducteurNavigationOutput, type ProducteurNavigationIntent } from './producteur-navigation-intent'

export const GEMMA_MODEL_VERSION = 'Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096'
export const GEMMA_MODEL_SIZE_BYTES = 558 * 1024 * 1024
export const GEMMA_MODEL_SIZE_LABEL = '558 Mo'
export const GEMMA_ASSISTANT_NAME = 'Tata Nanti Lou'

/** Shared identity rules for every future LiteRT-LM generation call. */
export const GEMMA_SYSTEM_PROMPT = `Tu es ${GEMMA_ASSISTANT_NAME}, l’assistante vocale de Jùlaba pour les commerçants.
Réponds en français standard, avec des phrases courtes et simples.
Si l’utilisateur demande ton nom, réponds exactement : « Je m’appelle ${GEMMA_ASSISTANT_NAME}. »
Ne prétends pas être Google, Gemma ou un autre modèle.
Pour une commande métier, retourne uniquement le format demandé et n’exécute jamais une action financière toi-même.`

export const GEMMA_NAVIGATION_SYSTEM_PROMPT = `Tu es ${GEMMA_ASSISTANT_NAME}, l’assistante vocale de Jùlaba.
Réponds en français standard. Analyse uniquement les demandes de navigation.
Retourne uniquement un JSON valide, sans Markdown, avec intent, targetRoute et confidence.
Les routes autorisées sont : home, caisse, stock, depenses, ventes, marche, keiwa, tontines, profil, academy, commandes, protection-sociale, fidelite.
Si ce n’est pas une navigation claire, retourne intent = unknown et targetRoute = null.
Ne retourne jamais d’URL, de slash, de route hors liste et ne modifie jamais de données.
Une vente, une dépense ou un réapprovisionnement reste une action métier et doit être laissée au parseur métier.`

export const GEMMA_PRODUCTEUR_NAVIGATION_SYSTEM_PROMPT = `Tu es ${GEMMA_ASSISTANT_NAME}, l’assistante vocale de Jùlaba pour les producteurs agricoles.
Réponds en français standard. Analyse uniquement les demandes de navigation.
Retourne uniquement un JSON valide, sans Markdown, avec intent, targetRoute et confidence.
Les routes autorisées sont : prod-home, prod-recoltes, prod-commandes, prod-stock, prod-cycles, prod-profil.
Si ce n’est pas une navigation claire, retourne intent = unknown et targetRoute = null.
Ne retourne jamais d’URL, de slash, de route hors liste et ne modifie jamais de données.
Une déclaration de récolte, une quantité, un produit ou une qualité reste une action métier et doit être laissée au parseur producteur.`

export function buildGemmaPrompt(userText: string): string {
  return `${GEMMA_SYSTEM_PROMPT}\n\nMessage de l’utilisateur :\n${userText}`
}

// The signed URL is supplied at build/deploy time. It must point to the exact
// versioned artifact whose SHA-256 is configured below.
export const GEMMA_MODEL_URL = process.env.NEXT_PUBLIC_GEMMA_MODEL_URL ?? ''
export const GEMMA_MODEL_SHA256 = process.env.NEXT_PUBLIC_GEMMA_MODEL_SHA256 ?? ''

export type GemmaModelErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'HTTP_ERROR'
  | 'SOURCE_UNAVAILABLE'
  | 'INSUFFICIENT_STORAGE'
  | 'CHECKSUM_MISMATCH'
  | 'CORRUPTED_FILE'
  | 'DOWNLOAD_CANCELLED'
  | 'NATIVE_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'MODEL_LOAD_FAILED'
  | 'CONFIGURATION_MISSING'
  | 'UNKNOWN'

export interface GemmaModelError {
  code: GemmaModelErrorCode
  message: string
}

export function isGemmaModelConfigured(): boolean {
  return Boolean(GEMMA_MODEL_URL && GEMMA_MODEL_SHA256)
}

export function mapGemmaError(error: unknown): GemmaModelError {
  const raw = error instanceof Error ? error.message : String(error)
  const code = raw.match(/\[([A-Z_]+)\]/)?.[1]
  const knownCodes: GemmaModelErrorCode[] = [
    'NETWORK_UNAVAILABLE', 'HTTP_ERROR', 'SOURCE_UNAVAILABLE', 'INSUFFICIENT_STORAGE',
    'CHECKSUM_MISMATCH', 'CORRUPTED_FILE', 'DOWNLOAD_CANCELLED',
    'NATIVE_UNSUPPORTED', 'PERMISSION_DENIED', 'MODEL_LOAD_FAILED',
    'CONFIGURATION_MISSING', 'UNKNOWN',
  ]
  const normalized = knownCodes.includes(code as GemmaModelErrorCode)
    ? code as GemmaModelErrorCode
    : 'UNKNOWN'

  const messages: Record<GemmaModelErrorCode, string> = {
    NETWORK_UNAVAILABLE: 'Aucune connexion disponible. Connectez-vous à internet puis réessayez.',
    HTTP_ERROR: 'Le serveur est momentanément indisponible. Réessayez dans quelques instants.',
    SOURCE_UNAVAILABLE: 'Le téléchargement est momentanément indisponible. Réessayez dans quelques instants.',
    INSUFFICIENT_STORAGE: `Il faut au moins ${GEMMA_MODEL_SIZE_LABEL} d’espace libre pour installer l’assistant.`,
    CHECKSUM_MISMATCH: 'Le fichier téléchargé est incomplet. Relancez le téléchargement.',
    CORRUPTED_FILE: 'Le fichier de l’assistant est inutilisable. Relancez le téléchargement.',
    DOWNLOAD_CANCELLED: 'Téléchargement annulé.',
    NATIVE_UNSUPPORTED: 'Cet appareil ne prend pas en charge l’assistant hors ligne.',
    PERMISSION_DENIED: 'Le stockage de l’appareil n’est pas accessible.',
    MODEL_LOAD_FAILED: 'L’assistant n’a pas pu être chargé sur cet appareil.',
    CONFIGURATION_MISSING: 'Le téléchargement de l’assistant n’est pas encore configuré.',
    UNKNOWN: 'Le téléchargement a échoué. Réessayez.',
  }

  return { code: normalized, message: messages[normalized] }
}

export function addGemmaDownloadListeners(
  onProgress: (progress: GemmaDownloadProgress) => void,
  onState: (state: GemmaDownloadState) => void,
): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(async () => {})
  return Promise.all([
    LiteRtModel.addListener('downloadProgress', onProgress),
    LiteRtModel.addListener('downloadState', onState),
  ]).then(([progress, state]) => async () => {
    await progress.remove()
    await state.remove()
  })
}

export async function getGemmaAvailability() {
  if (!Capacitor.isNativePlatform()) return { available: false, modelReady: false, reason: 'NATIVE_UNSUPPORTED' }
  return LiteRtModel.isAvailable()
}

export async function downloadGemmaModel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('[NATIVE_UNSUPPORTED]')
  if (!isGemmaModelConfigured()) throw new Error('[CONFIGURATION_MISSING]')
  await LiteRtModel.download({
    url: GEMMA_MODEL_URL,
    version: GEMMA_MODEL_VERSION,
    sha256: GEMMA_MODEL_SHA256,
    expectedBytes: GEMMA_MODEL_SIZE_BYTES,
  })
}

export async function cancelGemmaDownload(): Promise<void> {
  if (Capacitor.isNativePlatform()) await LiteRtModel.cancel()
}

export async function removeGemmaModel(): Promise<void> {
  if (Capacitor.isNativePlatform()) await LiteRtModel.remove()
}

export async function isGemmaReady(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try { return (await LiteRtModel.isAvailable()).modelReady } catch { return false }
}

export async function classifyNavigation(transcript: string): Promise<NavigationIntent> {
  if (!isNavigationCandidate(transcript) || !(await isGemmaReady())) {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
  try {
    const result = await Promise.race([
      LiteRtModel.generate({
        systemPrompt: GEMMA_NAVIGATION_SYSTEM_PROMPT,
        prompt: transcript,
        maxTokens: 128,
        temperature: 0.1,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    return parseNavigationOutput(result.text)
  } catch {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
}

export async function classifyProducteurNavigation(transcript: string): Promise<ProducteurNavigationIntent> {
  if (!isProducteurNavigationCandidate(transcript) || !(await isGemmaReady())) {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
  try {
    const result = await Promise.race([
      LiteRtModel.generate({
        systemPrompt: GEMMA_PRODUCTEUR_NAVIGATION_SYSTEM_PROMPT,
        prompt: transcript,
        maxTokens: 128,
        temperature: 0.1,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    return parseProducteurNavigationOutput(result.text)
  } catch {
    return { intent: 'unknown', targetRoute: null, confidence: 0 }
  }
}
