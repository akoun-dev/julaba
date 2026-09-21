import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MINUTES = 15

export function isLockedOut(user: { locked_until: string | null } | { lockedUntil: Date | null }): boolean {
  const lockedUntil = 'locked_until' in user
    ? (user.locked_until ? new Date(user.locked_until) : null)
    : user.lockedUntil
  return !!lockedUntil && lockedUntil.getTime() > Date.now()
}

/**
 * MODE-964 (AUDIT-005 A5-F19) — enregistrement d'un échec de connexion
 * back-office délégué à la RPC `record_backoffice_auth_failure` (migration
 * 20260922110000) : incrément + seuil + pose du verrou tiennent dans UN
 * statement UPDATE atomique côté SQL.
 *
 * AVANT : la route passait `user.failed_login_attempts` lu à l'étape SELECT
 * et cette fonction réécrivait compteur+1 en applicatif — lecture-modifier-
 * écriture (TOCTOU, leçon I-07) : sous concurrence les échecs se perdaient et
 * le seuil de verrouillage était repoussé ; l'ancien paramètre
 * `currentAttempts` est SUPPRIMÉ (la base est la seule source de vérité).
 *
 * CONTRAT FAIL-OPEN : si la RPC est indisponible (base injoignable,
 * migration 20260922110000 pas encore appliquée — cf. F-02), l'échec est
 * journalisé puis ignoré : la route répond 401 normalement au lieu de
 * tomber en 500 (leçon MODE-961 — une migration absente ne doit pas rendre
 * chaque connexion en erreur). Le garde IP partagé (auth-lookup-guard.ts,
 * RPC atomiques 20260921130000) reste actif dans ce scénario ; la perte se
 * limite au compteur par compte. Symétrique du contrat F-01.
 */
export async function registerFailedAttempt(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  try {
    const { error } = await supabase.rpc('record_backoffice_auth_failure', {
      p_user_id: userId,
      p_max_attempts: MAX_FAILED_ATTEMPTS,
      p_lock_minutes: LOCK_DURATION_MINUTES,
    })
    if (error) throw error
  } catch (error) {
    console.error('[backoffice-auth] record_backoffice_auth_failure indisponible, fail-open:', error)
  }
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
// MODE-964 : le compteur PAR COMPTE du back-office est lui aussi passé aux
// RPC atomiques SQL (record_backoffice_auth_failure, 20260922110000) —
// plus aucun compteur d'auth manipulé en lire-modifier-écrire applicatif.
