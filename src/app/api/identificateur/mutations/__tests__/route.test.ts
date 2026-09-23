import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// IDF-MUT-001 (AUDIT_MATRICE_47_CAS I-02) — contrat de la route mutations de
// l'app identificateur :
//   - lecture + création gardées par la session appareil (requireDeviceOwner),
//     jamais un id nu ;
//   - POST : champs requis (dossier, zones, motif), zone source ≠ destination,
//     statut initial 'en_attente', requested_by = marqueur `<nom> (<id>)` ;
//   - GET : filtre ilike sur requested_by contenant l'id (marqueur explicite),
//     tri created_at desc, projection camelCase.

vi.mock('@/lib/require-owner', () => ({
  requireDeviceOwner: (...a: unknown[]) => ownerMock(...a),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { GET, POST } from '../route'

const ownerMock = vi.fn()
const fromMock = vi.fn()

let inserted: Record<string, unknown> | null = null
let capturedIlike: [string, unknown] | null = null
let capturedOrder: string | null = null

const URL = 'http://localhost/api/identificateur/mutations?identificateurId=ident-1'

function getRequest(): NextRequest {
  return new NextRequest(URL)
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function chaineInsert(data: Record<string, unknown> | null, erreur: { message: string } | null = null) {
  fromMock.mockReset().mockReturnValueOnce({
    insert: (row: Record<string, unknown>) => {
      inserted = row
      return { select: () => ({ single: async () => ({ data, error: erreur }) }) }
    },
  })
}

function chaineList(rows: Record<string, unknown>[], erreur: { message: string } | null = null) {
  fromMock.mockReset().mockReturnValueOnce({
    select: () => ({
      ilike: (col: string, val: unknown) => {
        capturedIlike = [col, val]
        return {
          order: async (col2: string) => {
            capturedOrder = col2
            return { data: rows, error: erreur }
          },
        }
      },
    }),
  })
}

const ROW_ATTENTE = {
  id: 'm1',
  actor_id: 'ID-2026-0001',
  actor_name: 'Aya Koné',
  actor_type: 'marchand',
  from_zone: 'Adjamé',
  to_zone: 'Cocody',
  reason: 'Commerce localisé à Cocody',
  status: 'en_attente',
  requested_by: 'Kouassi (ident-1)',
  requested_at: '2026-09-01T08:00:00Z',
  created_at: '2026-09-01T08:00:00Z',
}

beforeEach(() => {
  ownerMock.mockReset().mockResolvedValue(null)
  fromMock.mockReset()
  inserted = null
  capturedIlike = null
  capturedOrder = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/identificateur/mutations', () => {
  it('session appareil refusée → la garde passe (401/403/400 relayés), base jamais écrite', async () => {
    ownerMock.mockResolvedValueOnce(new Response(JSON.stringify({ erreur: 'Session appareil requise' }), { status: 401 }))
    const res = await POST(postRequest({ actorId: 'x', actorName: 'A', fromZone: 'Adjamé', toZone: 'Cocody', reason: 'r' }))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('corps JSON invalide → 400', async () => {
    const res = await POST(new NextRequest(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))
    expect(res.status).toBe(400)
    expect((await res.json()).erreur).toBe('Corps de requête JSON invalide')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('champs obligatoires manquants → 400 avant la base', async () => {
    const res = await POST(postRequest({ actorName: 'Aya' }))
    expect(res.status).toBe(400)
    expect((await res.json()).erreur).toContain('obligatoires')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('motif obligatoire → 400', async () => {
    const res = await POST(postRequest({ actorId: 'ID-2026-0001', actorName: 'Aya Koné', fromZone: 'Adjamé', toZone: 'Cocody', reason: '   ' }))
    expect(res.status).toBe(400)
    expect((await res.json()).erreur).toContain('motif')
  })

  it('zone source = destination → 400', async () => {
    const res = await POST(postRequest({ actorId: 'ID-2026-0001', actorName: 'Aya Koné', fromZone: 'Adjamé', toZone: 'Adjamé', reason: 'r' }))
    expect(res.status).toBe(400)
    expect((await res.json()).erreur).toContain('différente')
  })

  it('insertion initialisée en_attente avec le marqueur demandeur, réponse 201 camelCase', async () => {
    chaineInsert({ ...ROW_ATTENTE })
    const res = await POST(postRequest({
      actorId: 'ID-2026-0001',
      actorName: 'Aya Koné',
      actorType: 'marchand',
      fromZone: 'Adjamé',
      toZone: 'Cocody',
      reason: 'Commerce localisé à Cocody',
      requestedBy: 'Kouassi (ident-1)',
    }))
    expect(res.status).toBe(201)
    expect(inserted).toMatchObject({
      actor_id: 'ID-2026-0001',
      actor_name: 'Aya Koné',
      from_zone: 'Adjamé',
      to_zone: 'Cocody',
      reason: 'Commerce localisé à Cocody',
      requested_by: 'Kouassi (ident-1)',
      status: 'en_attente',
    })
    expect(inserted?.requested_at).toBeTruthy()
    const body = (await res.json()) as { mutation: Record<string, unknown> }
    expect(body.mutation).toMatchObject({
      id: 'm1',
      actorId: 'ID-2026-0001',
      actorName: 'Aya Koné',
      fromZone: 'Adjamé',
      toZone: 'Cocody',
      status: 'en_attente',
    })
  })

  it('requestedBy absent → repli sur l\'identificateurId', async () => {
    chaineInsert({ ...ROW_ATTENTE })
    await POST(postRequest({ actorId: 'ID-2026-0001', actorName: 'Aya', fromZone: 'Adjamé', toZone: 'Cocody', reason: 'r' }))
    expect(inserted?.requested_by).toBe('ident-1')
  })

  it('erreur base → 500 uniforme', async () => {
    chaineInsert(null, { message: 'base injoignable' })
    const res = await POST(postRequest({ actorId: 'ID-2026-0001', actorName: 'Aya', fromZone: 'Adjamé', toZone: 'Cocody', reason: 'r' }))
    expect(res.status).toBe(500)
    expect((await res.json()).erreur).toBe('Erreur serveur')
  })
})

describe('GET /api/identificateur/mutations', () => {
  it('session appareil refusée → la garde passe, base jamais interrogée', async () => {
    ownerMock.mockResolvedValueOnce(new Response(JSON.stringify({ erreur: 'Session appareil requise' }), { status: 401 }))
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('filtre ilike sur requested_by contenant l\'id, tri created_at desc, projection camelCase', async () => {
    chaineList([{ ...ROW_ATTENTE }])
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    expect(capturedIlike).toEqual(['requested_by', '%ident-1%'])
    expect(capturedOrder).toBe('created_at')
    const body = (await res.json()) as { mutations: Array<Record<string, unknown>> }
    expect(body.mutations).toHaveLength(1)
    expect(body.mutations[0]).toMatchObject({
      actorId: 'ID-2026-0001',
      actorName: 'Aya Koné',
      actorType: 'marchand',
      fromZone: 'Adjamé',
      toZone: 'Cocody',
      status: 'en_attente',
    })
    expect('from_zone' in body.mutations[0]).toBe(false)
  })

  it('actor_type \'cooperatif\' normalisé en \'cooperative\'', async () => {
    chaineList([{ ...ROW_ATTENTE, actor_type: 'cooperatif' }])
    const res = await GET(getRequest())
    const body = (await res.json()) as { mutations: Array<{ actorType: string }> }
    expect(body.mutations[0].actorType).toBe('cooperative')
  })

  it('métacaractères ILIKE de l\'id échappés (cherchés littéralement)', async () => {
    const url = `http://localhost/api/identificateur/mutations?identificateurId=${encodeURIComponent('ident%_1')}`
    chaineList([{ ...ROW_ATTENTE }])
    await GET(new NextRequest(url))
    expect(capturedIlike).toEqual(['requested_by', '%ident\\%\\_1%'])
  })

  it('liste vide → tableau honnête', async () => {
    chaineList([])
    const res = await GET(getRequest())
    const body = (await res.json()) as { mutations: unknown[] }
    expect(body.mutations).toEqual([])
  })

  it('erreur base → 500 uniforme', async () => {
    chaineList([], { message: 'base injoignable' })
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).erreur).toBe('Erreur serveur')
  })
})