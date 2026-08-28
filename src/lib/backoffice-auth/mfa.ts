import { randomInt, createHash } from 'crypto'
import { db } from '@/lib/db'

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * Issue a server-side MFA challenge for a user who has just passed the
 * password check. No SMS/email delivery provider is wired up yet, so the
 * one-time code is logged server-side rather than faked as "any code
 * works" client-side — the next step is to plug an actual delivery
 * channel into this function.
 */
export async function createMfaChallenge(userId: string) {
  // Keep local/demo authentication deterministic for manual and automated tests;
  // production always receives a cryptographically random one-time code.
  const testCode = process.env.NODE_ENV === 'production'
    ? undefined
    : process.env.BACKOFFICE_MFA_TEST_CODE || '123456'
  const code = testCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  const challenge = await db.boMfaChallenge.create({
    data: { userId, codeHash: hashCode(code), expiresAt },
  })
  console.info(
    `[backoffice-mfa] Code de vérification (challenge ${challenge.id}, expire ${expiresAt.toISOString()}): ${code}`
  )
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
