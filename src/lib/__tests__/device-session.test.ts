import { createHash } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock du client admin : on pilote les réponses Supabase par table/opération
// pour tester la logique de claim sans réseau.
const fromMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import {
  claimDeviceSession,
  DEVICE_SESSION_COOKIE,
  getDeviceSubject,
  subjectFor,
} from '@/lib/device-session'

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

function requestWithCookie(cookieValue?: string): NextRequest {
  const headers = new Headers()
  if (cookieValue) headers.set('cookie', `${DEVICE_SESSION_COOKIE}=${cookieValue}`)
  return new NextRequest('http://localhost/api/test', { headers })
}

const EXPIRES = new Date('2027-01-01T00:00:00.000Z')
const OWNER_TOKEN = 'owner-token'
const OTHER_TOKEN = 'other-device-token'

function sessionRow(tokenHash: string, revokedAt: string | null = null) {
  return {
    id: 'session-1',
    subject: 'merchant:m-1',
    token_hash: tokenHash,
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: EXPIRES.toISOString(),
    revoked_at: revokedAt,
  }
}

/** Enchaîne select (lecture session) puis update/insert selon le scénario. */
function mockSupabase(existing: ReturnType<typeof sessionRow> | null) {
  let updated: { token_hash: string; revoked_at?: string | null } | null = null
  let inserted: { subject: string; token_hash: string } | null = null

  fromMock.mockImplementation((table: string) => {
    expect(table).toBe('device_sessions')
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: () => Promise.resolve({ data: existing }),
      update: (payload: { token_hash: string; revoked_at?: string | null }) => {
        updated = payload
        return builder
      },
      insert: (payload: { subject: string; token_hash: string }) => {
        inserted = payload
        return builder
      },
    }
    return builder
  })

  return {
    get updated() {
      return updated
    },
    get inserted() {
      return inserted
    },
  }
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('claimDeviceSession — re-liaison inter-appareils', () => {
  it('crée une session pour un compte sans liaison (isNew)', async () => {
    const store = mockSupabase(null)
    const result = await claimDeviceSession(subjectFor('merchant', 'm-1'), requestWithCookie())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.isNew).toBe(true)
    expect(store.inserted?.subject).toBe('merchant:m-1')
    expect(store.inserted?.token_hash).toBe(hashToken(result.token))
  })

  it('renouvelle sans blocage quand le même appareil présente son cookie', async () => {
    const store = mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OWNER_TOKEN)
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.isNew).toBe(false)
    expect(store.updated?.token_hash).toBe(hashToken(result.token))
  })

  it('re-lie la session à un nouvel appareil quand allowTakeover est passé (login vérifié)', async () => {
    const store = mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OTHER_TOKEN),
      { allowTakeover: true }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.isNew).toBe(false)
    // Le token tourné appartient au nouvel appareil — l'ancien cookie ne
    // résoudra plus (getDeviceSubject ne le retrouvera pas).
    expect(store.updated?.token_hash).toBe(hashToken(result.token))
    expect(store.updated?.token_hash).not.toBe(hashToken(OWNER_TOKEN))
  })

  it('re-lie aussi un appareil sans cookie quand allowTakeover est passé', async () => {
    const store = mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const result = await claimDeviceSession(
      subjectFor('producteur', 'p-1'),
      requestWithCookie(),
      { allowTakeover: true }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(store.updated?.token_hash).toBe(hashToken(result.token))
  })

  it('refuse toujours un appareil sans preuve quand allowTakeover est absent (409)', async () => {
    mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OTHER_TOKEN)
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toBe('Ce compte est déjà utilisé sur un autre appareil.')
  })

  it('exige une session existante quand requireExisting est passé (403)', async () => {
    mockSupabase(null)
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OTHER_TOKEN),
      { requireExisting: true }
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('laisse passer requireExisting quand la session existe (renouvellement 409 possible)', async () => {
    mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OTHER_TOKEN),
      { requireExisting: true }
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
  })
})

describe('getDeviceSubject — révocation applicative (MODE-949, S-11)', () => {
  it('retourne le subject d’une session vivante non révoquée', async () => {
    mockSupabase(sessionRow(hashToken(OWNER_TOKEN)))
    const subject = await getDeviceSubject(requestWithCookie(OWNER_TOKEN))
    expect(subject).toBe('merchant:m-1')
  })

  it('refuse une session RÉVOQUÉE même si son TTL de 365 j court encore', async () => {
    mockSupabase(sessionRow(hashToken(OWNER_TOKEN), '2026-09-21T10:00:00.000Z'))
    const subject = await getDeviceSubject(requestWithCookie(OWNER_TOKEN))
    expect(subject).toBeNull()
  })

  it('le claim re-liaison (preuve de secret) remet revoked_at à NULL', async () => {
    const existing = sessionRow(hashToken(OTHER_TOKEN), '2026-09-21T10:00:00.000Z')
    const mock = mockSupabase(existing)
    const result = await claimDeviceSession(
      subjectFor('merchant', 'm-1'),
      requestWithCookie(OTHER_TOKEN),
      { allowTakeover: true }
    )

    expect(result.ok).toBe(true)
    expect(mock.updated).not.toBeNull()
    expect(mock.updated?.revoked_at).toBeNull()
    expect(mock.updated?.token_hash).not.toBe(existing.token_hash)
  })
})
