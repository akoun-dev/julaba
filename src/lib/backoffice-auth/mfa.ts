import { randomInt, createHash } from 'crypto'
import { db } from '@/lib/db'

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * Issue a server-side MFA challenge for a user who has just passed the
 * password check. No SMS/email delivery provider is wired up yet, so
 * whoever needs the code for genuinely isolated manual testing has to set
 * BACKOFFICE_MFA_TEST_CODE themselves — there is no built-in default. Every
 * other case, in every environment (this deliberately does NOT special-case
 * "not production": a staging/preview/demo deployment is still a real
 * deployed environment, not an isolated test), gets a real random code. The
 * code itself is never logged — until a delivery channel exists, the only
 * ways to read it are BACKOFFICE_MFA_TEST_CODE or a direct DB lookup, never
 * a log line a log aggregator could capture.
 */
export async function createMfaChallenge(userId: string) {
  // BACKOFFICE_MFA_TEST_CODE is ignored outright in production, even if set
  // by mistake — a fixed code must never be reachable in a real deployment.
  const testCode = process.env.NODE_ENV === 'production' ? undefined : process.env.BACKOFFICE_MFA_TEST_CODE
  const code = testCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  const challenge = await db.boMfaChallenge.create({
    data: { userId, codeHash: hashCode(code), expiresAt },
  })
  console.info(`[backoffice-mfa] Challenge ${challenge.id} créé, expire ${expiresAt.toISOString()}`)
  return { challengeId: challenge.id, expiresAt }
}

export type MfaVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' }

export async function verifyMfaChallenge(challengeId: string, code: string): Promise<MfaVerifyResult> {
  const challenge = await db.boMfaChallenge.findUnique({ where: { id: challengeId } })
  if (!challenge || challenge.consumedAt) return { ok: false, reason: 'invalid' }
  if (challenge.expiresAt < new Date()) return { ok: false, reason: 'expired' }
  if (challenge.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' }

  if (hashCode(code) !== challenge.codeHash) {
    await db.boMfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } })
    return { ok: false, reason: 'invalid' }
  }

  await db.boMfaChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
  return { ok: true, userId: challenge.userId }
}
