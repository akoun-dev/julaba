import { randomBytes, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
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
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function requestMeta(request: NextRequest) {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: request.headers.get('user-agent') || null,
  }
}

/** Create a new server-side session row and return the raw token for the cookie. */
export async function createSession(userId: string, request: NextRequest) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const meta = requestMeta(request)
  await db.boSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
  })
  return { token, expiresAt }
}

/** Resolve the currently authenticated Backoffice user from the session cookie, if any. */
export async function getSessionUser(request: NextRequest): Promise<BoSessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.boSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (!session.user.isActive) return null

  // Best-effort activity tracking — never block the request on this write.
  db.boSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as BoRole,
    zone: session.user.zone,
    isActive: session.user.isActive,
  }
}

/** Revoke the session tied to the request's cookie (logout). */
export async function revokeSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return
  await db.boSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
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
