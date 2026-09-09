import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export function isLockedOut(user: { locked_until: string | null } | { lockedUntil: Date | null }): boolean {
  const lockedUntil = 'locked_until' in user
    ? (user.locked_until ? new Date(user.locked_until) : null)
    : user.lockedUntil
  return !!lockedUntil && lockedUntil.getTime() > Date.now()
}

export async function registerFailedAttempt(userId: string, currentAttempts: number): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const attempts = currentAttempts + 1
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await supabase
      .from('bo_users')
      .update({
        failed_login_attempts: 0,
        locked_until: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
      })
      .eq('id', userId)
    return
  }
  await supabase
    .from('bo_users')
    .update({ failed_login_attempts: attempts })
    .eq('id', userId)
}

export async function resetFailedAttempts(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  await supabase
    .from('bo_users')
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq('id', userId)
}

// ---- Best-effort per-IP rate limiting -------------------------------------
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
