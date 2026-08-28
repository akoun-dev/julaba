import { db } from '@/lib/db'

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now()
}

export async function registerFailedAttempt(userId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await db.boUser.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    })
    return
  }
  await db.boUser.update({ where: { id: userId }, data: { failedLoginAttempts: attempts } })
}

export async function resetFailedAttempts(userId: string): Promise<void> {
  await db.boUser.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: null } })
}

// ---- Best-effort per-IP rate limiting -------------------------------------
// In-memory sliding window. This resets on cold start / across serverless
// instances, so it's a defense-in-depth layer on top of the per-account
// lockout above (which is persisted in the database), not a substitute for
// a shared store (Redis) in a genuinely distributed production deployment.

const WINDOW_MS = 5 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 20
const attemptsByIp = new Map<string, number[]>()

export function isIpRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = (attemptsByIp.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  timestamps.push(now)
  attemptsByIp.set(ip, timestamps)
  return timestamps.length > MAX_REQUESTS_PER_WINDOW
}
