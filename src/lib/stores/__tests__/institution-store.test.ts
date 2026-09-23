import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstitutionStore } from '../institution-store'

const INSTITUTION_USER = {
  id: 'bo-user-inst-001',
  email: 'institution@julaba.ci',
  name: 'Direction générale du commerce',
  role: 'institution',
  zone: null,
  isActive: true,
} as const

const BACKOFFICE_USER = {
  id: 'bo-user-001',
  email: 'aminata@julaba.ci',
  name: 'Aminata KONE',
  role: 'super_admin',
  zone: null,
  isActive: true,
} as const

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  )
}

function mockFetchStatus(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ erreur: 'nope' }), { status }))
  )
}

describe('institution store', () => {
  beforeEach(() => {
    useInstitutionStore.setState({
      insUser: null,
      insUserRole: 'institution',
      insSessionChecked: false,
    })
    vi.restoreAllMocks()
  })

  it('checkInsSession: 401 → insUser null + checked true', async () => {
    mockFetchStatus(401)
    await useInstitutionStore.getState().checkInsSession()

    expect(useInstitutionStore.getState().insUser).toBeNull()
    expect(useInstitutionStore.getState().insSessionChecked).toBe(true)
  })

  it('checkInsSession: 200 rôle institution → insUser fixé + checked true', async () => {
    mockFetchOk(INSTITUTION_USER)
    await useInstitutionStore.getState().checkInsSession()

    const state = useInstitutionStore.getState()
    expect(state.insUser).toEqual(INSTITUTION_USER)
    expect(state.insUserRole).toBe('institution')
    expect(state.insSessionChecked).toBe(true)
  })

  it('checkInsSession: 200 rôle non-institution → insUser reste null (échec-fermé)', async () => {
    mockFetchOk(BACKOFFICE_USER)
    await useInstitutionStore.getState().checkInsSession()

    expect(useInstitutionStore.getState().insUser).toBeNull()
    expect(useInstitutionStore.getState().insSessionChecked).toBe(true)
  })

  it('checkInsSession: erreur réseau → insUser null + checked true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await useInstitutionStore.getState().checkInsSession()

    expect(useInstitutionStore.getState().insUser).toBeNull()
    expect(useInstitutionStore.getState().insSessionChecked).toBe(true)
  })

  it('checkInsSession: 200 rôle inattendu (string absent) → échec-fermé', async () => {
    mockFetchOk({ id: 'x', email: 'x@y.ci', name: 'X', role: undefined, zone: null, isActive: true })
    await useInstitutionStore.getState().checkInsSession()

    expect(useInstitutionStore.getState().insUser).toBeNull()
  })

  it('setInsAuth pose l\'utilisateur et le rôle', () => {
    useInstitutionStore.getState().setInsAuth(INSTITUTION_USER)

    const state = useInstitutionStore.getState()
    expect(state.insUser).toEqual(INSTITUTION_USER)
    expect(state.insUserRole).toBe('institution')
    expect(state.insSessionChecked).toBe(true)
  })

  it('insLogout: appelle POST /api/backoffice/logout puis vide insUser', async () => {
    useInstitutionStore.getState().setInsAuth(INSTITUTION_USER)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await useInstitutionStore.getState().insLogout()

    expect(fetchMock).toHaveBeenCalledWith('/api/backoffice/logout', { method: 'POST' })
    expect(useInstitutionStore.getState().insUser).toBeNull()
  })
})