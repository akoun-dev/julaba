import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// MODE-1014 (AUDIT-013) — transitions du workflow des demandes d'information
// sous garde de concurrence :
//   • sans expectedStatus (rétro-compat) → update par id seul, contrat
//     historique inchangé (préconditions métier 409 conservées) ;
//   • avec expectedStatus → l'UPDATE ne porte que si info_workflow_status
//     vaut ENCORE l'état vu par le client (IS NULL pour les lignes legacy) :
//     0 ligne affectée → 409 CONCURRENCY_CONFLICT — deux back-offices
//     concurrents ne peuvent plus s'écraser une transition.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/backoffice-auth', () => ({
  requireBackofficePermission: (...a: unknown[]) => authMock(...a),
  canAccessZone: (...a: unknown[]) => canAccessZoneMock(...a),
  logAudit: (...a: unknown[]) => logAuditMock(...a),
}))

vi.mock('@/lib/notifications/server', () => ({
  createNotification: (...a: unknown[]) => notifyMock(...a),
}))

import { PATCH } from '@/app/api/backoffice/information-requests/route'

const authMock = vi.fn()
const canAccessZoneMock = vi.fn()
const logAuditMock = vi.fn()
const notifyMock = vi.fn()
const fromMock = vi.fn()

type Result = { data: unknown; error: { message?: string; code?: string } | null }

interface Captured {
  table: string
  selectCols?: string
  eqs: Array<[string, unknown]>
  updated?: Record<string, unknown>
}
const captured: Captured[] = []
let resultsQueue: Result[] = []

function makeBuilder(table: string) {
  const state: Captured = { table, eqs: [] }
  captured.push(state)
  const b = {} as Record<string, unknown> & {
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
  }
  b.select = (cols: string) => {
    state.selectCols = cols
    return b
  }
  b.update = (payload: Record<string, unknown>) => {
    state.updated = payload
    return b
  }
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([col, val])
    return b
  }
  b.is = (col: string, val: unknown) => {
    state.eqs.push([`is:${col}`, val])
    return b
  }
  b.single = async () => resultsQueue.shift() ?? { data: null, error: null }
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resultsQueue.shift() ?? { data: null, error: null }).then(res, rej)
  return b
}

