import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// PF-04 — contrat de /api/v1/storage/sign-upload-device :
//   - 401 sans session appareil, 403 hors royaume producteur (ordre
//     auth-avant-lookup) ;
//   - 422 sur payload invalide (bucket inconnu, fileName non régulier,
//     contentType non image) ;
//   - 200 : chemin construit SERVEUR à partir du subject de session
//     (`<producteurId>/<uuid>.<ext>`), createSignedUploadUrl appelé avec
//     ce chemin, token + signedUrl relayés ;
//   - 500 générique si le Storage échoue.

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ storage: { from: fromMock } }),
}))

vi.mock('@/lib/device-session', () => ({
  getDeviceSubject: vi.fn((...a: unknown[]) => subjectMock(...a)),
}))

import { POST } from '../route'

const subjectMock = vi.fn<(...args: unknown[]) => Promise<string | null>>()
const createSignedUploadUrlMock = vi.fn()
const fromMock = vi.fn(() => ({ createSignedUploadUrl: createSignedUploadUrlMock }))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/storage/sign-upload-device', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_BODY = {
  bucket: 'harvest-photos',
  fileName: 'photo.png',
  contentType: 'image/png',
}

describe('sign-upload-device (PF-04) — garde session appareil', () => {
  beforeEach(() => {
    subjectMock.mockReset()
    createSignedUploadUrlMock.mockReset()
  })

  it('401 sans session (ordre auth-avant-lookup : Storage jamais touché)', async () => {
    subjectMock.mockResolvedValue(null)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('403 pour un royaume non producteur (merchant → jamais signé)', async () => {
    subjectMock.mockResolvedValue('merchant:m-1')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('400 sur JSON invalide (session valide)', async () => {
    subjectMock.mockResolvedValue('producteur:p-1')
    const res = await POST(
      new NextRequest('http://localhost/api/v1/storage/sign-upload-device', {
        method: 'POST',
        body: 'pas-du-json',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    expect(res.status).toBe(400)
  })

  it.each([
    [{ ...VALID_BODY, bucket: 'voice-exports' }, 'bucket hors périmètre device'],
    [{ ...VALID_BODY, fileName: '../evil.png' }, 'fileName avec traversée'],
    [{ ...VALID_BODY, contentType: 'application/pdf' }, 'contentType non image'],
  ])('422 sur payload invalide (%s)', async (body) => {
    subjectMock.mockResolvedValue('producteur:p-1')
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(422)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('sign-upload-device (PF-04) — signature', () => {
  beforeEach(() => {
    subjectMock.mockReset()
    createSignedUploadUrlMock.mockReset()
  })

  it('200 : chemin SERVEUR dérivé du subject, Storage appelé avec', async () => {
    subjectMock.mockResolvedValue('producteur:prod-abc')
    createSignedUploadUrlMock.mockResolvedValue({
      data: { token: 'tok-1', signedUrl: 'https://storage.example/upload/signature/p?token=tok-1' },
      error: null,
    })
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(fromMock).toHaveBeenCalledWith('harvest-photos')
    const [path] = createSignedUploadUrlMock.mock.calls[0] as [string]
    expect(path.startsWith('prod-abc/')).toBe(true)
    expect(path.endsWith('.png')).toBe(true)
    expect(path).toMatch(/prod-abc\/[0-9a-f-]{36}\.png/) // UUID v4 aléatoire
    const json = (await res.json()) as Record<string, string>
    expect(json.bucket).toBe('harvest-photos')
    expect(json.token).toBe('tok-1')
    expect(json.signedUrl).toContain('token=tok-1')
    // Le nom client n'apparaît JAMAIS dans le chemin (anti-traversée).
    expect(json.path).not.toContain('photo')
  })

  it('extension cohérente avec le contentType (jpg / webp)', async () => {
    subjectMock.mockResolvedValue('producteur:p')
    createSignedUploadUrlMock.mockResolvedValue({
      data: { token: 't', signedUrl: 'https://s.example/u?token=t' },
      error: null,
    })
    await POST(makeRequest({ ...VALID_BODY, contentType: 'image/jpeg' }))
    expect((createSignedUploadUrlMock.mock.calls[0] as unknown[])[0]).toMatch(/\.jpg$/)
    await POST(makeRequest({ ...VALID_BODY, contentType: 'image/webp' }))
    expect((createSignedUploadUrlMock.mock.calls[1] as unknown[])[0]).toMatch(/\.webp$/)
  })

  it('500 générique sur erreur Storage (détail non exposé)', async () => {
    subjectMock.mockResolvedValue('producteur:p-1')
    createSignedUploadUrlMock.mockResolvedValue({
      data: null,
      error: { message: 'storage kaput' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('URL de dépôt indisponible')
    expect(json.error).not.toContain('kaput')
    consoleSpy.mockRestore()
  })
})
