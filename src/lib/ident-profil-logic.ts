/**
 * MODE-998 (DET-001 tranche 10) — logique pure de l'écran profil
 * identificateur, extraite de ident-profil-screen.tsx.
 *
 * Règles de la famille DET-001 : chaque corps est repris VERBATIM du
 * composant d'origine (seul le préfixe export est ajouté) ; le comportement
 * est verrouillé par des tests — djb2 local (jamais serveur, preuve croisée
 * avec auth-login-flow.ts et ident-enrolement.ts), normalisation téléphone
 * (quirk figé : « +225 » n'est JAMAIS retiré — le '+' est supprimé avant la
 * branche de préfixe), masquage « écran sensible », initiales, troncature
 * d'identifiant, « membre depuis » (plus ancien dossier), libellé du
 * verrouillage automatique, intitulés et longueurs d'étapes du changement
 * de PIN.
 * Le bloc helpers conserve son import mid-file historique (NORM-304).
 * Quirk historique figé par test : loadAgent répond TOUJOURS null — la
 * validation du code actuel affiche donc « Agent non trouvé. » (copie auth
 * restée incomplète), le changement de PIN ne persiste jamais.
 */

// ─── Helpers (copied from auth screen) ───────────────────────────────────────

export const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

export const normalizePhone = (phone: string) =>
  phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')

export interface AgentData {
  id: string
  firstName: string
  phone: string
  pinHash: string
}

export const loadAgent = (phone: string): AgentData | null => {
  void phone
  return null
}

import { savePinHash, getPinHash } from '@/lib/secure-storage'

export const saveAgent = async (data: AgentData) => {
  const normalized = normalizePhone(data.phone)
  const { pinHash } = data
  if (pinHash) await savePinHash(`ident-pin-${normalized}`, pinHash).catch(() => {})
}
export const loadAgentPinHash = async (phone: string): Promise<string | null> => {
  const normalized = normalizePhone(phone)
  const secure = await getPinHash(`ident-pin-${normalized}`).catch(() => null)
  if (secure) return secure
  return null
}

// ─── Étape du changement de PIN (verbatim l.106, déplacée ici) ──────────────

export type PinStep = 'current' | 'new' | 'confirm'

// ─── Valeurs dérivées (corps verbatim des useMemo du composant) ─────────────

export const computeMaskedPhone = (merchantPhone: string | null, screenSensitive: boolean): string => {
  if (!screenSensitive || !merchantPhone) return merchantPhone || '—'
  if (merchantPhone.length <= 4) return merchantPhone
  return merchantPhone.slice(0, 3) + '****' + merchantPhone.slice(-2)
}

export const computeInitials = (merchantName: string | null): string => {
  if (!merchantName) return '??'
  const parts = merchantName.trim().split(/\s+/)
  const first = parts[0]?.charAt(0)?.toUpperCase() || ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : ''
  return first + last || '??'
}

export const computeTruncatedId = (merchantId: string | null): string => {
  if (!merchantId) return '—'
  if (merchantId.length <= 12) return merchantId
  return merchantId.slice(0, 6) + '...' + merchantId.slice(-4)
}

export const computeMemberSince = (dossiers: { createdAt: number }[]): string => {
  if (dossiers.length === 0) return "Aujourd'hui"
  const sorted = [...dossiers].sort((a, b) => a.createdAt - b.createdAt)
  return new Date(sorted[0].createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const computeAutoLockLabel = (autoLockMinutes: number): string => {
  if (autoLockMinutes === 0) return 'Désactivé'
  return `${autoLockMinutes} min`
}

export const pinStepTitleFor = (pinStep: PinStep): string =>
  pinStep === 'current'
    ? 'Entrez votre code actuel'
    : pinStep === 'new'
      ? 'Entrez le nouveau code'
      : 'Confirmez le nouveau code'

export const pinLengthFor = (pinStep: PinStep, currentPin: string, newPin: string, confirmPin: string): number =>
  pinStep === 'current' ? currentPin.length : pinStep === 'new' ? newPin.length : confirmPin.length
