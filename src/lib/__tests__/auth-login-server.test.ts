import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-936 (AUDIT-003 S-03) — cœur des routes de login : code brut vérifié
// contre scrypt/legacy + lockout via les RPC SQL (record/reset/get_auth_lock).
// Le mock Supabase pilote from() (lookup compte + re-hash) et rpc() (verrous).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

import { hashCodeScrypt, verifyCode } from '@/lib/auth-pin'
import { verifyLoginWithLockout } from '../auth-login-server'

type Row = Record<string, unknown>

const fromMock = vi.fn()
const rpcMock = vi.fn()

/** Résultat d'un appel RPC simulé, par nom de fonction. */
const rpcResults = new Map<string, unknown>()

function makeSelectBuilder(row: Row | null) {
  const promise = Promise.resolve({ data: row, error: null })
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    single: () => promise,
    update: (payload: Row) => {
      updates.push(payload)
      return builder
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
  return builder
}

let tables: Map<string, Row | null>
let updates: Row[]

function requestWithIp(ip?: string): NextRequest {
  const headers = new Headers()
  if (ip) headers.set('x-forwarded-for', ip)
  return new NextRequest('http://localhost/api/test', { method: 'POST', headers })
}

const ACCOUNT = (pinHash: string, authMethod = 'pin'): Row => ({
  id: 'm-1',
  phone: '0701020304',
  first_name: 'Awa',
  auth_method: authMethod,
  pin_hash: pinHash,
  pattern_hash: null,
  visual_code_hash: null,
  sexe: null,
})

beforeEach(() => {
  tables = new Map()
  updates = []
  fromMock.mockReset()
  rpcMock.mockReset()
  rpcResults.clear()
  rpcMock.mockImplementation((fn: string) => Promise.resolve({ data: rpcResults.get(fn) ?? null, error: null }))
  fromMock.mockImplementation((table: string) => makeSelectBuilder(tables.get(table) ?? null))
})

describe("verifyLoginWithLockout — validations d'entrée", () => {
  it('400 si le code est manquant ou non textuel', async () => {
    const ok = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: undefined, request: requestWithIp() })
    expect(ok).toMatchObject({ ok: false, status: 400 })
    const empty = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: 12345 as unknown as string, request: requestWithIp() })
    expect(empty).toMatchObject({ ok: false, status: 400 })
  })

  it('400 si la méthode est inconnue', async () => {
    const ok = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'voix' as 'pin', code: '1234', request: requestWithIp() })
    expect(ok).toMatchObject({ ok: false, status: 400 })
  })

  it("404 si le compte n'existe pas (aucun échec compté)", async () => {
    tables.set('merchants', null)
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0799999999', method: 'pin', code: '1234', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(rpcMock).not.toHaveBeenCalledWith('record_auth_failure', expect.anything())
  })
})

describe('verifyLoginWithLockout — vérification du code', () => {
  it('succès direct sur un hash scrypt, compteurs remis à zéro (compte + IP)', async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp('203.0.113.9') })
    expect(result.ok).toBe(true)
    const scopes = rpcMock.mock.calls.filter(([fn]) => fn === 'reset_auth_failures').map(([, args]) => args.p_scope)
    expect(scopes).toEqual(expect.arrayContaining(['merchants:m-1', 'ip:203.0.113.9']))
    // Pas de re-hash : le stockage était déjà scrypt.
    expect(updates).toHaveLength(0)
  })

  it('succès legacy djb2 → re-hash transparent en scrypt (vecteur seed 1234)', async () => {
    tables.set('merchants', ACCOUNT('1509442'))
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '1234', request: requestWithIp() })
    expect(result.ok).toBe(true)
    expect(updates).toHaveLength(1)
    const newHash = updates[0].pin_hash as string
    expect(newHash.startsWith('scrypt:')).toBe(true)
    // Le nouveau hash vérifie bien le même code brut.
    expect(verifyCode('1234', newHash)).toBe(true)
  })

  it("401 « Code incorrect » + échecs enregistrés pour le compte ET l'IP", async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '9999', request: requestWithIp('203.0.113.9') })
    expect(result).toMatchObject({ ok: false, status: 401, error: 'Code incorrect' })
    const failures = rpcMock.mock.calls.filter(([fn]) => fn === 'record_auth_failure')
    const scopes = failures.map(([, args]) => args.p_scope)
    expect(scopes).toContain('merchants:m-1')
    expect(scopes).toContain('ip:203.0.113.9')
  })

  it('401 quand la méthode du compte ne correspond pas (pin demandé, compte schéma)', async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468'), 'pattern'))
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it("401 quand le compte n'a pas de hash pour cette méthode", async () => {
    tables.set('merchants', ACCOUNT(null as unknown as string))
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })
})

describe('verifyLoginWithLockout — verrous', () => {
  it("429 avant toute lecture de compte quand l'IP est verrouillée", async () => {
    rpcResults.set('get_auth_lock', new Date(Date.now() + 10 * 60 * 1000).toISOString())
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp('203.0.113.9') })
    expect(result).toMatchObject({ ok: false, status: 429 })
    if (!result.ok && result.retryAfterSeconds) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(600)
    }
    // Aucun lookup : la garde réseau passe avant.
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('429 quand le COMPTE est verrouillé (même avec le bon code)', async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    rpcMock.mockImplementation((fn: string, args?: { p_scope?: string }) => {
      if (fn === 'get_auth_lock') {
        const locked = args?.p_scope === 'merchants:m-1'
        return Promise.resolve({ data: locked ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 429 })
    expect(String((result as { error?: string }).error)).toMatch(/Trop de tentatives/)
  })

  it("l'échec déclenche le verrou compte → 429 avec message et délai", async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'record_auth_failure') {
        return Promise.resolve({ data: { attempts: 5, locked: true, locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '9999', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 429 })
    expect(String((result as { error?: string }).error)).toMatch(/15 minutes?/)
  })

  it("l'échec simple (verrou non déclenché) reste 401", async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'record_auth_failure') {
        return Promise.resolve({ data: { attempts: 2, locked: false, locked_until: null }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '9999', request: requestWithIp() })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })
})

describe('verifyLoginWithLockout — verrou expiré', () => {
  it("un get_auth_lock dans le passé n'est plus un verrou", async () => {
    tables.set('merchants', ACCOUNT(hashCodeScrypt('2468')))
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_auth_lock') {
        return Promise.resolve({ data: new Date(Date.now() - 1000).toISOString(), error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    const result = await verifyLoginWithLockout({ table: 'merchants', phone: '0701020304', method: 'pin', code: '2468', request: requestWithIp() })
    expect(result.ok).toBe(true)
  })
})
