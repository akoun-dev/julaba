import { beforeEach, describe, expect, it, vi } from 'vitest'

// PF-04 — pipeline photo côté appareil (device-upload.ts) :
//   - dataUrlToBlob : conversion base64 → Blob (et refus mime/taille) ;
//   - uploadRecoltePhotos : sign-upload-device → POST storage signé →
//     référence `harvest-photos/…` ; échec sign → lève (l'opération reste
//     en file) ; entrées non-data passent intactes (idempotence).

import {
  dataUrlToBlob,
  isDataUrl,
  isStorageRef,
  uploadDevicePhoto,
  uploadRecoltePhotos,
} from '../device-upload'

// PNG 1×1 valide (base64) — courte, réaliste en structure.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('device-upload (PF-04) — dataUrlToBlob', () => {
  it('convertit une DataURL image en Blob avec son contentType', () => {
    const { blob, contentType } = dataUrlToBlob(PNG_DATA_URL)
    expect(contentType).toBe('image/png')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('refuse un mime non image', () => {
    expect(() => dataUrlToBlob('data:text/html;base64,PGI+')).toThrow(/DataURL photo invalide/)
  })

  it('refuse un encodage non base64', () => {
    expect(() => dataUrlToBlob('data:image/jpeg;utf8,<svg/>')).toThrow(/DataURL photo invalide/)
  })

  it('refuse une DataURL trop volumineuse', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(8 * 1024 * 1024 + 1)}`
    expect(() => dataUrlToBlob(huge)).toThrow(/trop volumineuse/)
  })
})

describe('device-upload (PF-04) — uploadRecoltePhotos', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uploade une DataURL : sign-upload-device puis POST storage signé', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/storage/sign-upload-device') {
        expect(init?.method).toBe('POST')
        const body = JSON.parse(String(init?.body)) as Record<string, string>
        expect(body.bucket).toBe('harvest-photos')
        expect(body.contentType).toBe('image/png')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bucket: 'harvest-photos',
            path: 'prod-1/uuid-1.png',
            token: 'tok',
            signedUrl: 'https://storage.example/upload/signature/prod-1/uuid-1.png?token=tok',
          }),
        }
      }
      // POST sur l'URL signée : le binaire part en formData.
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      return { ok: true, status: 200 }
    })
    vi.stubGlobal('fetch', fetchMock)

    const ref = await uploadDevicePhoto(PNG_DATA_URL)
    expect(ref).toBe('harvest-photos/prod-1/uuid-1.png')
    expect(isStorageRef(ref)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it('les entrées non-data passent intactes (idempotence, zéro fetch)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const photos = ['harvest-photos/prod-1/deja-uploadee.jpg', 'https://cdn.example/x.jpg']
    const out = await uploadRecoltePhotos(photos)
    expect(out).toEqual(photos)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("un échec du sign-upload-device LÈVE (l'opération reste en file)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadRecoltePhotos([PNG_DATA_URL])).rejects.toThrow('sign-upload-device 422')
    expect(fetchMock).toHaveBeenCalledTimes(1) // jamais de POST storage
    vi.unstubAllGlobals()
  })

  it("un échec de l'upload storage LÈVE après le sign", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/storage/sign-upload-device') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bucket: 'harvest-photos',
            path: 'prod-1/uuid-2.jpg',
            token: 'tok',
            signedUrl: 'https://storage.example/upload/signature/prod-1/uuid-2.jpg?token=tok',
          }),
        }
      }
      return { ok: false, status: 500 }
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadRecoltePhotos([PNG_DATA_URL])).rejects.toThrow('upload storage 500')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it('multi-photos : chaque DataURL est convertie, l’ordre est préservé', async () => {
    const JPEG_DATA_URL =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICAgKDA8MCgsOCwgIDRENDg8QEBEQCgsSExIQEA8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/storage/sign-upload-device') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            bucket: 'harvest-photos',
            path: `prod-1/uuid-${fetchMock.mock.calls.length}.jpg`,
            token: 'tok',
            signedUrl: `https://storage.example/upload/signature/prod-1/uuid-${fetchMock.mock.calls.length}.jpg?token=tok`,
          }),
        }
      }
      return { ok: true, status: 200 }
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await uploadRecoltePhotos([JPEG_DATA_URL, 'harvest-photos/keep.jpg', JPEG_DATA_URL])
    expect(isDataUrl(out[0])).toBe(false)
    expect(out[0]).toMatch(/^harvest-photos\/prod-1\/uuid-/)
    expect(out[1]).toBe('harvest-photos/keep.jpg')
    expect(out[2]).toMatch(/^harvest-photos\/prod-1\/uuid-/)
    vi.unstubAllGlobals()
  })
})
