import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

// Mocks du bridge Capacitor — le downloader n'est pas un pont du réel ici :
// on teste les GARDES (web refusé, skip des fichiers complets, progression
// agrégée, erreurs traduites en messages français lisibles) ET les gardes
// d'intégrité A11-F03 (fichier vide + appendFile, taille disque, registre
// sha256/sizeBytes, Content-Length transport).

const capacitorMocks = vi.hoisted(() => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))
vi.mock('@capacitor/core', () => capacitorMocks)

const fsMocks = vi.hoisted(() => ({
  stat: vi.fn(async (_opts: { path: string }) => ({ size: 0 })),
  writeFile: vi.fn(async (_opts: { path: string; data: string }) => undefined),
  appendFile: vi.fn(async (_opts: { path: string; data: string }) => undefined),
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

  it('télécharge en streaming : fichier vide + appendFile par bloc + progression', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    const bloc1 = new Uint8Array(600 * 1024)
    const bloc2 = new Uint8Array(500 * 1024)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers, // pas de Content-Length
      body: streamOf([bloc1, bloc2]),
    })
    // 1er stat : sonde de présence (absent) ; 2e stat : garde disque
    // post-téléchargement — la taille écrite égale les octets reçus.
    fsMocks.stat
      .mockResolvedValueOnce({ size: 0 } as never)
      .mockResolvedValueOnce({ size: bloc1.byteLength + bloc2.byteLength } as never)
    const progress = vi.fn()
    const result = await downloadModelFiles([SPEC], progress)
    expect(result).toMatchObject({ ok: true, filesWritten: 1 })
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${DISK_MODELS_DIR}/models/omnilingual-asr-300M-ctc-int8-2025-11-12` }),
    )
    // A11-F03 : le fichier est créé VIDE (writeFile une fois, data ''), puis
    // chaque bloc ≥ 512 Ko est APPENDU (jamais un writeFile qui tronque).
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(1)
    expect(fsMocks.writeFile.mock.calls[0][0]).toMatchObject({
      path: `${DISK_MODELS_DIR}/${SPEC.diskPath}`,
      data: '',
    })
    expect(fsMocks.appendFile).toHaveBeenCalledTimes(2)
    expect(fsMocks.appendFile.mock.calls[0][0]).toMatchObject({
      path: `${DISK_MODELS_DIR}/${SPEC.diskPath}`,
    })
    expect(progress).toHaveBeenCalled()
  })

  it('garde disque (A11-F03) : taille écrite ≠ octets reçus → refus + fichier supprimé', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([new Uint8Array(700 * 1024)]),
    })
    fsMocks.stat
      .mockResolvedValueOnce({ size: 0 } as never)
      .mockResolvedValueOnce({ size: 100 } as never) // écriture tronquée simulée
    const result = await downloadModelFiles([SPEC])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('PACK_WRITE_DIVERGENCE')
    expect(fsMocks.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${DISK_MODELS_DIR}/${SPEC.diskPath}` }),
    )
  })

  it('garde transport (A11-F03) : Content-Length non atteint → PACK_TRUNCATED', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({
      ok: true,
      // Content-Length PARSABLE (sinon total=null et le garde ne s'applique pas).
      headers: new Map([['content-length', '1048576']]) as unknown as Headers,
      body: streamOf([new Uint8Array(10 * 1024)]), // coupure : 10 Ko sur 1 Mo
    })
    fsMocks.stat.mockResolvedValueOnce({ size: 0 } as never)
    const result = await downloadModelFiles([SPEC])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('PACK_TRUNCATED')
  })

  it('garde registre (A11-F03) : sha256 conforme → installé', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    const bloc1 = new Uint8Array(300 * 1024)
    const bloc2 = new Uint8Array(212 * 1024)
    const empreinte = createHash('sha256').update(bloc1).update(bloc2).digest('hex')
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([bloc1, bloc2]),
    })
    fsMocks.stat
      .mockResolvedValueOnce({ size: 0 } as never)
      .mockResolvedValueOnce({ size: bloc1.byteLength + bloc2.byteLength } as never)
    const specIntegre = { ...SPEC, sha256: empreinte, sizeBytes: bloc1.byteLength + bloc2.byteLength }
    const result = await downloadModelFiles([specIntegre])
    expect(result).toMatchObject({ ok: true, filesWritten: 1 })
  })

  it('garde registre (A11-F03) : sha256 divergent → PACK_INTEGRITY_REFUSEE + fichier supprimé', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([new Uint8Array(5 * 1024)]),
    })
    fsMocks.stat
      .mockResolvedValueOnce({ size: 0 } as never)
      .mockResolvedValueOnce({ size: 5 * 1024 } as never) // garde disque OK (5120 reçus)
    const specFaux = { ...SPEC, sha256: 'a'.repeat(64) }
    const result = await downloadModelFiles([specFaux])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('PACK_INTEGRITY_REFUSEE')
    expect(fsMocks.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${DISK_MODELS_DIR}/${SPEC.diskPath}` }),
    )
  })

  it('garde registre (A11-F03) : sizeBytes divergent → refus même sans sha256', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([new Uint8Array(5 * 1024)]),
    })
    fsMocks.stat
      .mockResolvedValueOnce({ size: 0 } as never)
      .mockResolvedValueOnce({ size: 5 * 1024 } as never) // garde disque OK
    const specTropCourt = { ...SPEC, sizeBytes: 10 * 1024 * 1024 }
    const result = await downloadModelFiles([specTropCourt])
    expect(result).toMatchObject({ ok: false })
    expect('reason' in result && result.reason).toContain('PACK_INTEGRITY_REFUSEE')
  })

  it('un fichier tronqué préexistant est supprimé avant re-téléchargement (reprise par fichier)', async () => {
    capacitorMocks.Capacitor.isNativePlatform.mockReturnValue(true)
    // Le stat du skip passe sur le SECOND appel : le premier (présence avant
    // téléchargement) renvoie vide → re-téléchargement.
    fsMocks.stat.mockResolvedValueOnce({ size: 0 } as never)
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map() as unknown as Headers,
      body: streamOf([new Uint8Array(10)]),
    })
    // Après téléchargement, le garde disque re-stat : 10 octets cohérents.
    fsMocks.stat.mockResolvedValueOnce({ size: 10 } as never)
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
