import { beforeEach, describe, expect, it, vi } from 'vitest'

// AUDIT-012 P1-11 — probes d'exploitation : /api/healthz (liveness, zéro
// dépendance) et /api/readyz (readiness, dépendance Supabase vérifiée).

const selectMock = vi.fn()
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET as healthz } from '@/app/api/healthz/route'
import { GET as readyz } from '@/app/api/readyz/route'

beforeEach(() => {
  selectMock.mockReset()
})

describe('GET /api/healthz (liveness)', () => {
  it('200 { status: ok } sans JAMAIS toucher Supabase', async () => {
    const res = await healthz()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/readyz (readiness)', () => {
  it('200 { status: ready } quand Supabase répond (head-count bo_users)', async () => {
    selectMock.mockResolvedValue({ count: 7, error: null })
    const res = await readyz()
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ready')
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })

  it('503 { status: unavailable } quand la dépendance échoue — jamais de secret dans le corps', async () => {
    selectMock.mockResolvedValue({ count: null, error: { message: 'connection refused' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await readyz()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('unavailable')
    expect(JSON.stringify(body)).not.toContain('connection refused')
    errorSpy.mockRestore()
  })

  it('503 quand le client lève (réseau mort)', async () => {
    selectMock.mockRejectedValue(new Error('dns failure'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await readyz()
    expect(res.status).toBe(503)
    errorSpy.mockRestore()
  })
})
