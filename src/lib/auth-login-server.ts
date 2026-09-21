import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeAuthPhone } from '@/lib/auth-multi'
import {
  ACCOUNT_LOCK_MINUTES,
  ACCOUNT_MAX_FAILURES,
  ACCOUNT_WINDOW_MINUTES,
  IP_LOCK_MINUTES,
  IP_MAX_FAILURES,
  IP_WINDOW_MINUTES,
  accountScope,
  hashCodeScrypt,
  ipScope,
  needsRehash,
  normalizeIp,
  verifyCode,
} from '@/lib/auth-pin'

/**
 * MODE-936 (AUDIT-003 S-03) — cœur commun des trois routes de login
 * (/api/merchant/login, /api/producteur/login, /api/cooperatives/
 * cooperateurs/login) : vérification du code BRUT contre le hash stocké
 * (scrypt, format back-office ; legacy djb2 re-hashé après succès) +
 * verrouillage serveur des tentatives :
 *
 *  - par compte : 5 échecs → compte verrouillé 15 min (fenêtre 15 min) ;
 *  - par IP : 20 échecs en 5 min → réseau verrouillé 15 min ;
 *
 * les compteurs vivent dans la table auth_lockouts, manipulés ATOMIQUEMENT
 * par les RPC record_auth_failure / reset_auth_failures / get_auth_lock
 * (migration 20260921130000) — un compteur lu-modifié-écrit côté
 * application serait un TOCTOU (leçon I-07 du Sprint B).
 *
 * Le code transitant désormais en clair sur le fil (HTTPS), l'ancien
 * contrat « hash djb2 envoyé par le client » disparaît : un appel qui
 * n'envoie pas `code` est rejeté 400 — c'est le prix de la fermeture du
 * pass-the-hash (la fuite du hash djb2 stocké valait mot de passe).
 */

type AuthMethod = 'pin' | 'pattern' | 'visual'

const FIELD_BY_METHOD: Record<AuthMethod, string> = {
  pin: 'pin_hash',
  pattern: 'pattern_hash',
  visual: 'visual_code_hash',
}

/** Tables d'auth acceptées (royaumes à compte identifié). */
export type AuthTable = 'merchants' | 'producers' | 'cooperateurs'

/** Compte tel que lu depuis merchants/producers/cooperateurs (colonnes utiles). */
export interface LoginAccount {
  id: string
  auth_method?: string
  first_name?: string
  phone?: string
  sexe?: string | null
  categorie_marchand?: string | null
  [field: string]: unknown
}

export type LoginVerification =
  | { ok: true; account: LoginAccount; field: string }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number }

interface LockProbe {
  locked: boolean
  retryAfterSeconds?: number
}

async function getLock(scope: string): Promise<LockProbe> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase.rpc('get_auth_lock', { p_scope: scope })
  const lockedUntil = typeof data === 'string' ? data : null
  if (!lockedUntil) return { locked: false }
  const remainingMs = new Date(lockedUntil).getTime() - Date.now()
  if (remainingMs <= 0) return { locked: false }
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) }
}

function lockMessage(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) {
    return 'Trop de tentatives. Réessayez plus tard.'
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
}

export async function verifyLoginWithLockout(params: {
  table: AuthTable
  phone: string
  method: AuthMethod
  code: unknown
  request: NextRequest
}): Promise<LoginVerification> {
  const { table, method, code, request } = params
  const phone = normalizeAuthPhone(String(params.phone || ''))

  if (!phone || typeof code !== 'string' || !code) {
    return { ok: false, status: 400, error: 'Champs requis manquants' }
  }
  if (!['pin', 'pattern', 'visual'].includes(method)) {
    return { ok: false, status: 400, error: 'Champs requis manquants' }
  }

  // 1. Verrou réseau — avant toute lecture de compte (garde le moins cher
  //    en premier, et un attaquant par IP ne fait pas travailler la base).
  const ipLock = await getLock(ipScope(normalizeIp(request.headers.get('x-forwarded-for'))))
  if (ipLock.locked) {
    return { ok: false, status: 429, error: lockMessage(ipLock.retryAfterSeconds), retryAfterSeconds: ipLock.retryAfterSeconds }
  }

  const supabase = createSupabaseAdminClient()
  const { data } = await supabase.from(table).select('*').eq('phone', phone).single()
  if (!data) {
    return { ok: false, status: 404, error: 'Compte non trouvé' }
  }
  const account = data as unknown as LoginAccount

  // 2. Verrou compte.
  const scope = accountScope(table, account.id)
  const accountLock = await getLock(scope)
  if (accountLock.locked) {
    return { ok: false, status: 429, error: lockMessage(accountLock.retryAfterSeconds), retryAfterSeconds: accountLock.retryAfterSeconds }
  }

  const field = FIELD_BY_METHOD[method]
  const stored = account[field] as string | null
  if (account.auth_method !== method || !stored || !verifyCode(code, stored)) {
    // 3. Échec — les deux compteurs avancent ATOMIQUEMENT (RPC SQL).
    const [accountOutcome] = await Promise.all([
      recordFailure(scope, ACCOUNT_MAX_FAILURES, ACCOUNT_WINDOW_MINUTES, ACCOUNT_LOCK_MINUTES),
      recordFailure(ipScope(normalizeIp(request.headers.get('x-forwarded-for'))), IP_MAX_FAILURES, IP_WINDOW_MINUTES, IP_LOCK_MINUTES),
    ])
    if (accountOutcome?.locked) {
      const retryAfterSeconds = accountOutcome.locked_until
        ? Math.max(1, Math.ceil((new Date(accountOutcome.locked_until).getTime() - Date.now()) / 1000))
        : ACCOUNT_LOCK_MINUTES * 60
      return { ok: false, status: 429, error: lockMessage(retryAfterSeconds), retryAfterSeconds }
    }
    return { ok: false, status: 401, error: 'Code incorrect' }
  }

  // 4. Succès — re-hash transparent des comptes legacy djb2 (le code brut
  //    vient d'être prouvé, c'est le seul moment où on peut le re-hacher),
  //    puis remise à zéro des deux compteurs.
  if (needsRehash(stored)) {
    await supabase.from(table).update({ [field]: hashCodeScrypt(code) }).eq('id', account.id)
  }
  await Promise.all([
    supabase.rpc('reset_auth_failures', { p_scope: scope }),
    supabase.rpc('reset_auth_failures', { p_scope: ipScope(normalizeIp(request.headers.get('x-forwarded-for'))) }),
  ])

  return { ok: true, account, field }
}

async function recordFailure(
  scope: string,
  maxAttempts: number,
  windowMinutes: number,
  lockMinutes: number,
): Promise<{ locked: boolean; locked_until?: string } | null> {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase.rpc('record_auth_failure', {
    p_scope: scope,
    p_max_attempts: maxAttempts,
    p_window_minutes: windowMinutes,
    p_lock_minutes: lockMinutes,
  })
  if (!data || typeof data !== 'object') return null
  const outcome = data as { attempts?: number; locked?: boolean; locked_until?: string | null }
  return { locked: Boolean(outcome.locked), locked_until: outcome.locked_until ?? undefined }
}
