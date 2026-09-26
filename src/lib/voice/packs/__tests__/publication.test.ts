import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

// MODE-1014 (AUDIT-013) — garde de publication des packs vocaux :
//   1. publication sans empreinte → REFUSÉE (message explicite) ;
//   2. publication avec empreintes complètes → acceptée ;
//   3. chargement legacy (sans empreinte) → OK + avertissement structuré,
//      jamais de crash, jamais silencieux.
//
// Le registre STATIQUE reste volontairement sans empreintes (la release
// voice-models-v1 n'est pas publiée — un chiffre inventé serait un mensonge,
// règle d'honnêteté du dépôt) : c'est le cas LEGACY par excellence. Pour
// tester le chemin « avec empreintes », le module registry est partiellement
// mocké ici (descripteurs enrichis) — le registre réel n'est pas altéré.

// ── Mocks des modules propriétaires (le pack-manager délègue — mêmes
//    conventions que packs.test.ts, aucune mécanique réelle ici).
const kokoroMocks = vi.hoisted(() => ({
  isKokoroSupported: vi.fn(() => false),
  isKokoroVoiceReady: vi.fn(async () => false),
  downloadKokoroVoice: vi.fn(async () => true),
  removeKokoroVoice: vi.fn(async () => undefined),
}))
vi.mock('../../kokoro-tts', () => kokoroMocks)

const mmsMocks = vi.hoisted(() => ({
  isMmsSupported: vi.fn(() => false),
  isMmsBciVoiceReady: vi.fn(async () => false),
  isMmsDyuVoiceReady: vi.fn(async () => false),
  downloadMmsBciVoice: vi.fn(async () => true),
  downloadMmsDyuVoice: vi.fn(async () => true),
  removeMmsBciVoice: vi.fn(async () => undefined),
  removeMmsDyuVoice: vi.fn(async () => undefined),
}))
vi.mock('../../mms-tts', () => mmsMocks)

const nllbMocks = vi.hoisted(() => ({
  isNllbSupported: vi.fn(() => false),
  isNllbModelReady: vi.fn(async () => false),
  downloadNllbModel: vi.fn(async () => true),
  removeNllbModel: vi.fn(async () => undefined),
}))
vi.mock('../../nllb-translation', () => nllbMocks)

const piperMocks = vi.hoisted(() => ({
  isPiperSupported: vi.fn(() => false),
  isPiperVoiceReady: vi.fn(async () => false),
  downloadPiperVoice: vi.fn(async () => true),
  removePiperVoice: vi.fn(async () => undefined),
}))
vi.mock('../../piper-tts', () => piperMocks)

const voiceServiceMocks = vi.hoisted(() => ({
  isVoiceServicePlatformAvailable: vi.fn(() => false),
  // Type réel : Promise<{ available: boolean; source: 'assets' | 'disk' | 'none' }>
  probeVoiceModelAvailability: vi.fn(async () =>
    ({ available: false, source: 'none' as 'assets' | 'disk' | 'none' })),
}))
vi.mock('../../voice-service', () => voiceServiceMocks)

const downloaderMocks = vi.hoisted(() => ({
  downloadModelFiles: vi.fn(
    async (
      _files?: readonly {
        diskPath: string
        url: string
        sha256?: string
        sizeBytes?: number
      }[],
      _onProgress?: (percent: number) => void,
    ): Promise<{ ok: true; filesWritten: number } | { ok: false; reason: string }> => ({
      ok: true,
      filesWritten: 1,
    }),
  ),
  removeModelDirectory: vi.fn(async (_diskRelPath: string) => undefined),
}))
vi.mock('../model-downloader', () => downloaderMocks)

// Registre partiellement mocké : par défaut le registre RÉEL (entrées
// legacy sans empreintes) ; `withFingerprints` bascule des copies
// enrichies d'empreintes valides pour tester le chemin de publication
// complète SALT mentir sur le registre statique.
const registryControl = vi.hoisted(() => ({ withFingerprints: false }))
vi.mock('../registry', async (importActual) => {
  const actual = await importActual<typeof import('../registry')>()
  return {
    ...actual,
    getVoicePackDescriptor: ((id: string) => {
      const descriptor = actual.getVoicePackDescriptor(id as never)
      if (!descriptor || !registryControl.withFingerprints || !descriptor.files) return descriptor
      return {
        ...descriptor,
        files: descriptor.files.map((f) => ({
          ...f,
          sha256: 'a'.repeat(64),
          sizeBytes: 1234,
        })),
      }
    }) as typeof actual.getVoicePackDescriptor,
  }
})

