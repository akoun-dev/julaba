import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks des modules propriétaires (le pack-manager délègue, il ne ré-
// implémente rien : on vérifie donc la DÉLÉGATION et les gardes, pas les
// mécanismes — chaque module a ses propres tests). vi.hoisted : les mocks
// sont créés AVANT l'exécution des factories vi.mock (hoistées au sommet).
const kokoroMocks = vi.hoisted(() => ({
  isKokoroSupported: vi.fn(() => false),
  isKokoroVoiceReady: vi.fn(async () => false),
  downloadKokoroVoice: vi.fn(async (_onProgress?: (percent: number) => void) => true),
  removeKokoroVoice: vi.fn(async () => undefined),
}))
vi.mock('../kokoro-tts', () => kokoroMocks)

const mmsMocks = vi.hoisted(() => ({
  isMmsSupported: vi.fn(() => false),
  isMmsBciVoiceReady: vi.fn(async () => false),
  isMmsDyuVoiceReady: vi.fn(async () => false),
  downloadMmsBciVoice: vi.fn(async (_onProgress?: (percent: number) => void) => true),
  downloadMmsDyuVoice: vi.fn(async (_onProgress?: (percent: number) => void) => true),
  removeMmsBciVoice: vi.fn(async () => undefined),
  removeMmsDyuVoice: vi.fn(async () => undefined),
}))
vi.mock('../mms-tts', () => mmsMocks)

const nllbMocks = vi.hoisted(() => ({
  isNllbSupported: vi.fn(() => false),
  isNllbModelReady: vi.fn(async (_language?: string) => false),
  downloadNllbModel: vi.fn(
    async (_onProgress?: (percent: number) => void, _language?: string) => true,
  ),
  removeNllbModel: vi.fn(async (_modelId?: string) => undefined),
}))
vi.mock('../nllb-translation', () => nllbMocks)

const piperMocks = vi.hoisted(() => ({
  isPiperSupported: vi.fn(() => false),
  isPiperVoiceReady: vi.fn(async () => false),
  downloadPiperVoice: vi.fn(async (_onProgress?: (percent: number) => void) => true),
  removePiperVoice: vi.fn(async () => undefined),
}))
vi.mock('../piper-tts', () => piperMocks)

const voiceServiceMocks = vi.hoisted(() => ({
  isVoiceServicePlatformAvailable: vi.fn(() => false),
  probeVoiceModelAvailability: vi.fn(
    async (_lang: string): Promise<{ available: boolean; source: 'assets' | 'disk' | 'none' }> => ({
      available: false,
      source: 'none',
    }),
  ),
}))
vi.mock('../voice-service', () => voiceServiceMocks)

const downloaderMocks = vi.hoisted(() => ({
  downloadModelFiles: vi.fn(
    async (
      _files: readonly { diskPath: string; url: string }[],
      _onProgress?: (percent: number) => void,
    ): Promise<{ ok: true; filesWritten: number } | { ok: false; reason: string }> => ({
      ok: true,
      filesWritten: 1,
    }),
  ),
  removeModelDirectory: vi.fn(async (_diskRelPath: string) => undefined),
}))
vi.mock('../packs/model-downloader', () => downloaderMocks)

import {
  getVoicePackDescriptor,
  isVoicePackId,
  VOICE_PACKS,
} from '../packs/registry'
import {
  getVoicePackState,
  installVoicePack,
  listVoicePackStates,
  removeVoicePack,
} from '../packs/pack-manager'

beforeEach(() => {
  vi.clearAllMocks()
  // Défaut : plateforme web — aucune coque native, aucun mécanisme supporté.
  kokoroMocks.isKokoroSupported.mockReturnValue(false)
  mmsMocks.isMmsSupported.mockReturnValue(false)
  nllbMocks.isNllbSupported.mockReturnValue(false)
  piperMocks.isPiperSupported.mockReturnValue(false)
  voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(false)
  voiceServiceMocks.probeVoiceModelAvailability.mockResolvedValue({
    available: false,
    source: 'none',
  })
})

describe('registre des packs vocaux (MODE-952)', () => {
  it('décrit les 8 packs attendus, ids uniques', () => {
    expect(VOICE_PACKS).toHaveLength(8)
    const ids = VOICE_PACKS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'stt-fr-native',
      'stt-locales-native',
      'tts-piper-fr',
      'tts-kokoro-fr',
      'nllb-bci',
      'nllb-dyu',
      'tts-mms-bci',
      'tts-mms-dyu',
    ]) {
      expect(isVoicePackId(id)).toBe(true)
    }
    expect(isVoicePackId('pack-inexistant')).toBe(false)
  })

  it('chaque pack a un libellé, une description, une taille positive et un module propriétaire', () => {
    for (const pack of VOICE_PACKS) {
      expect(pack.label.length).toBeGreaterThan(0)
      expect(pack.description.length).toBeGreaterThan(0)
      expect(pack.sizeMb).toBeGreaterThan(0)
      expect(pack.ownerModule).toContain('src/lib/voice/')
      expect(['apk-assets', 'opfs', 'cache-api']).toContain(pack.mechanism)
      expect(pack.languages.length).toBeGreaterThan(0)
    }
  })

  it('le cœur (dictée française) est le seul pack non opt-in', () => {
    for (const pack of VOICE_PACKS) {
      if (pack.id === 'stt-fr-native') expect(pack.optIn).toBe(false)
      else expect(pack.optIn).toBe(true)
    }
  })

  it('les packs apk-assets sont embarqués dans l’APK full, jamais les autres', () => {
    for (const pack of VOICE_PACKS) {
      if (pack.mechanism === 'apk-assets') expect(pack.bundledInFullApk).toBe(true)
      else expect(pack.bundledInFullApk).toBe(false)
    }
  })

  it('les tailles signalées non vérifiées sont explicitement marquées (jamais de chiffre inventé présenté comme mesuré)', () => {
    const fr = getVoicePackDescriptor('stt-fr-native')
    expect(fr?.sizeVerified).toBe(false) // estimation, à mesurer au build lite (MODE-953)
    const bci = getVoicePackDescriptor('stt-locales-native')
    expect(bci?.sizeVerified).toBe(true) // 349 Mo vérifié (docs/VOICE_SERVICE.md)
  })

  it('les packs STT natifs portent leurs fichiers + chemins disque (miroir Java, MODE-953)', () => {
    for (const id of ['stt-fr-native', 'stt-locales-native'] as const) {
      const pack = getVoicePackDescriptor(id)
      expect(pack?.diskRelPath).toMatch(/^models\//)
      expect(pack?.files?.length).toBeGreaterThan(0)
      for (const file of pack?.files ?? []) {
        expect(file.url).toContain('/releases/download/voice-models-v1/')
        expect(file.url.endsWith(file.name) || file.name === 'tokens.txt' || file.name === 'model.int8.onnx').toBe(true)
      }
    }
    // Les autres packs n'ont PAS de fichiers disque (mécanismes différents).
    expect(getVoicePackDescriptor('tts-piper-fr')?.files).toBeUndefined()
  })

  it('getVoicePackDescriptor renvoie null pour un id inconnu', () => {
    expect(getVoicePackDescriptor('inconnu' as never)).toBeNull()
  })
})

