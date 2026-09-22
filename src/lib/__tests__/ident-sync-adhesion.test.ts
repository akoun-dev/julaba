import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// DET-COOP-007 (MODE-978) — contrat client de l'adhésion coopérative à
// l'enrôlement :
//   1. le payload POST /api/backoffice/enrolments transporte
//      estMembreCooperative + cooperativeId (marchand SEULEMENT — un
//      producteur ne peut pas adhérer) ;
//   2. le verdict honnête du serveur (adhesionCooperative) traverse
//      submitDossierToServer jusqu'à l'agent ;
//   3. la grammaire messageAdhesionCoop couvre les 5 verdicts + l'absence
//      d'intention (null), jamais un succès inventé.
// Le rejeu offline du handler 'ident-dossier' est VERBATIM (payload
// stocké entier, MODE-943) : les nouveaux champs y voyagent sans retouche.

const handlers = new Map<string, (payload: unknown) => Promise<void>>()
vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  queuePendingSync: vi.fn(async () => ({ ok: true })),
  SyncConflictError: class SyncConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SyncConflictError'
    }
  },
}))

vi.mock('@/lib/claim-device-session', () => ({
  claimDeviceSession: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/stores/app-store', () => ({
  useAppStore: {
    getState: () => ({ merchantId: 'ident-1' }),
    setState: vi.fn(),
    subscribe: vi.fn(),
  },
}))

import { registerAllSyncHandlers } from '../sync-handlers'
import { messageAdhesionCoop, submitDossierToServer } from '../identificateur-sync'
import type { Dossier } from '../stores/identificateur-store'

const fetchMock = vi.fn()

function dossierBase(): Dossier {
  return {
    id: 'd-coop-1',
    actorType: 'marchand',
    agentId: 'ident-1',
    agentName: 'Awa TRAORE',
    dossierNumber: 'ID-2026-2001',
    firstName: 'Adjoua',
    lastName: 'KONE',
    phone: '0701020304',
    activite: 'Vente de riz',
    zone: 'Adjame',
    status: 'brouillon',
    createdAt: 1,
    updatedAt: 2,
    authMethod: 'pin',
    pin: '1234',
    pinHash: 'deadbeef',
  } as unknown as Dossier
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
})

describe('submitDossierToServer — transport de l\u2019intention d\u2019adhésion (DET-COOP-007)', () => {
  it('marchand + intention cochée → estMembreCooperative true + cooperativeId dans le payload, verdict traversé', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ id: 'x', codeLiaison: 'ABCD-EFGH', adhesionCooperative: 'creee' }),
      { status: 201 }
    ))
    const dossier = { ...dossierBase(), estMembreCooperative: true, cooperativeId: 'coop-uuid-1', cooperativeNom: 'Coop Agboville' }
    const out = await submitDossierToServer(dossier)
    expect(out.status).toBe('synced')
    expect(out.adhesionCooperative).toBe('creee')
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.estMembreCooperative).toBe(true)
    expect(payload.cooperativeId).toBe('coop-uuid-1')
  })

  it('marchand sans intention → estMembreCooperative false, pas de cooperativeId', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const out = await submitDossierToServer(dossierBase())
    expect(out.status).toBe('synced')
    expect(out.adhesionCooperative).toBeUndefined()
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.estMembreCooperative).toBe(false)
    expect(payload.cooperativeId).toBeUndefined()
  })

  it('producteur même coché → les champs d\u2019adhésion ne partent JAMAIS', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const dossier = { ...dossierBase(), actorType: 'producteur', estMembreCooperative: true, cooperativeId: 'coop-uuid-1' } as unknown as Dossier
    await submitDossierToServer(dossier)
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.estMembreCooperative).toBeUndefined()
    expect(payload.cooperativeId).toBeUndefined()
  })
})

describe('messageAdhesionCoop — grammaire agent des 5 verdicts (DET-COOP-007)', () => {
  it('creee → succès nominatif de la coopérative', () => {
    const m = messageAdhesionCoop('creee', 'Coop Agboville')
    expect(m).not.toBeNull()
    expect(m!.titre).toContain('Adhésion')
    expect(m!.description).toContain('Coop Agboville')
  })

  it('deja_membre → aucun changement annoncé', () => {
    const m = messageAdhesionCoop('deja_membre', 'Coop Agboville')
    expect(m!.description).toContain('déjà')
  })

  it('deja_actif_ailleurs → non-déplacement explicite', () => {
    const m = messageAdhesionCoop('deja_actif_ailleurs', undefined)
    expect(m!.description).toContain('autre coopérative')
  })

  it('coop_absente → échec dit, rien de créé', () => {
    const m = messageAdhesionCoop('coop_absente', 'Coop fantôme')
    expect(m!.description).toContain('n\'a pas été créée')
  })

  it('erreur → le dossier reste bon, fallback président dit', () => {
    const m = messageAdhesionCoop('erreur', undefined)
    expect(m!.description).toContain('président')
  })

  it('verdict absent → null (aucun toast parasite)', () => {
    expect(messageAdhesionCoop(undefined, 'Coop Agboville')).toBeNull()
    expect(messageAdhesionCoop('verdict_inconnu', undefined)).toBeNull()
  })
})

describe('file offline — rejeu verbatim transportant l\u2019adhésion', () => {
  it('le handler ident-dossier rejoue le payload ENTIER (estMembreCooperative inclus)', async () => {
    registerAllSyncHandlers()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const payload = { dossierId: 'ID-2026-2002', estMembreCooperative: true, cooperativeId: 'coop-uuid-1', actorType: 'marchand' }
    await handlers.get('ident-dossier')!(payload)
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(payload)
  })
})
