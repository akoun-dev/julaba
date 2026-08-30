import { randomBytes, createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const DEVICE_SESSION_COOKIE = 'julaba_device'
// The app never asks the server to re-verify a password after registration —
// PIN/pattern/visual-code login is entirely local (compared against a hash
// stored on-device). So this cookie is the only thing standing between "the
// server trusts merchantId/producteurId/identificateurId as plain request
// parameters" and an actual owner check, and it has to survive as long as
// the app stays installed, not just one browser session.
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

/**
 * First-claim-wins device binding for a subject ("merchant:<id>" etc). The
 * first caller to claim a given subject owns it from then on: a later claim
 * for an already-bound subject only succeeds if the request already carries
 * that exact subject's own still-valid cookie (a renewal from the same
 * device), otherwise it's rejected — so merely knowing an id (which leaks
 * trivially, e.g. in every GET's query string) is never enough to take over
 * an already-claimed account.
 */
export async function claimDeviceSession(subject: string, request: NextRequest): Promise<ClaimResult> {
  const existing = await db.deviceSession.findUnique({ where: { subject } })
  const presentedToken = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  const presentedHash = presentedToken ? hashToken(presentedToken) : null

  if (existing && existing.tokenHash !== presentedHash) {
    return { ok: false, status: 409, error: 'Ce compte est déjà utilisé sur un autre appareil.' }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.deviceSession.upsert({
    where: { subject },
    create: { subject, tokenHash: hashToken(token), expiresAt },
    update: { tokenHash: hashToken(token), expiresAt },
  })
  return { ok: true, token, expiresAt, isNew: !existing }
}

/** Resolves the subject ("merchant:<id>" etc) bound to this request's device cookie, or null. */
export async function getDeviceSubject(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(DEVICE_SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.deviceSession.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!session || session.expiresAt < new Date()) return null
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