describe('sondes d’état (listVoicePackStates / getVoicePackState)', () => {
  it('sur le web : packs natifs et mécanismes indisponibles — état exact, jamais optimiste', async () => {
    const states = await listVoicePackStates()
    expect(states).toHaveLength(8)
    for (const state of states) {
      expect(state.installed).toBe(false)
      if (state.descriptor.mechanism === 'apk-assets') expect(state.supported).toBe(false)
    }
  })

  it('sur coque native : les packs STT reflètent la sonde réelle (assets OU disque)', async () => {
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    voiceServiceMocks.probeVoiceModelAvailability.mockImplementation(
      async (lang: string) => (lang === 'fr'
        ? { available: true, source: 'assets' as const }
        : { available: false, source: 'none' as const }),
    )
    expect(await getVoicePackState('stt-fr-native')).toMatchObject({
      supported: true,
      installed: true,
    })
    // Build allégé sans pack bci : supported mais PAS installé (état exact).
    expect(await getVoicePackState('stt-locales-native')).toMatchObject({
      supported: true,
      installed: false,
    })
    // La sonde bci a bien été utilisée pour le pack locales (même moteur bci+dyu).
    expect(voiceServiceMocks.probeVoiceModelAvailability).toHaveBeenCalledWith('bci')
  })

  it('Piper prêt → pack installé ; sonde défaillante → false (jamais de throw)', async () => {
    piperMocks.isPiperSupported.mockReturnValue(true)
    piperMocks.isPiperVoiceReady.mockResolvedValue(true)
    expect(await getVoicePackState('tts-piper-fr')).toMatchObject({
      supported: true,
      installed: true,
    })
    piperMocks.isPiperVoiceReady.mockRejectedValue(new Error('OPFS indisponible'))
    expect(await getVoicePackState('tts-piper-fr')).toMatchObject({
      supported: true,
      installed: false,
    })
  })

  it('NLLB et MMS sont sondés PAR LANGUE (bci et dyu sont des packs distincts)', async () => {
    nllbMocks.isNllbSupported.mockReturnValue(true)
    mmsMocks.isMmsSupported.mockReturnValue(true)
    nllbMocks.isNllbModelReady.mockImplementation(async (language?: string) => language === 'bci')
    mmsMocks.isMmsDyuVoiceReady.mockResolvedValue(true)
    expect(await getVoicePackState('nllb-bci')).toMatchObject({ installed: true })
    expect(await getVoicePackState('nllb-dyu')).toMatchObject({ installed: false })
    expect(await getVoicePackState('tts-mms-bci')).toMatchObject({ installed: false })
    expect(await getVoicePackState('tts-mms-dyu')).toMatchObject({ installed: true })
  })
})

