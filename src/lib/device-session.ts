import { randomBytes, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const DEVICE_SESSION_COOKIE = 'julaba_device'
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000

export type DeviceSubjectType = 'merchant' | 'producteur' | 'identificateur'

export function subjectFor(type: DeviceSubjectType, id: string): string {
  return `${type}:${id}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type ClaimResult =
  | { ok: true; token: string; expiresAt: Date; isNew: boolean }
  | { ok: false; status: number; error: string }

export async function claimDeviceSession(
  subject: string,
  request: NextRequest,
  opts?: { requireExisting?: boolean }
): Promise<ClaimResult> {
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('subject', subject)
    .single()

  if (opts?.requireExisting && !existing) {
    return { ok: false, status: 403, error: 'Connectez-vous d\'abord avec votre code pour lier cet appareil.' }
  }

  const presentedToken = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  const presentedHash = presentedToken ? hashToken(presentedToken) : null

  if (existing && existing.token_hash !== presentedHash) {
    return { ok: false, status: 409, error: 'Ce compte est déjà utilisé sur un autre appareil.' }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  if (existing) {
    await supabase
      .from('device_sessions')
      .update({ token_hash: hashToken(token), expires_at: expiresAt.toISOString() })
      .eq('subject', subject)
  } else {
    await supabase.from('device_sessions').insert({
      subject,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
    })
  }

  return { ok: true, token, expiresAt, isNew: !existing }
}

/** Resolves the subject ("merchant:<id>" etc) bound to this request's device cookie, or null. */
export async function getDeviceSubject(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  if (!token) return null

  const supabase = createSupabaseAdminClient()
  const { data: session } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('token_hash', hashToken(token))
    .single()

  if (!session || new Date(session.expires_at) < new Date()) return null
  return session.subject
}

export function deviceSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
