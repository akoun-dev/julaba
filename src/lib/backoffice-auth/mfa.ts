import { randomInt, createHash } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * Issue a server-side MFA challenge for a user who has just passed the
 * password check.
 */
export async function createMfaChallenge(userId: string) {
  const configuredTestCode = process.env.BACKOFFICE_MFA_TEST_CODE?.trim()
  const testMode = process.env.NODE_ENV !== 'production' && process.env.BACKOFFICE_MFA_TEST_MODE === 'true'
  const testCode = testMode && configuredTestCode && /^\d{6}$/.test(configuredTestCode)
    ? configuredTestCode
    : undefined
  const code = testCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)

  const supabase = createSupabaseAdminClient()
  const { data: challenge } = await supabase
    .from('bo_mfa_challenges')
    .insert({
      user_id: userId,
      code_hash: hashCode(code),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (testCode) {
    console.info(`[backoffice-mfa] Mode test actif: code ${testCode}, challenge ${challenge!.id}`)
  } else {
    console.info(`[backoffice-mfa] Challenge ${challenge!.id} créé, expire ${expiresAt.toISOString()}`)
  }
  return { challengeId: challenge!.id, expiresAt }
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

  if (hashCode(code) !== challenge.code_hash) {
    await supabase
      .from('bo_mfa_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('id', challenge.id)
    return { ok: false, reason: 'invalid' }
  }

  await supabase
    .from('bo_mfa_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id)
  return { ok: true, userId: challenge.user_id }
}
