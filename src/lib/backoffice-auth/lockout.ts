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

// AUDIT-005 F-01 : l'ancien quota IP « best-effort » en mémoire process
// (Map attemptsByIp) est SUPPRIMÉ — il n'était effectif que sur une seule
// instance et disparaissait à chaque redémarrage. Les routes pré-auth
// (login back-office, lookup identificateur) utilisent désormais la garde
// partagée src/lib/auth-lookup-guard.ts, adossée à la table auth_lockouts
// (RPC atomiques de la migration 20260921130000).
