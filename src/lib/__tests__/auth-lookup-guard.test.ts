import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// AUDIT-005 F-01 — garde IP partagée des routes pré-auth (login back-office,
// lookup identificateur). Compteurs en base via les RPC atomiques
// get_auth_lock / record_auth_failure / reset_auth_failures, contrat
// fail-open en cas d'indisponibilité de la base.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ rpc: rpcMock }),
}))

import {
  checkIpLock,
  ipGuardMessage,
  ipGuardRetryAfter,
  recordIpFailure,
  resetIpFailures,
} from '../auth-lookup-guard'

const rpcMock = vi.fn()

function requestWithIp(ip?: string): NextRequest {
  const headers = new Headers()
  if (ip) headers.set('x-forwarded-for', ip)
  return new NextRequest('http://localhost/api/test', { method: 'GET', headers })
}

const LOCKED_UNTIL = () => new Date(Date.now() + 12 * 60 * 1000).toISOString()

beforeEach(() => {
  rpcMock.mockReset()
})

describe('checkIpLock', () => {
  it('pas de verrou quand get_auth_lock renvoie null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    const result = await checkIpLock(requestWithIp('1.2.3.4'))
    expect(result).toEqual({ locked: false })
    expect(rpcMock).toHaveBeenCalledWith('get_auth_lock', { p_scope: 'ip:1.2.3.4' })
  })

  it('verrou actif → locked + retryAfterSeconds calculé sur locked_until', async () => {
    rpcMock.mockResolvedValue({ data: LOCKED_UNTIL(), error: null })
    const result = await checkIpLock(requestWithIp('1.2.3.4'))
    expect(result.locked).toBe(true)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(12 * 60)
  })

  it('locked_until expiré → pas de verrou', async () => {
    rpcMock.mockResolvedValue({
      data: new Date(Date.now() - 1000).toISOString(),
      error: null,
    })
    const result = await checkIpLock(requestWithIp('1.2.3.4'))
    expect(result.locked).toBe(false)
  })

  it('FAIL-OPEN : erreur RPC → pas de verrou (requête laisse passer)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkIpLock(requestWithIp('1.2.3.4'))
    expect(result).toEqual({ locked: false })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('FAIL-OPEN : exception réseau → pas de verrou', async () => {
    rpcMock.mockRejectedValue(new Error('connection refused'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkIpLock(requestWithIp('1.2.3.4'))
    expect(result.locked).toBe(false)
    errorSpy.mockRestore()
  })

  it('IP absente → scope de repli (ip:inconnu)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await checkIpLock(requestWithIp(undefined))
    expect(rpcMock).toHaveBeenCalledWith('get_auth_lock', { p_scope: 'ip:inconnu' })
  })
})

describe('recordIpFailure', () => {
  it('échec compté via record_auth_failure avec la politique 20/5/15', async () => {
    rpcMock.mockResolvedValue({
      data: { attempts: 3, locked: false, locked_until: null },
      error: null,
    })
    const result = await recordIpFailure(requestWithIp('5.6.7.8'))
    expect(result).toEqual({ locked: false })
    expect(rpcMock).toHaveBeenCalledWith('record_auth_failure', {
      p_scope: 'ip:5.6.7.8',
      p_max_attempts: 20,
      p_window_minutes: 5,
      p_lock_minutes: 15,
    })
  })

  it('seuil atteint → locked + retryAfterSeconds', async () => {
    rpcMock.mockResolvedValue({
      data: { attempts: 20, locked: true, locked_until: LOCKED_UNTIL() },
      error: null,
    })
    const result = await recordIpFailure(requestWithIp('5.6.7.8'))
    expect(result.locked).toBe(true)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('réponse RPC inattendue → pas de verrou (fail-open)', async () => {
    rpcMock.mockResolvedValue({ data: 'not-an-object', error: null })
    const result = await recordIpFailure(requestWithIp('5.6.7.8'))
    expect(result).toEqual({ locked: false })
  })

  it('FAIL-OPEN : erreur RPC → pas de verrou, requête poursuivie', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordIpFailure(requestWithIp('5.6.7.8'))
    expect(result.locked).toBe(false)
    errorSpy.mockRestore()
  })
})

describe('resetIpFailures', () => {
  it('succès → reset_auth_failures sur le scope IP', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await resetIpFailures(requestWithIp('9.9.9.9'))
    expect(rpcMock).toHaveBeenCalledWith('reset_auth_failures', { p_scope: 'ip:9.9.9.9' })
  })

  it('échec RPC : best-effort, ne lève jamais', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(resetIpFailures(requestWithIp('9.9.9.9'))).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })
})

describe('messages et entêtes 429', () => {
  it('message sans retryAfter générique', () => {
    expect(ipGuardMessage(undefined)).toBe('Trop de tentatives. Réessayez plus tard.')
  })

  it('message avec retryAfter arrondi à la minute supérieure', () => {
    expect(ipGuardMessage(90)).toBe('Trop de tentatives. Réessayez dans 2 minutes.')
    expect(ipGuardMessage(60)).toBe('Trop de tentatives. Réessayez dans 1 minute.')
  })

  it('Retry-After absent tant que non verrouillé', () => {
    expect(ipGuardRetryAfter({ locked: false })).toEqual({})
  })

  it('Retry-After en secondes quand verrouillé', () => {
    expect(ipGuardRetryAfter({ locked: true, retryAfterSeconds: 120 })).toEqual({
      'Retry-After': '120',
    })
  })
})
