import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// AUDIT-005 A5-F21 — contrat de la route pré-auth de lookup identificateur :
//   - 400 sans query, 429 garde IP partagée (F-01) ;
//   - recherche par téléphone (10 chiffres normalisés) OU par code agent ;
//   - compte inconnu ou désactivé → { found: false } + échec compté IP
//     (pas de distinction inconnu/inactif — pas de fuite d'existence) ;
//   - réponse MINIMALE : id/name/firstName/lastName/agentCode/zone —
//     le téléphone est volontairement ABSENT (AUDIT-005, PII pré-auth) ;
//   - dégradation gracieuse si la base n'a pas les colonnes récentes
//     (fallback sur select réduit au lieu d'une 500).

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/auth-lookup-guard', () => ({
  checkIpLock: () => ipLockMock(),
  ipGuardMessage: vi.fn((s?: number) => (s ? `Réessayez dans ${Math.ceil(s / 60)} min` : 'Trop de tentatives.')),
  ipGuardRetryAfter: vi.fn((r: { retryAfterSeconds?: number }) =>
    r.retryAfterSeconds ? { 'Retry-After': String(r.retryAfterSeconds) } : {}),
  recordIpFailure: () => ipFailMock(),
}))

// normalizeAgentPhone est une fonction PURE du module agent-code :
// on utilise l'implémentation réelle (pas de mock).

import { GET } from '../route'

const ipLockMock = vi.fn<() => Promise<{ locked: boolean; retryAfterSeconds?: number }>>()
const ipFailMock = vi.fn<() => Promise<{ locked: boolean }>>()

const fromMock = vi.fn()
// File de résultats : chaque nouvelle chaîne from() consomme le résultat
// suivant (1er = requête principale, 2e = fallback base non migrée).
let resultsQueue: Array<{ data: Record<string, unknown> | null; error: { message: string } | null }>
let captured: Array<{ eqs: Array<[string, string]>; selectCols: string }>

function makeIdentBuilder() {
  const state = { eqs: [] as Array<[string, string]>, selectCols: '' }
  captured.push(state)
  const builder = {
    select: (cols: string) => {
      state.selectCols = cols
      return builder
    },
    eq: (col: string, val: unknown) => {
      state.eqs.push([col, String(val)])
      return builder
    },
    limit: () => builder,
    maybeSingle: () => Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }),
  }
  return builder
}

function lookupRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/identificateur/auth/lookup?query=${encodeURIComponent(query)}`)
}

const ACTIVE_IDENT = {
  id: 'ident-1',
  name: 'Kouassi',
  first_name: 'Kouassi',
  last_name: 'N’Guessan',
  agent_code: 'JID-0001',
  phone: '0561111111',
  zone: 'NORD',
  is_active: true,
}

beforeEach(() => {
  ipLockMock.mockReset().mockResolvedValue({ locked: false })
  ipFailMock.mockReset().mockResolvedValue({ locked: false })
  captured = []
  resultsQueue = [{ data: { ...ACTIVE_IDENT }, error: null }]
  fromMock.mockReset().mockImplementation(makeIdentBuilder)
})

describe('GET /api/identificateur/auth/lookup — gardes', () => {
  it('query manquant → 400 sans interroger la base ni la garde IP', async () => {
    const res = await GET(lookupRequest('   '))
    expect(res.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
    expect(ipLockMock).not.toHaveBeenCalled()
  })

  it('verrou IP actif → 429 + Retry-After, base jamais interrogée', async () => {
    ipLockMock.mockResolvedValue({ locked: true, retryAfterSeconds: 300 })
    const res = await GET(lookupRequest('0561111111'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('300')
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/identificateur/auth/lookup — recherche', () => {
  it('numéro de téléphone → filtre sur phone normalisé, réponse sans phone (PII)', async () => {
    const res = await GET(lookupRequest('0561111111'))
    expect(res.status).toBe(200)
    expect(captured[0].eqs).toEqual([['phone', '0561111111']])
    const body = await res.json()
    expect(body).toMatchObject({
      found: true,
      id: 'ident-1',
      name: 'Kouassi',
      firstName: 'Kouassi',
      lastName: 'N’Guessan',
      agentCode: 'JID-0001',
      zone: 'NORD',
    })
    expect('phone' in body).toBe(false)
  })

  it('numéro au format international 225 → normalisé avant filtrage', async () => {
    await GET(lookupRequest('+225 05 61 11 11 11'))
    expect(captured[0].eqs).toEqual([['phone', '0561111111']])
  })

  it('code agent insensible à la casse → filtre sur agent_code', async () => {
    await GET(lookupRequest('jid-0001'))
    expect(captured[0].eqs).toEqual([['agent_code', 'JID-0001']])
  })

  it('compte inconnu → { found: false } + échec compté IP', async () => {
    resultsQueue = [{ data: null, error: null }]
    const res = await GET(lookupRequest('0561111111'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false })
    expect(ipFailMock).toHaveBeenCalledTimes(1)
  })

  it('compte désactivé → { found: false } indistinguable d’un compte inconnu', async () => {
    resultsQueue = [{ data: { ...ACTIVE_IDENT, is_active: false }, error: null }]
    const res = await GET(lookupRequest('0561111111'))
    expect(await res.json()).toEqual({ found: false })
    expect(ipFailMock).toHaveBeenCalledTimes(1)
  })

  it('base non migrée (colonne absente) → fallback colonnes réduites, pas de 500', async () => {
    resultsQueue = [
      { data: null, error: { message: 'column legacy_bo_identificateurs.first_name does not exist' } },
      { data: { id: 'ident-1', name: 'Kouassi', phone: '0561111111', zone: 'NORD', is_active: true }, error: null },
    ]
    const res = await GET(lookupRequest('0561111111'))
    expect(res.status).toBe(200)
    expect(captured).toHaveLength(2)
    expect(captured[1].selectCols).toBe('id, name, phone, zone, is_active')
    const body = await res.json()
    expect(body.found).toBe(true)
    expect(body.firstName).toBe('Kouassi')
    expect(body.lastName).toBe('')
    expect('phone' in body).toBe(false)
  })

  it('erreur base quelconque → 500 (pas de fuite de détail)', async () => {
    resultsQueue = [{ data: null, error: { message: 'connection refused' } }]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(lookupRequest('0561111111'))
    expect(res.status).toBe(500)
    expect((await res.json()).erreur).toBe('Erreur lors de la vérification du compte')
    errorSpy.mockRestore()
  })
})