function req(body: unknown): NextRequest {
  return new NextRequest(new Request('http://localhost/api/backoffice/information-requests', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1', dossier_id: 'DOS-1', actor_name: 'Koffi', actor_type: 'marchand', zone: 'Bouaké',
    phone: '+225 07', identificateur_id: 'id1', identificateur_name: 'Adjoua',
    info_request_reason: 'précisions', info_workflow_status: 'a_traiter',
    info_requested_at: '2026-09-20T10:00:00Z', info_assigned_to: null, info_assigned_at: null,
    info_response: null, info_responded_by: null, info_responded_at: null,
    info_closed_by: null, info_closed_at: null, status: 'info_demandee',
    submitted_at: '2026-09-19T08:00:00Z',
    ...overrides,
  }
}

/** Lecture (single) puis écriture (select *) — file d'attente dans l'ordre SQL.
 * Une seule paire de résultats par PATCH : from() est appelé deux fois
 * (lecture + écriture), la file est remplie à la PREMIÈRE invocation. */
function queueSql(read: Result, update: Result) {
  let queued = false
  fromMock.mockImplementation((table: string) => {
    const b = makeBuilder(table)
    if (!queued) {
      resultsQueue.push(read, update)
      queued = true
    }
    return b
  })
}

beforeEach(() => {
  authMock.mockReset()
  canAccessZoneMock.mockReset()
  logAuditMock.mockReset().mockResolvedValue(undefined)
  notifyMock.mockReset().mockResolvedValue(undefined)
  fromMock.mockReset()
  captured.length = 0
  resultsQueue = []
  authMock.mockResolvedValue({
    user: { id: 'u1', name: 'Awa Koné', email: 'awa@julaba.ci', role: 'admin', zone: null },
  })
  canAccessZoneMock.mockReturnValue(true)
})

describe('PATCH /api/backoffice/information-requests — transitions concurrentes (MODE-1014)', () => {
  it('deux back-offices, même précondition : la première transition passe, la seconde est refusée 409', async () => {
    // 1er agent : vue à jour (a_traiter) → transition acceptée.
    queueSql({ data: row(), error: null }, { data: [row({ info_workflow_status: 'en_cours', info_assigned_to: 'Awa Koné' })], error: null })
    const ok = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'a_traiter' }))
    expect(ok.status).toBe(200)
    expect(captured[1].eqs).toEqual([['id', 'd1'], ['info_workflow_status', 'a_traiter']])

    // 2e agent : vue périmée (croit encore a_traiter, la ligne est en_cours).
    queueSql({ data: row({ info_workflow_status: 'en_cours', info_assigned_to: 'Awa Koné' }), error: null }, { data: [], error: null })
    const conflit = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'a_traiter' }))
    expect(conflit.status).toBe(409)
    const body = await conflit.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(body.erreur).toContain('modifiée par un autre agent')
    // 3 requêtes SQL au total : lecture+écriture du 1er agent, lecture seule
    // du 2e (aucun update construit — refus avant écriture).
    expect(captured).toHaveLength(3)
    expect(captured[2].updated).toBeUndefined()
  })

  it('expectedStatus périmé détecté à la lecture : 409 AVANT toute écriture', async () => {
    queueSql({ data: row({ info_workflow_status: 'en_cours', info_assigned_to: 'Autre' }), error: null }, { data: [], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'a_traiter' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(captured).toHaveLength(1) // lecture seule — aucun update construit
    expect(logAuditMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('transition concurrente entre lecture et écriture : 0 ligne affectée → 409', async () => {
    queueSql({ data: row(), error: null }, { data: [], error: null }) // l'UPDATE ne matche plus la précondition
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'a_traiter' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('CONCURRENCY_CONFLICT')
    expect(captured[1].updated!.info_workflow_status).toBe('en_cours')
    expect(logAuditMock).not.toHaveBeenCalled()
  })

  it('ligne legacy (statut null) + expectedStatus a_traiter : la garde attend IS NULL', async () => {
    queueSql({ data: row({ info_workflow_status: null }), error: null }, { data: [row({ info_workflow_status: 'en_cours' })], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'a_traiter' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.workflowStatus).toBe('en_cours')
    expect(captured[1].eqs).toEqual([['id', 'd1'], ['is:info_workflow_status', null]])
  })

  it('expectedStatus hors workflow : 400 Zod, aucune lecture', async () => {
    queueSql({ data: row(), error: null }, { data: [row()], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge', expectedStatus: 'expiree' }))
    expect(res.status).toBe(400)
    expect(captured).toHaveLength(0)
  })

  it('rétro-compat : sans expectedStatus, l\u2019update porte sur l\u2019id seul (contrat historique)', async () => {
    queueSql({ data: row(), error: null }, { data: [row({ info_workflow_status: 'en_cours', info_assigned_to: 'Awa Koné' })], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.workflowStatus).toBe('en_cours')
    expect(captured[1].eqs).toEqual([['id', 'd1']])
  })

  it('précondition métier inchangée : prendre_en_charge sur traitee → 409 « déjà traitée »', async () => {
    queueSql({ data: row({ info_workflow_status: 'traitee' }), error: null }, { data: [], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.erreur).toBe('La demande est déjà traitée')
    expect(captured).toHaveLength(1)
  })

  it('repondre avec garde : écriture filtrée sur en_cours, réponse + notification conservées', async () => {
    const responded = row({ info_workflow_status: 'repondue', info_response: 'Voilà la réponse', info_responded_by: 'Awa Koné', info_assigned_to: 'Awa Koné' })
    queueSql({ data: row({ info_workflow_status: 'en_cours', info_assigned_to: 'Awa Koné' }), error: null }, { data: [responded], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'repondre', response: 'Voilà la réponse', expectedStatus: 'en_cours' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.workflowStatus).toBe('repondue')
    expect(captured[1].eqs).toEqual([['id', 'd1'], ['info_workflow_status', 'en_cours']])
    expect(captured[1].updated!.info_response).toBe('Voilà la réponse')
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock).toHaveBeenCalledTimes(1)
  })

  it('demande disparue (statut ≠ info_demandee) → 404 inchangé', async () => {
    queueSql({ data: null, error: { message: 'PGRST116' } }, { data: [], error: null })
    const res = await PATCH(req({ id: 'd1', action: 'prendre_en_charge' }))
    expect(res.status).toBe(404)
    expect(captured).toHaveLength(1)
  })
})