import { getVoicePackDescriptor, type VoicePackDescriptor } from '../registry'
import {
  assertVoicePackPublication,
  describeVoicePackPublicationProblems,
  isVoicePackPublicationComplete,
  isValidSha256Hex,
  isValidSizeBytes,
  warnVoicePackLegacyEntry,
} from '../publication'
import { installVoicePack, listVoicePackStates } from '../pack-manager'

const SHA_VALIDE = 'b'.repeat(64)

function descriptorAvecEmpreintes(over: Partial<VoicePackDescriptor> = {}): VoicePackDescriptor {
  return {
    id: 'stt-locales-native',
    label: 'test',
    description: 'test',
    languages: ['bci', 'dyu'],
    sizeMb: 349,
    sizeVerified: true,
    mechanism: 'apk-assets',
    optIn: true,
    bundledInFullApk: true,
    removable: true,
    ownerModule: 'src/lib/voice/voice-service.ts',
    diskRelPath: 'models/test',
    files: [
      { name: 'model.int8.onnx', url: 'https://exemple.test/model.int8.onnx' },
      { name: 'tokens.txt', url: 'https://exemple.test/tokens.txt' },
    ],
    ...over,
  }
}

let warnSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  registryControl.withFingerprints = false
  voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(false)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('validation des empreintes (publication.ts)', () => {
  it('accepte une empreinte SHA-256 hex de 64 caractères (casse normalisée), refuse les autres', () => {
    expect(isValidSha256Hex(SHA_VALIDE)).toBe(true)
    expect(isValidSha256Hex(SHA_VALIDE.toUpperCase())).toBe(true)
    expect(isValidSha256Hex('abc')).toBe(false)
    expect(isValidSha256Hex('g'.repeat(64))).toBe(false)
    expect(isValidSha256Hex('')).toBe(false)
    expect(isValidSha256Hex(42)).toBe(false)
    expect(isValidSha256Hex(undefined)).toBe(false)
  })

  it('accepte une taille entière strictement positive, refuse 0, négatif et non entier', () => {
    expect(isValidSizeBytes(1)).toBe(true)
    expect(isValidSizeBytes(48234496)).toBe(true)
    expect(isValidSizeBytes(0)).toBe(false)
    expect(isValidSizeBytes(-5)).toBe(false)
    expect(isValidSizeBytes(1.5)).toBe(false)
    expect(isValidSizeBytes(Number.NaN)).toBe(false)
    expect(isValidSizeBytes('100')).toBe(false)
    expect(isValidSizeBytes(undefined)).toBe(false)
  })
})

describe('publication sans empreinte → REFUSÉE', () => {
  it('liste les problèmes par fichier (sha256 et sizeBytes absents)', () => {
    const problems = describeVoicePackPublicationProblems(descriptorAvecEmpreintes())
    expect(problems).toHaveLength(4) // 2 fichiers × (sha256 + sizeBytes)
    expect(problems.some((p) => p.includes('stt-locales-native/model.int8.onnx'))).toBe(true)
    expect(problems.some((p) => p.includes('ABSENTE'))).toBe(true)
  })

  it('détecte une empreinte malformée et une taille nulle ou négative', () => {
    const problems = describeVoicePackPublicationProblems(
      descriptorAvecEmpreintes({
        files: [
          { name: 'model.int8.onnx', url: 'u', sha256: 'z'.repeat(64), sizeBytes: 0 },
          { name: 'tokens.txt', url: 'u', sha256: SHA_VALIDE, sizeBytes: -1 },
        ],
      }),
    )
    expect(problems.some((p) => p.includes('model.int8.onnx') && p.includes('INVALIDE'))).toBe(true)
    expect(problems.some((p) => p.includes('sizeBytes INVALIDE'))).toBe(true)
    expect(problems).toHaveLength(3) // sha256 malformée + sizeBytes 0 + sizeBytes -1
  })

  it('assertVoicePackPublication jette PACK_PUBLICATION_REFUSEE avec le pack et la marche à suivre', () => {
    expect(() => assertVoicePackPublication(descriptorAvecEmpreintes())).toThrowError(
      /PACK_PUBLICATION_REFUSEE[\s\S]*stt-locales-native[\s\S]*publish-voice-models\.sh/,
    )
  })

  it('installVoicePack refuse AVANT tout téléchargement une entrée publiée sans empreintes (registre legacy réel)', async () => {
    // Registre réel : les entrées STT ne portent pas encore d'empreintes
    // (release non publiée) — l'installation doit être refusée.
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    expect(await installVoicePack('stt-locales-native')).toBe(false)
    expect(downloaderMocks.downloadModelFiles).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PUBLICATION REFUSÉE'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('stt-locales-native'))
  })
})

