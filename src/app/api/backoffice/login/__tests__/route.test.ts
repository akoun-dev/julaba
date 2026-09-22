import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// AUDIT-005 A5-F21 — contrat de la route de login back-office :
//   - 429 garde IP partagée (auth-lookup-guard, F-01) AVANT tout traitement ;
//   - 401 générique indistinguable (pas d'énumération d'emails) ;
//   - 423 compte verrouillé (isLockedOut) ;
//   - échec mot de passe → registerFailedAttempt MODE-964 : UN SEUL
//     argument (la base est la seule source de vérité, plus de compteur
//     applicatif passé en paramètre) + recordIpFailure ;
//   - succès → reset compte+IP, session cookie, rehash transparent,
//     forcePasswordChange exposé.
//
// Les modules auth sont MOCKÉS à cette hauteur : ils ont leurs propres
// suites (backoffice-lockout.test.ts, auth-lookup-guard.test.ts). Ici on
// verrouille le CÂBLAGE de la route.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  verifyPassword: (pwd: string, _hash: string) => verifyMock(pwd),
  needsRehash: (hash: string) => rehashMock(hash),
  hashPassword: vi.fn(() => 'newhash'),
  createSession: () => sessionMock(),
  sessionCookieOptions: (expiresAt: Date) => ({ httpOnly: true, expires: expiresAt }),
  SESSION_COOKIE: 'bo_session',
  isLockedOut: () => lockedMock(),
  registerFailedAttempt: (id: string) => regFailMock(id),
  resetFailedAttempts: (id: string) => resetFailMock(id),
  logAudit: (payload: unknown) => auditMock(payload),
}))

vi.mock('@/lib/auth-lookup-guard', () => ({
  checkIpLock: () => ipLockMock(),
  ipGuardMessage: vi.fn((s?: number) => (s ? `Réessayez dans ${Math.ceil(s / 60)} min` : 'Trop de tentatives.')),
  ipGuardRetryAfter: vi.fn((r: { retryAfterSeconds?: number }) =>
    r.retryAfterSeconds ? { 'Retry-After': String(r.retryAfterSeconds) } : {}),
  recordIpFailure: () => ipFailMock(),
  resetIpFailures: () => ipResetMock(),
}))

import { POST } from '../route'

const verifyMock = vi.fn<(pwd: string) => boolean>()
const rehashMock = vi.fn<(hash: string) => boolean>()
const sessionMock = vi.fn<() => Promise<{ token: string; expiresAt: Date }>>()
const lockedMock = vi.fn<() => boolean>()
const regFailMock = vi.fn<(id: string) => Promise<void>>()
const resetFailMock = vi.fn<(id: string) => Promise<void>>()
const auditMock = vi.fn<(payload: unknown) => Promise<void>>()
const ipLockMock = vi.fn<() => Promise<{ locked: boolean; retryAfterSeconds?: number }>>()
const ipFailMock = vi.fn<() => Promise<{ locked: boolean }>>()
const ipResetMock = vi.fn<() => Promise<void>>()

// Chaîne from('bo_users') : select().eq().single() = lookup utilisateur ;
// update().eq().select().single() = last_login ; update().eq() = rehash.
const fromMock = vi.fn()
let lookupResult: { data: Record<string, unknown> | null; error: unknown }
let updatedResult: { data: Record<string, unknown> | null; error: unknown }
let updatePayloads: Array<Record<string, unknown>>

