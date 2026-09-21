import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  IP_LOCK_MINUTES,
  IP_MAX_FAILURES,
  IP_WINDOW_MINUTES,
  ipScope,
  normalizeIp,
} from '@/lib/auth-pin'

/**
 * AUDIT-005 F-01 — garde IP partagée des routes d'auth PRÉ-authentification
 * qui ne vérifient pas de code (login back-office : sonde par IP avant
 * lecture de compte ; lookup identificateur : sonde d'existence de compte).
 *
 * AVANT : chaque route gardait son propre compteur DANS LE PROCESS
 * (Map en mémoire dans lockout.ts / route.ts). Sur un déploiement multi-
 * instances (Vercel), chaque instance a sa Map : un attaquant réparti sur N
 * instances obtient N × le quota, et un redémarrage réinitialise tout.
 *
 * APRÈS : la table auth_lockouts (migration 20260921130000, MODE-936) est
 * la source unique — les compteurs sont manipulés ATOMIQUEMENT par les RPC
 * record_auth_failure / get_auth_lock / reset_auth_failures, exactement
 * comme les trois routes de login terrain (auth-login-server.ts).
 *
 * Paramètres IP : 20 échecs en fenêtre de 5 min → verrou 15 min
 * (IP_MAX_FAILURES / IP_WINDOW_MINUTES / IP_LOCK_MINUTES, auth-pin.ts).
 *
 * CONTRAT FAIL-OPEN : si la base est injoignable, la garde LAISSE PASSER
 * (et journalise). Décision délibérée : un heartbeat d'authentification ne
 * doit pas pouvoir rendre le service indisponible pour TOUS les agents
 * parce que la table de verrous est inatteignable ; les verrous par compte
 * (bo_users.locked_until côté back-office, auth_lockouts par compte côté
 * terrain) restent la barrière principale contre le force-brute ciblé. Une
 * IP malveillante reste bornée par le quota par compte.
 */

export interface IpGuardResult {
  locked: boolean
  retryAfterSeconds?: number
}

function scopeFromRequest(request: NextRequest): string {
  return ipScope(normalizeIp(request.headers.get('x-forwarded-for')))
}

/** Message 429 générique (sans fuite de détail sur l'état interne). */
export function ipGuardMessage(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) {
    return 'Trop de tentatives. Réessayez plus tard.'
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
}

/** Entête Retry-After (secondes) à poser sur une réponse 429. */
export function ipGuardRetryAfter(result: IpGuardResult): Record<string, string> {
  return result.retryAfterSeconds
    ? { 'Retry-After': String(result.retryAfterSeconds) }
    : {}
}

/**
 * Sonde le verrou IP courant. FAIL-OPEN : toute erreur RPC (base
 * injoignable, fonction absente d'une base pas encore migrée) est
 * journalisée puis ignorée — la requête passe.
 */
export async function checkIpLock(request: NextRequest): Promise<IpGuardResult> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('get_auth_lock', {
      p_scope: scopeFromRequest(request),
    })
    if (error) throw error
    const lockedUntil = typeof data === 'string' ? data : null
    if (!lockedUntil) return { locked: false }
    const remainingMs = new Date(lockedUntil).getTime() - Date.now()
    if (remainingMs <= 0) return { locked: false }
    return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) }
  } catch (error) {
    // Fail-open assumé (voir contrat en tête de fichier).
    console.error('[auth-lookup-guard] get_auth_lock indisponible, fail-open:', error)
    return { locked: false }
  }
}

/**
 * Enregistre un échec pour l'IP appelante (sonde de compte inconnu, mot de
 * passe erroné…). FAIL-OPEN : si le RPC échoue, l'échec n'est pas compté
 * mais la requête appelante se poursuit normalement.
 */
export async function recordIpFailure(request: NextRequest): Promise<IpGuardResult> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('record_auth_failure', {
      p_scope: scopeFromRequest(request),
      p_max_attempts: IP_MAX_FAILURES,
      p_window_minutes: IP_WINDOW_MINUTES,
      p_lock_minutes: IP_LOCK_MINUTES,
    })
    if (error) throw error
    if (!data || typeof data !== 'object') return { locked: false }
    const outcome = data as { attempts?: number; locked?: boolean; locked_until?: string | null }
    if (!outcome.locked) return { locked: false }
    const retryAfterSeconds = outcome.locked_until
      ? Math.max(1, Math.ceil((new Date(outcome.locked_until).getTime() - Date.now()) / 1000))
      : IP_LOCK_MINUTES * 60
    return { locked: true, retryAfterSeconds }
  } catch (error) {
    console.error('[auth-lookup-guard] record_auth_failure indisponible, fail-open:', error)
    return { locked: false }
  }
}

/** Remise à zéro du compteur IP après un succès (best-effort, fail-open). */
export async function resetIpFailures(request: NextRequest): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.rpc('reset_auth_failures', {
      p_scope: scopeFromRequest(request),
    })
    if (error) throw error
  } catch (error) {
    console.error('[auth-lookup-guard] reset_auth_failures indisponible:', error)
  }
}