describe('installVoicePack (consentement explicite, jamais automatique)', () => {
  it('STT : refuse le téléchargement sur le web (jamais de fetch sur navigateur)', async () => {
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(false)
    const progress = vi.fn()
    expect(await installVoicePack('stt-fr-native', progress)).toBe(false)
    expect(await installVoicePack('stt-locales-native', progress)).toBe(false)
    expect(downloaderMocks.downloadModelFiles).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
  })

  it('STT : sur coque native, délègue au downloader avec le miroir EXACT des chemins assets', async () => {
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    const progress = vi.fn()
    expect(await installVoicePack('stt-locales-native', progress)).toBe(true)
    expect(downloaderMocks.downloadModelFiles).toHaveBeenCalledTimes(1)
    const [files, passedProgress] = downloaderMocks.downloadModelFiles.mock.calls[0]
    expect(files.map((f: { diskPath: string }) => f.diskPath)).toEqual([
      'models/omnilingual-asr-300M-ctc-int8-2025-11-12/model.int8.onnx',
      'models/omnilingual-asr-300M-ctc-int8-2025-11-12/tokens.txt',
    ])
    for (const f of Array.from(files)) {
      expect(f.url).toContain('/releases/download/voice-models-v1/')
    }
    expect(passedProgress).toBe(progress)
  })

  it('STT : un échec du downloader renvoie false avec la raison loggée (jamais d’état optimiste)', async () => {
    voiceServiceMocks.isVoiceServicePlatformAvailable.mockReturnValue(true)
    downloaderMocks.downloadModelFiles.mockResolvedValue({
      ok: false,
      reason: 'Connexion réseau indisponible — réessayez en Wi-Fi.',
    })
    expect(await installVoicePack('stt-locales-native')).toBe(false)
  })

  it('délègue à Piper avec la progression transmise', async () => {
    piperMocks.isPiperSupported.mockReturnValue(true)
    piperMocks.downloadPiperVoice.mockResolvedValue(true)
    const progress = vi.fn()
    expect(await installVoicePack('tts-piper-fr', progress)).toBe(true)
    expect(piperMocks.downloadPiperVoice).toHaveBeenCalledWith(progress)
  })

  it('délègue à Kokoro, NLLB PAR LANGUE et MMS PAR LANGUE', async () => {
    kokoroMocks.isKokoroSupported.mockReturnValue(true)
    nllbMocks.isNllbSupported.mockReturnValue(true)
    mmsMocks.isMmsSupported.mockReturnValue(true)
    const progress = vi.fn()
    expect(await installVoicePack('tts-kokoro-fr', progress)).toBe(true)
    expect(kokoroMocks.downloadKokoroVoice).toHaveBeenCalledWith(progress)
    expect(await installVoicePack('nllb-bci', progress)).toBe(true)
    expect(nllbMocks.downloadNllbModel).toHaveBeenCalledWith(progress, 'bci')
    expect(await installVoicePack('nllb-dyu', progress)).toBe(true)
    expect(nllbMocks.downloadNllbModel).toHaveBeenCalledWith(progress, 'dyu')
    expect(await installVoicePack('tts-mms-dyu', progress)).toBe(true)
    expect(mmsMocks.downloadMmsDyuVoice).toHaveBeenCalledWith(progress)
  })

  it('mécanisme non supporté → false SANS tentative de téléchargement', async () => {
    piperMocks.isPiperSupported.mockReturnValue(false)
    expect(await installVoicePack('tts-piper-fr')).toBe(false)
    expect(piperMocks.downloadPiperVoice).not.toHaveBeenCalled()
  })

  it('un échec du module propriétaire renvoie false (jamais throw)', async () => {
    piperMocks.isPiperSupported.mockReturnValue(true)
    piperMocks.downloadPiperVoice.mockRejectedValue(new Error('réseau coupé'))
    expect(await installVoicePack('tts-piper-fr')).toBe(false)
  })
})