function makeBoUsersBuilder() {
  // Latch : un builder = une chaîne from() — dès que update() est appelé,
  // single() renvoie le résultat « post-update » (select() dans la même
  // chaîne ne réinitialise pas le mode).
  let mode: 'select' | 'update' = 'select'
  const builder = {
    select: () => builder,
    update: (payload: Record<string, unknown>) => {
      mode = 'update'
      updatePayloads.push(payload)
      return builder
    },
    eq: () => builder,
    single: () =>
      Promise.resolve(mode === 'update' ? updatedResult : lookupResult),
    then: (
      res: (v: { data: unknown; error: null }) => unknown,
      rej: (e: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(res, rej),
  }
  return builder
}

function loginRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backoffice/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const ACTIVE_USER = {
  id: 'user-1',
  email: 'op@julaba.test',
  name: 'Opérateur',
  role: 'operateur_terrain',
  zone: 'NORD',
  is_active: true,
  password_hash: 'goodhash',
  force_password_change: false,
  failed_login_attempts: 3,
  locked_until: null,
}

beforeEach(() => {
  verifyMock.mockReset().mockReturnValue(true)
  rehashMock.mockReset().mockReturnValue(false)
  sessionMock.mockReset().mockResolvedValue({ token: 'tok-123', expiresAt: new Date(Date.now() + 3600_000) })
  lockedMock.mockReset().mockReturnValue(false)
  regFailMock.mockReset().mockResolvedValue(undefined)
  resetFailMock.mockReset().mockResolvedValue(undefined)
  auditMock.mockReset().mockResolvedValue(undefined)
  ipLockMock.mockReset().mockResolvedValue({ locked: false })
  ipFailMock.mockReset().mockResolvedValue({ locked: false })
  ipResetMock.mockReset().mockResolvedValue(undefined)
  lookupResult = { data: { ...ACTIVE_USER }, error: null }
  updatedResult = { data: { ...ACTIVE_USER }, error: null }
  updatePayloads = []
  fromMock.mockReset().mockImplementation(makeBoUsersBuilder)
})

describe('POST /api/backoffice/login — gardes pré-auth', () => {
  it('verrou IP actif → 429 + Retry-After, sans toucher à la base ni compter un échec compte', async () => {
    ipLockMock.mockResolvedValue({ locked: true, retryAfterSeconds: 600 })
    const res = await POST(loginRequest({ email: 'a@b.c', password: 'x' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('600')
    expect(fromMock).not.toHaveBeenCalled()
    expect(regFailMock).not.toHaveBeenCalled()
    expect(ipFailMock).not.toHaveBeenCalled()
  })

  it('email ou mot de passe manquant → 401, sans recordIpFailure', async () => {
    const res = await POST(loginRequest({ email: 'a@b.c' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' })
    expect(ipFailMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/backoffice/login — comptes', () => {
  it('email inconnu → 401 générique + échec compté IP, sans échec compte (compte inconnu)', async () => {
    lookupResult = { data: null, error: null }
    const res = await POST(loginRequest({ email: 'ghost@julaba.test', password: 'x' }))
    expect(res.status).toBe(401)
    expect((await res.json()).erreur).toBe('Identifiants invalides')
    expect(ipFailMock).toHaveBeenCalledTimes(1)
    expect(regFailMock).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('compte désactivé → même 401 générique (pas de distinction inconnu/inactif)', async () => {
    lookupResult = { data: { ...ACTIVE_USER, is_active: false }, error: null }
    const res = await POST(loginRequest({ email: 'op@julaba.test', password: 'goodpass' }))
    expect(res.status).toBe(401)
    expect(ipFailMock).toHaveBeenCalledTimes(1)
  })

  it('compte verrouillé → 423 + login_locked, ni échec compte ni échec IP', async () => {
    lockedMock.mockReturnValue(true)
    const res = await POST(loginRequest({ email: 'op@julaba.test', password: 'wrong' }))
    expect(res.status).toBe(423)
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'login_locked', module: 'auth' }))
    expect(regFailMock).not.toHaveBeenCalled()
    expect(ipFailMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/backoffice/login — échec mot de passe (MODE-964)', () => {
  it('registerFailedAttempt appelé avec UN SEUL argument (id), la base porte le compteur', async () => {
    verifyMock.mockReturnValue(false)
    const res = await POST(loginRequest({ email: 'op@julaba.test', password: 'wrong' }))
    expect(res.status).toBe(401)
    expect((await res.json()).erreur).toBe('Identifiants invalides')
    expect(regFailMock).toHaveBeenCalledTimes(1)
    expect(regFailMock.mock.calls[0]).toEqual(['user-1'])
    expect(ipFailMock).toHaveBeenCalledTimes(1)
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'login_failed' }))
  })
})

describe('POST /api/backoffice/login — succès', () => {
  it('reset compte + IP, cookie de session posé, last_login mis à jour', async () => {
    const res = await POST(loginRequest({ email: 'op@julaba.test', password: 'goodpass' }))
    expect(res.status).toBe(200)
    expect(resetFailMock).toHaveBeenCalledWith('user-1')
    expect(ipResetMock).toHaveBeenCalledTimes(1)
    expect(sessionMock).toHaveBeenCalledTimes(1)
    expect(res.cookies.get('bo_session')?.value).toBe('tok-123')
    const body = await res.json()
    expect(body).toMatchObject({ id: 'user-1', email: 'op@julaba.test', role: 'operateur_terrain', forcePasswordChange: false })
    expect(updatePayloads.some((p) => 'last_login' in p)).toBe(true)
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'login_success' }))
  })

  it('mot de passe legacy → rehash transparent écrit en base', async () => {
    rehashMock.mockReturnValue(true)
    await POST(loginRequest({ email: 'op@julaba.test', password: 'goodpass' }))
    expect(updatePayloads).toContainEqual({ password_hash: 'newhash' })
  })

  it('mot de passe temporaire → forcePasswordChange true dans la réponse', async () => {
    updatedResult = { data: { ...ACTIVE_USER, force_password_change: true }, error: null }
    const body = await (await POST(loginRequest({ email: 'op@julaba.test', password: 'goodpass' }))).json()
    expect(body.forcePasswordChange).toBe(true)
  })
})
