import { randomInt, createHash } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  isRecoveryCodeFormat,
  findRecoveryCodeIndex,
  generateRecoveryCodes,
} from './totp'

// MFA back-office — MODE-934 (AUDIT-003 S-02).
//
// AVANT (audit) : code à 6 chiffres généré serveur, hashé en base… et jamais
// livré (aucun canal email/SMS) — connexion back-office impossible en prod
// hors mode test, et l'UI promettait un « code envoyé par email » fictif.
//
// APRÈS : TOTP RFC-6238 (application d'authentification, offline, sans
// infrastructure d'envoi). La ligne bo_mfa_challenges est conservée comme
// compteur de tentatives (5 max, TTL 5 min) ; en mode TOTP son code_hash
// vaut NULL (sentinelle) — le code est vérifié contre bo_users.mfa_secret
// avec anti-rejeu par totp_last_step. À l'enrôlement (1re connexion), le
// secret + l'URI otpauth + 8 codes de récupération (hashés en base, texte
// clair affiché une seule fois) sont retournés à l'écran.
//
// Mode test (développement uniquement) : BACKOFFICE_MFA_TEST_MODE conserve
// l'ancien chemin à code inline pour les environnements sandbox sans
// application d'authentification — le code_hash est alors posé et la
// vérification hashée historique s'applique.

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export type MfaMode = 'totp' | 'enroll' | 'test'

export interface MfaChallengeInfo {
  challengeId: string
  expiresAt: Date
  mfaMode: MfaMode
  /** Provisioning — uniquement en enrôlement (mfaMode = 'enroll') : secret base32, URI otpauth, codes de récupération en clair (affichés une fois). */
  secret?: string
  otpauthUri?: string
  recoveryCodes?: string[]
}

/**
 * Issue a server-side MFA challenge for a user who has just passed the
 * password check. En TOTP, le code ne circule JAMAIS par le serveur : il
 * vit dans l'application d'authentification de l'utilisateur.
 */
export async function createMfaChallenge(userId: string, accountEmail: string): Promise<MfaChallengeInfo> {
  const configuredTestCode = process.env.BACKOFFICE_MFA_TEST_CODE?.trim()
  const testMode = process.env.NODE_ENV !== 'production' && process.env.BACKOFFICE_MFA_TEST_MODE === 'true'
  const testCode = testMode && configuredTestCode && /^\d{6}$/.test(configuredTestCode)
    ? configuredTestCode
    : undefined
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)

  const supabase = createSupabaseAdminClient()

  // Mode test (dev) : ancien chemin inline — vérifiable sans application
  // d'authentification (sandbox, E2E).
  if (testCode) {
    const { data: challenge } = await supabase
      .from('bo_mfa_challenges')
      .insert({
        user_id: userId,
        code_hash: hashCode(testCode),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()
    console.info(`[backoffice-mfa] Mode test actif: code ${testCode}, challenge ${challenge!.id}`)
    return { challengeId: challenge!.id, expiresAt, mfaMode: 'test' }
  }

  // TOTP : sans code inline. Provisioning à la première connexion (aucun
  // secret confirmé) : nouveau secret + nouveaux codes de récupération,
  // stockés NON confirmés — ils ne deviennent des facteurs valables qu'après
  // la première vérification réussie. Un enrôlement abandonné repart de zéro.
  const { data: user } = await supabase
    .from('bo_users')
    .select('mfa_secret, totp_enrolled')
    .eq('id', userId)
    .single()

  let mfaMode: MfaMode = 'totp'
  let secret: string | undefined
  let otpauthUri: string | undefined
  let recoveryCodes: string[] | undefined

  if (!user?.mfa_secret || !user?.totp_enrolled) {
    secret = generateTotpSecret()
    const codes = generateRecoveryCodes()
    recoveryCodes = codes.map((c) => c.code)
    const { error: saveError } = await supabase
      .from('bo_users')
      .update({
        mfa_secret: secret,
        totp_enrolled: false,
        totp_recovery_codes: codes.map((c) => c.hash),
      })
      .eq('id', userId)
    if (saveError) throw saveError
    otpauthUri = buildOtpauthUri(secret, accountEmail)
    mfaMode = 'enroll'
  }

  const { data: challenge } = await supabase
    .from('bo_mfa_challenges')
    .insert({
      user_id: userId,
      code_hash: null, // sentinelle TOTP : vérification contre bo_users.mfa_secret
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  console.info(`[backoffice-mfa] Challenge TOTP ${challenge!.id} (mode ${mfaMode}), expire ${expiresAt.toISOString()}`)
  return { challengeId: challenge!.id, expiresAt, mfaMode, secret, otpauthUri, recoveryCodes }
}

export type MfaVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' }

export async function verifyMfaChallenge(challengeId: string, code: string): Promise<MfaVerifyResult> {
  const supabase = createSupabaseAdminClient()

  const { data: challenge } = await supabase
    .from('bo_mfa_challenges')
    .select('*')
    .eq('id', challengeId)
    .single()

  if (!challenge || challenge.consumed_at) return { ok: false, reason: 'invalid' }
  if (new Date(challenge.expires_at) < new Date()) return { ok: false, reason: 'expired' }
  if (challenge.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' }

  const { valid, acceptedStep } = await checkSecondFactor(supabase, challenge.user_id, challenge.code_hash, code)
  if (!valid) {
    await supabase
      .from('bo_mfa_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('id', challenge.id)
    return { ok: false, reason: 'invalid' }
  }

  // Consommation : challenge fermé + pas TOTP marqué (anti-rejeu). Un
  // succès sur secret non confirmé termine l'enrôlement (totp_enrolled).
  await supabase
    .from('bo_mfa_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id)
  if (acceptedStep !== null) {
    await supabase
      .from('bo_users')
      .update({ totp_last_step: acceptedStep, totp_enrolled: true })
      .eq('id', challenge.user_id)
  }
  return { ok: true, userId: challenge.user_id }
}

/** Vérifie le second facteur : hash inline (mode test) ou TOTP / code de récupération. */
async function checkSecondFactor(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  inlineCodeHash: string | null,
  code: string
): Promise<{ valid: boolean; acceptedStep: number | null }> {
  // Mode test (dev) : code inline historique.
  if (inlineCodeHash) {
    return { valid: hashCode(code) === inlineCodeHash, acceptedStep: null }
  }

  const { data: user } = await supabase
    .from('bo_users')
    .select('mfa_secret, totp_last_step, totp_recovery_codes')
    .eq('id', userId)
    .single()
  // Pas de secret provisionné : rien à vérifier (départ non enrôlé).
  if (!user?.mfa_secret) return { valid: false, acceptedStep: null }

  // 1. Code TOTP à 6 chiffres (fenêtre ±1 pas, anti-rejeu par pas consommé).
  const verdict = verifyTotpCode(user.mfa_secret, code, Date.now(), user.totp_last_step ?? null)
  if (verdict.ok) return { valid: true, acceptedStep: verdict.step }

  // 2. Code de récupération (usage unique, format XXXX-XXXX normalisé).
  if (isRecoveryCodeFormat(code)) {
    const hashedCodes = Array.isArray(user.totp_recovery_codes) ? (user.totp_recovery_codes as string[]) : []
    const index = findRecoveryCodeIndex(code, hashedCodes)
    if (index >= 0) {
      const remaining = hashedCodes.filter((_, i) => i !== index)
      await supabase
        .from('bo_users')
        .update({ totp_recovery_codes: remaining })
        .eq('id', userId)
      return { valid: true, acceptedStep: null }
    }
  }

  return { valid: false, acceptedStep: null }
}
