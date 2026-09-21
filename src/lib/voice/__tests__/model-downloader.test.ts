import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks du bridge Capacitor — le downloader n'est pas un pont du réel ici :
// on teste les GARDES (web refusé, skip des fichiers complets, progression
// agrégée, erreurs traduites en messages français lisibles).

const capacitorMocks = vi.hoisted(() => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))
vi.mock('@capacitor/core', () => capacitorMocks)

const fsMocks = vi.hoisted(() => ({
  stat: vi.fn(async (_opts: { path: string }) => ({ size: 0 })),
  writeFile: vi.fn(async (_opts: { path: string; data: string }) => undefined),
  mkdir: vi.fn(async (_opts: { path: string; recursive?: boolean }) => undefined),
  deleteFile: vi.fn(async (_opts: { path: string }) => undefined),
  rmdir: vi.fn(async (_opts: { path: string; recursive?: boolean }) => undefined),
}))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: fsMocks,
}))

import {
  DISK_MODELS_DIR,
  downloadModelFiles,
  removeModelDirectory,
} from '../packs/model-downloader'

const mockFetch = vi.fn()

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  const queue = [...chunks]
  return {
    getReader: () => ({
      read: async () => {
        const value = queue.shift()
        if (value) return { done: false, value }
        return { done: true, value: undefined }
      },
    }),
  } as unknown as ReadableStream<Uint8Array>
}

const SPEC = {
  diskPath: 'models/omnilingual-asr-300M-ctc-int8-2025-11-12/model.int8.onnx',
  url: 'https://github.com/akoun-dev/julaba/releases/download/voice-models-v1/omnilingual-bci-model.int8.onnx',
}

beforeEach(() => {
  vi.clearAllMocks()
  capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(false)
  fsMocks.stat.mockResolvedValue({ size: 0 } as never)
  vi.stubGlobal('fetch', mockFetch)
})

describe('downloader des packs STT (MODE-953)', () => {
  it('refuse le navigateur (le stockage disque ne sert que le moteur natif)', async () => {
    const result = await downloadModelFiles([SPEC])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('application')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skippé : un fichier déjà complet n’est jamais re-téléchargé (reprise par fichier)', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    fsMocks.stat.mockResolvedValue({ size: 366_199_873 } as never) // présent
    const progress = vi.fn()
    const result = await downloadModelFiles([SPEC], progress)
    expect(result).toMatchObject({ ok: true, filesWritten: 0 })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(progress).toHaveBeenCalledWith(100)
  })

  it('télécharge en streaming, crée le dossier, écrit sur disque et relaie la progression', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-length', '1_048_576']]) as unknown as Headers,
      body: streamOf([new Uint8Array(600 * 1024), new Uint8Array(500 * 1024)]),
    })
    const progress = vi.fn()
    const result = await downloadModelFiles([SPEC], progress)
    expect(result).toMatchObject({ ok: true, filesWritten: 1 })
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${DISK_MODELS_DIR}/models/omnilingual-asr-300M-ctc-int8-2025-11-12` }),
    )
    // Bloc 1 (600 Ko >= 512 Ko) écrit immédiatement ; bloc 2 (500 Ko) au flush final.
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(2)
    const first = fsMocks.writeFile.mock.calls[0][0] as { path: string }
    expect(first.path).toBe(`${DISK_MODELS_DIR}/${SPEC.diskPath}`)
    expect(progress).toHaveBeenCalled()
  })

  it('un fichier tronqué préexistant est supprimé avant re-téléchargement (v1 sans checksum)', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    // Le stat du skip passe sur le SECOND appel : le premier (présence avant
    // téléchargement) renvoie vide → re-téléchargement.
    fsMocks.stat.mockResolvedValueOnce({ size: 0 } as never)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([new Uint8Array(10)]),
    })
    await downloadModelFiles([SPEC])
    expect(fsMocks.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${DISK_MODELS_DIR}/${SPEC.diskPath}` }),
    )
  })

  it('HTTP 404 → raison explicite (release non publiée), jamais un état optimiste', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    const result = await downloadModelFiles([SPEC])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('introuvable')
  })

  it('réseau coupé → raison « Connexion réseau indisponible »', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await downloadModelFiles([SPEC])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('Connexion réseau indisponible')
  })

  it('removeModelDirectory : rmdir récursif, échec silencieux (idempotent)', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    await removeModelDirectory('models/omnilingual-asr-300M-ctc-int8-2025-11-12')
    expect(fsMocks.rmdir).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: true }),
    )
    fsMocks.rmdir.mockRejectedValue(new Error('déjà supprimé'))
    await expect(
      removeModelDirectory('models/omnilingual-asr-300M-ctc-int8-2025-11-12'),
    ).resolves.toBeUndefined()
  })

  it('removeModelDirectory : no-op hors coque native', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(false)
    await removeModelDirectory('models/x')
    expect(fsMocks.rmdir).not.toHaveBeenCalled()
  })
})