describe('removeVoicePack (libération d’espace)', () => {
  it('ne touche JAMAIS au cœur de l’APK (stt-fr-native non amovible)', async () => {
    await removeVoicePack('stt-fr-native')
    expect(downloaderMocks.removeModelDirectory).not.toHaveBeenCalled()
    expect(piperMocks.removePiperVoice).not.toHaveBeenCalled()
    expect(nllbMocks.removeNllbModel).not.toHaveBeenCalled()
  })

  it('supprime le dossier DISQUE du pack locales (les assets du build full restent)', async () => {
    await removeVoicePack('stt-locales-native')
    expect(downloaderMocks.removeModelDirectory).toHaveBeenCalledWith(
      'models/omnilingual-asr-300M-ctc-int8-2025-11-12',
    )
  })

  it('délègue la suppression au module propriétaire (Piper, NLLB par modèle, MMS par langue)', async () => {
    await removeVoicePack('tts-piper-fr')
    expect(piperMocks.removePiperVoice).toHaveBeenCalledTimes(1)
    await removeVoicePack('tts-kokoro-fr')
    expect(kokoroMocks.removeKokoroVoice).toHaveBeenCalledTimes(1)
    await removeVoicePack('nllb-bci')
    expect(nllbMocks.removeNllbModel).toHaveBeenCalledWith('nllb-baoule-v1')
    await removeVoicePack('nllb-dyu')
    expect(nllbMocks.removeNllbModel).toHaveBeenCalledWith('Xenova/nllb-200-distilled-600M')
    await removeVoicePack('tts-mms-bci')
    expect(mmsMocks.removeMmsBciVoice).toHaveBeenCalledTimes(1)
    await removeVoicePack('tts-mms-dyu')
    expect(mmsMocks.removeMmsDyuVoice).toHaveBeenCalledTimes(1)
  })
})