describe('publication avec empreintes complètes → ACCEPTÉE', () => {
  it('une entrée complète ne produit AUCUN problème et ne jette pas', () => {
    const complete = descriptorAvecEmpreintes({
      files: [
        { name: 'model.int8.onnx', url: 'u', sha256: SHA_VALIDE, sizeBytes: 100 },
        { name: 'tokens.txt', url: 'u', sha256: SHA_VALIDE.toUpperCase(), sizeBytes: 7 },
      ],
    })
    expect(describeVoicePackPublicationProblems(complete)).toEqual([])
    expect(isVoicePackPublicationComplete(complete)).toBe(true)
    expect(() => assertVoicePackPublication(complete)).not.toThrow()
  })

  it('installVoicePack délègue au downloader AVEC les empreintes transportées', async () => {
    registryControl.withFingerprints = true
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    expect(await installVoicePack('stt-locales-native')).toBe(true)
    expect(downloaderMocks.downloadModelFiles).toHaveBeenCalledTimes(1)
    const files = downloaderMocks.downloadModelFiles.mock.calls[0]?.[0] ?? []
    for (const f of files) {
      expect(f.sha256).toBe('a'.repeat(64))
      expect(f.sizeBytes).toBe(1234)
      expect(f.diskPath).toMatch(/^models\/omnilingual-asr-300M-ctc-int8-2025-11-12\//)
    }
  })

  it('un échec du downloader (entrées complètes) renvoie false avec la raison — jamais d état optimiste', async () => {
    registryControl.withFingerprints = true
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    downloaderMocks.downloadModelFiles.mockResolvedValueOnce({
      ok: false,
      reason: 'Connexion réseau indisponible — réessayez en Wi-Fi.',
    })
    expect(await installVoicePack('stt-locales-native')).toBe(false)
  })
})

describe('chargement legacy sans empreinte → OK + avertissement structuré', () => {
  it('une entrée legacy se lit sans crash et son avertissement est émis UNE fois par descripteur', () => {
    const legacy = descriptorAvecEmpreintes() // fichiers sans empreintes
    expect(isVoicePackPublicationComplete(legacy)).toBe(false)
    expect(() => warnVoicePackLegacyEntry(legacy)).not.toThrow()
    expect(() => warnVoicePackLegacyEntry(legacy)).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [payload] = warnSpy.mock.calls[0]
    expect(String(payload)).toContain('PACK_LEGACY_SANS_EMPREINTE')
    expect(String(payload)).toContain('stt-locales-native')
    expect(String(payload)).toContain('lecture tolérée')
  })

  it('une entrée complète ne déclenche AUCUN avertissement legacy', () => {
    warnVoicePackLegacyEntry(
      descriptorAvecEmpreintes({
        files: [{ name: 'model.int8.onnx', url: 'u', sha256: SHA_VALIDE, sizeBytes: 100 }],
      }),
    )
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('un pack SANS fichiers (mécanismes propriétaires) est neutre pour ce garde', () => {
    const sansFichiers = descriptorAvecEmpreintes({ files: undefined, id: 'tts-piper-fr' })
    expect(describeVoicePackPublicationProblems(sansFichiers)).toEqual([])
    expect(() => assertVoicePackPublication(sansFichiers)).not.toThrow()
    expect(() => warnVoicePackLegacyEntry(sansFichiers)).not.toThrow()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('la lecture du registre réel (entrées legacy) reste fonctionnelle : états sondés, avertissement signé', async () => {
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    voiceServiceMocks.probeVoiceModelAvailability.mockResolvedValue({
      available: true,
      source: 'assets',
    })
    const states = await listVoicePackStates()
    expect(states).toHaveLength(8) // aucun crash, le registre legacy se charge
    expect(getVoicePackDescriptor('stt-fr-native')).not.toBeNull()
    const legacyWarn = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes('PACK_LEGACY_SANS_EMPREINTE'),
    )
    expect(legacyWarn).toBe(true) // dégradation VISIBLE, jamais silencieuse
  })
})
