import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// AUDIT-013 (MODE-1014) — contrat client de la transmission RÉELLE des
// médias à l'enrôlement :
//   1. le payload POST /api/backoffice/enrolments transporte les pièces
//      (photoBase64, cniRecto, cniVerso en DataURL) et le GPS COMPLET
//      { lat, lng, accuracy? } — les has_* restent des indicateurs dérivés ;
//   2. rien n'est inventé : un dossier sans pièce/GPS ne porte pas les champs ;
//   3. un échec réseau enfile le payload ENTIER (médias inclus) dans la file ;
//   4. le handler 'ident-dossier' rejoue ce payload verbatim.
// La persistance du BROUILLON, elle, continue de retirer les images
// (brouillonsPersistables, testée dans ident-sync-dossiers.test.ts) —
// seuls le payload sync et l'appel live portent les médias.

const handlers = new Map<string, (payload: unknown) => Promise<void>>()
const queuedPayloads: unknown[] = []

vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  queuePendingSync: vi.fn(async (_entity: string, payload: unknown) => {
    queuedPayloads.push(payload)
    return { ok: true }
  }),
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
import { submitDossierToServer } from '../identificateur-sync'
import type { Dossier } from '../stores/identificateur-store'

const fetchMock = vi.fn()

function dossierBase(): Dossier {
  return {
    id: 'd-media-1',
    actorType: 'marchand',
    agentId: 'ident-1',
    agentName: 'Awa TRAORE',
    dossierNumber: 'ID-2026-4001',
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
  queuedPayloads.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
})

describe('submitDossierToServer — transport réel des médias et du GPS (AUDIT-013)', () => {
  it('le payload transporte photo/CNI (DataURLs) + GPS complet {lat,lng,accuracy}, indicateurs dérivés', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const dossier = {
      ...dossierBase(),
      photoBase64: 'data:image/jpeg;base64,PORTRAIT',
      cniRecto: 'data:image/png;base64,RECTO',
      cniVerso: 'data:image/webp;base64,VERSO',
      // GPSCoords (store) porte lon — le fil porte lng (convention DB).
      gps: { lat: 5.359, lon: -4.008, accuracy: 12, timestamp: 42 },
    }
    const out = await submitDossierToServer(dossier)
    expect(out.status).toBe('synced')
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.photoBase64).toBe('data:image/jpeg;base64,PORTRAIT')
    expect(payload.cniRecto).toBe('data:image/png;base64,RECTO')
    expect(payload.cniVerso).toBe('data:image/webp;base64,VERSO')
    expect(payload.gps).toEqual({ lat: 5.359, lng: -4.008, accuracy: 12 })
    expect(payload.hasPhoto).toBe(true)
    expect(payload.hasGps).toBe(true)
    expect(payload.hasCniRecto).toBe(true)
    expect(payload.hasCniVerso).toBe(true)
  })

  it('GPS sans précision mesurée → accuracy absent (rien d\u2019inventé)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const dossier = { ...dossierBase(), gps: { lat: 5.359, lon: -4.008, timestamp: 42 } }
    await submitDossierToServer(dossier)
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.gps).toEqual({ lat: 5.359, lng: -4.008 })
  })

  it('dossier sans pièce ni GPS → champs absents, indicateurs à false', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    await submitDossierToServer(dossierBase())
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>
    expect(payload.gps).toBeUndefined()
    expect(payload.photoBase64).toBeUndefined()
    expect(payload.cniRecto).toBeUndefined()
    expect(payload.cniVerso).toBeUndefined()
    expect(payload.hasPhoto).toBe(false)
    expect(payload.hasGps).toBe(false)
  })

  it('échec réseau → la file reçoit le payload ENTIER, médias inclus, statut queued', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const dossier = {
      ...dossierBase(),
      photoBase64: 'data:image/jpeg;base64,PORTRAIT',
      gps: { lat: 5.359, lon: -4.008, accuracy: 12, timestamp: 42 },
    }
    const out = await submitDossierToServer(dossier)
    expect(out.status).toBe('queued')
    expect(queuedPayloads).toHaveLength(1)
    const payload = queuedPayloads[0] as Record<string, unknown>
    expect(payload.photoBase64).toBe('data:image/jpeg;base64,PORTRAIT')
    expect(payload.gps).toEqual({ lat: 5.359, lng: -4.008, accuracy: 12 })
    expect(payload.dossierId).toBe('ID-2026-4001')
  })
})

describe('handler ident-dossier — rejeu verbatim des médias (AUDIT-013)', () => {
  it('rejoue le payload média tel quel vers POST /api/backoffice/enrolments', async () => {
    registerAllSyncHandlers()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    const payload = {
      dossierId: 'ID-2026-4002',
      actorType: 'marchand',
      photoBase64: 'data:image/jpeg;base64,PORTRAIT',
      cniRecto: 'data:image/png;base64,RECTO',
      gps: { lat: 5.359, lng: -4.008, accuracy: 12 },
      pin: '1234',
    }
    await handlers.get('ident-dossier')!(payload)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/backoffice/enrolments')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(payload)
  })
})
