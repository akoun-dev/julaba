import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-964 (AUDIT-005 A5-F19) — le verrouillage par compte back-office passe
// par la RPC atomique record_backoffice_auth_failure (migration
// 20260922110000) : plus aucun lire-modifier-écrire applicatif sur
// bo_users.failed_login_attempts (TOCTOU, leçon I-07). Contrat fail-open si
// la RPC est indisponible (migration non appliquée, base injoignable).

const rpcMock = vi.fn()
const eqMock = vi.fn()
const updateMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ update: updateMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}))

import { isLockedOut, registerFailedAttempt, resetFailedAttempts } from '../backoffice-auth/lockout'

beforeEach(() => {
  rpcMock.mockReset()
  updateMock.mockClear()
  eqMock.mockReset()
  eqMock.mockResolvedValue({ data: null, error: null })
})

describe('registerFailedAttempt (RPC atomique)', () => {
  it('appelle record_backoffice_auth_failure avec la politique 5/15', async () => {
    rpcMock.mockResolvedValue({
      data: { attempts: 1, locked: false, locked_until: null },
      error: null,
    })
    await expect(registerFailedAttempt('bo-user-1')).resolves.toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('record_backoffice_auth_failure', {
      p_user_id: 'bo-user-1',
      p_max_attempts: 5,
      p_lock_minutes: 15,
    })
  })

  it('ne lit JAMAIS le compteur applicatif : un seul paramètre, pas de lecture préalable de bo_users', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await expect(registerFailedAttempt('bo-user-1')).resolves.toBe(true)
    expect(fromMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('seuil atteint (locked=true côté SQL) : résout sans exception, la base porte le verrou', async () => {
    rpcMock.mockResolvedValue({
      data: { attempts: 0, locked: true, locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
      error: null,
    })
    await expect(registerFailedAttempt('bo-user-1')).resolves.toBe(true)
  })

  it('FAIL-CLOSED (AUDIT-012 P1-10) : erreur RPC (migration absente) → false, pas de levée', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function record_backoffice_auth_failure does not exist' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(registerFailedAttempt('bo-user-1')).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('FAIL-CLOSED (AUDIT-012 P1-10) : exception réseau → false, pas de levée', async () => {
    rpcMock.mockRejectedValue(new Error('connection refused'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(registerFailedAttempt('bo-user-1')).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('resetFailedAttempts (UPDATE atomique PostgREST)', () => {
  it('remet compteur et verrou à zéro en une seule écriture', async () => {
    await resetFailedAttempts('bo-user-2')
    expect(updateMock).toHaveBeenCalledWith({ failed_login_attempts: 0, locked_until: null })
    expect(eqMock).toHaveBeenCalledWith('id', 'bo-user-2')
  })
})

describe('isLockedOut', () => {
  const FUTURE = new Date(Date.now() + 60 * 1000)
  const PAST = new Date(Date.now() - 60 * 1000)

  it('locked_until futur → verrouillé', () => {
    expect(isLockedOut({ locked_until: FUTURE.toISOString() })).toBe(true)
  })

  it('locked_until passé ou absent → libre', () => {
    expect(isLockedOut({ locked_until: PAST.toISOString() })).toBe(false)
    expect(isLockedOut({ locked_until: null })).toBe(false)
  })

  it('variante camelCase lockedUntil (Date)', () => {
    expect(isLockedOut({ lockedUntil: FUTURE })).toBe(true)
    expect(isLockedOut({ lockedUntil: PAST })).toBe(false)
    expect(isLockedOut({ lockedUntil: null })).toBe(false)
  })
})
