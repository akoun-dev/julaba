import { randomBytes, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeIp } from '@/lib/auth-pin'
import type { BoRole } from '@/lib/backoffice-permissions'

export const SESSION_COOKIE = 'bo_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12h

export interface BoSessionUser {
  id: string
  email: string
  name: string
  role: BoRole
  zone: string | null
  isActive: boolean
  /**
   * A11-F09 (AUDIT-011) : le compte est encore sous mot de passe temporaire
   * (force_password_change) — lu EN BASE à chaque résolution de session et
   * appliqué par requireBackofficePermission (refus de toute route BO tant
   * que le flag est vrai, sauf le changement de mot de passe lui-même).
   * AVANT le flag était purement UI : la session émise avant rotation était
   * pleinement valide sur toutes les routes.
   */
  mustChangePassword: boolean
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function requestMeta(request: NextRequest) {
  return {
    // MODE-1005 (AUDIT-012 P2) : sémantique XFF centralisée dans normalizeIp
    // (premier maillon posé par le reverse proxy) — repli null en métadonnée.
    ipAddress: normalizeIp(request.headers.get('x-forwarded-for'), null),
    userAgent: request.headers.get('user-agent') || null,
  }
}

/** Create a new server-side session row and return the raw token for the cookie. */
export async function createSession(userId: string, request: NextRequest) {
  const supabase = createSupabaseAdminClient()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const meta = requestMeta(request)

  await supabase.from('bo_sessions').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
    ip_address: meta.ipAddress,
    user_agent: meta.userAgent,
  })

  return { token, expiresAt }
}

/** Resolve the currently authenticated Backoffice user from the session cookie, if any. */
export async function getSessionUser(request: NextRequest): Promise<BoSessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null

  const supabase = createSupabaseAdminClient()

  const { data: session } = await supabase
    .from('bo_sessions')
    .select('*')
    .eq('token_hash', hashToken(token))
    .single()

  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) return null

  const { data: user } = await supabase
    .from('bo_users')
    .select('*')
    .eq('id', session.user_id)
    .single()

  if (!user || !user.is_active) return null

  // Best-effort activity tracking
  supabase
    .from('bo_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id)
    .then(() => {})

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as BoRole,
    zone: user.zone,
    isActive: user.is_active,
    mustChangePassword: !!user.force_password_change,
  }
}

/** Revoke the session tied to the request's cookie (logout). */
export async function revokeSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return

  const supabase = createSupabaseAdminClient()
  await supabase
    .from('bo_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}

export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(0),
  }
}
