import { beforeEach, describe, expect, it, vi } from 'vitest'

// PF-04 — handler 'recolte-create' : les photos DataURL partent au
// Storage (upload signé) AVANT le POST, la récolte voyage avec des
// références `harvest-photos/…`. Contract : toute erreur d'upload lève
// (l'opération reste en file, rejeu complet) ; le reste du payload est
// inchangé.
//
// offline-db est mocké (on teste les HANDLERS, pas la file) et
// device-upload est mocké (le pipeline fetch/sign est couvert par
// device-upload.test.ts).

const handlers = new Map<string, (payload: unknown) => Promise<void>>()
vi.mock('@/lib/offline-db', () => ({
  registerSyncHandler: vi.fn((entity: string, handler: (payload: unknown) => Promise<void>) => {
    handlers.set(entity, handler)
  }),
  SyncConflictError: class SyncConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SyncConflictError'
    }
  },
}))

vi.mock('@/lib/storage/device-upload', () => ({
  uploadRecoltePhotos: vi.fn((...a: unknown[]) => uploadMock(...a)),
  uploadDevicePhotoValue: vi.fn((...a: unknown[]) => uploadValueMock(...a)),
}))

import { registerAllSyncHandlers } from '../sync-handlers'

const uploadMock = vi.fn((...args: unknown[]) => Promise.resolve(args[0] as string[]))
const uploadValueMock = vi.fn((...args: unknown[]) =>
  Promise.resolve(args[0] as string | null)
)

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const REF = 'harvest-photos/prod-1/uuid-1.png'

describe('sync-handlers — récoltes avec photos (PF-04)', () => {
  registerAllSyncHandlers()

  beforeEach(() => {
    uploadMock.mockClear()
    uploadMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0] as string[]))
    uploadValueMock.mockClear()
    uploadValueMock.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[0] as string | null)
    )
    vi.restoreAllMocks?.()
  })

  it('substitue les DataURL par les références storage AVANT le POST', async () => {
    uploadMock.mockResolvedValue([REF])
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      id: 'rec-1',
      producteurId: 'prod-1',
      produit: 'Igname',
      quantiteKg: 120,
      qualite: 'A',
      dateRecolte: '2026-09-22',
      photos: [DATA_URL],
    }
    await handlers.get('recolte-create')!(payload)

    expect(uploadMock).toHaveBeenCalledWith([DATA_URL])
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string; method: string }
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body) as { photos: string[]; id: string; produit: string }
    expect(sent.photos).toEqual([REF]) // plus de DataURL
    expect(sent.id).toBe('rec-1') // le reste du payload est intact
    expect(sent.produit).toBe('Igname')
    vi.unstubAllGlobals()
  })

  it("une erreur d'upload lève → l'opération reste en file (aucun POST)", async () => {
    uploadMock.mockRejectedValue(new Error('sign-upload-device 503'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      handlers.get('recolte-create')!({ id: 'rec-2', photos: [DATA_URL] })
    ).rejects.toThrow('sign-upload-device 503')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('récolte sans photos : POST direct, upload jamais appelé', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('recolte-create')!({ id: 'rec-3', photos: [] })
    expect(uploadMock).not.toHaveBeenCalled()
    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect((JSON.parse(init.body) as { photos: unknown }).photos).toEqual([])
    vi.unstubAllGlobals()
  })

  it('récolte avec références déjà en storage : zéro re-upload (idempotence)', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('recolte-create')!({ id: 'rec-4', photos: [REF] })
    // uploadRecoltePhotos est appelé mais laisse passer les refs intactes
    // (contrat du module, vérifié par le mock qui renvoie l'entrée telle
    // quelle) — et surtout zéro DataURL dans le POST.
    expect(uploadMock).toHaveBeenCalledWith([REF])
    const sent = JSON.parse(
      ((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body
    ) as {
      photos: string[]
    }
    expect(sent.photos).toEqual([REF])
    vi.unstubAllGlobals()
  })
})

describe('sync-handlers — journal avec photo (PF-04 extension)', () => {
  registerAllSyncHandlers()

  beforeEach(() => {
    uploadValueMock.mockClear()
    uploadValueMock.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[0] as string | null)
    )
    vi.restoreAllMocks?.()
  })

  it('substitue la photoUrl DataURL par la référence storage AVANT le POST', async () => {
    uploadValueMock.mockResolvedValue(REF)
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await handlers.get('journal')!({
      id: 'j-1',
      producteurId: 'prod-1',
      cycleId: 'cycle-1',
      date: '2026-09-22',
      texte: 'Irrigation parcelle Nord',
      photoUrl: DATA_URL,
    })

    expect(uploadValueMock).toHaveBeenCalledWith(DATA_URL)
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string; method: string }
    expect(init.method).toBe('POST')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/producteur/journal')
    const sent = JSON.parse(init.body) as { photoUrl: string; texte: string; id: string }
    expect(sent.photoUrl).toBe(REF) // plus de DataURL
    expect(sent.texte).toBe('Irrigation parcelle Nord') // reste intact
    expect(sent.id).toBe('j-1')
    vi.unstubAllGlobals()
  })

  it("une erreur d'upload lève → l'opération reste en file (aucun POST)", async () => {
    uploadValueMock.mockRejectedValue(new Error('sign-upload-device 503'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      handlers.get('journal')!({ id: 'j-2', photoUrl: DATA_URL })
    ).rejects.toThrow('sign-upload-device 503')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('entrée sans photo (null) : POST direct, upload jamais appelé', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await handlers.get('journal')!({ id: 'j-3', texte: 'Sans photo', photoUrl: null })
    expect(uploadValueMock).toHaveBeenCalledWith(null)
    const sent = JSON.parse(
      ((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body
    ) as { photoUrl: unknown }
    expect(sent.photoUrl).toBeNull()
    vi.unstubAllGlobals()
  })
})
