import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BAOULE_NOT_READY_MESSAGE,
  createVoiceServiceSingleShotSTT,
  getVoiceServiceStatus,
  initVoiceService,
  isVoiceServicePlatformAvailable,
  mapVoiceServiceError,
  resetVoiceServiceStateForTests,
} from '../voice-service'
import { VoiceService } from '../../../plugins/voice-service'

// Task 31 — VoiceService : moteur vocal unifié (fr = sherpa-onnx batch,
// bci = emplacement réservé). En environnement de test (node) : pas de
// Web Speech, la plateforme native est simulée via le mock de @capacitor/core
// et le pont natif est un mock complet.

const mockNative = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockNative.value },
}))

vi.mock('../../../plugins/voice-service', () => ({
  VoiceService: {
    initialize: vi.fn(async () => ({ ready: true, language: 'fr', engine: 'sherpa-onnx', initialized: true })),
    isReady: vi.fn(async () => ({ ready: true, language: 'fr', engine: 'sherpa-onnx' })),
    startRecording: vi.fn(async () => ({ started: true, maxDurationMs: 30000 })),
    stopRecording: vi.fn(async () => ({ audioDurationMs: 3850, sampleCount: 61600 })),
    transcribe: vi.fn(async () => ({
      text: 'bonjour julaba',
      language: 'fr',
      audioDurationMs: 3850,
      inferenceDurationMs: 2110,
      realtimeFactor: 0.548,
    })),
    release: vi.fn(async () => ({ released: true })),
    removeAllListeners: vi.fn(async () => {}),
  },
}))

describe('voice-service — disponibilité et initialisation (Task 31)', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
  })

  it('signale la plateforme native selon Capacitor', () => {
    expect(isVoiceServicePlatformAvailable()).toBe(true)
    mockNative.value = false
    expect(isVoiceServicePlatformAvailable()).toBe(false)
  })

  it('getVoiceServiceStatus retourne null hors plateforme native', async () => {
    mockNative.value = false
    expect(await getVoiceServiceStatus()).toBeNull()
    expect(VoiceService.isReady).not.toHaveBeenCalled()
  })

  it('initVoiceService("fr") charge le moteur une seule fois (idempotent)', async () => {
    expect(await initVoiceService('fr')).toBe(true)
    expect(await initVoiceService('fr')).toBe(true)
    expect(vi.mocked(VoiceService.initialize)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(VoiceService.initialize)).toHaveBeenCalledWith({ language: 'fr' })
  })

  it('initVoiceService("bci") réserve le slot mais signale non-prêt (benchmark POC en attente)', async () => {
    expect(await initVoiceService('bci')).toBe(false)
    expect(vi.mocked(VoiceService.initialize)).toHaveBeenCalledWith({ language: 'bci' })
  })

  it('initVoiceService retourne false si le bridge échoue', async () => {
    vi.mocked(VoiceService.initialize).mockRejectedValueOnce(new Error('ENGINE_ERROR: assets manquants'))
    expect(await initVoiceService('fr')).toBe(false)
  })
})

describe('voice-service — session push-to-talk française', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
  })

  it('start → startRecording, stop → stopRecording + transcribe + résultat final', async () => {
    const onResult = vi.fn()
    const onEnd = vi.fn()
    const session = await createVoiceServiceSingleShotSTT({ onResult, onEnd })

    session.start()
    await vi.waitFor(() => expect(vi.mocked(VoiceService.startRecording)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(VoiceService.startRecording)).toHaveBeenCalledWith({ maxDurationMs: 30000 })

    session.stop()
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1))
    expect(onResult).toHaveBeenCalledWith({
      transcript: 'bonjour julaba',
      confidence: 0.9,
      isFinal: true,
    })
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(session.isListening()).toBe(false)
  })

  it('respecte maxDurationMs optionnel', async () => {
    const session = await createVoiceServiceSingleShotSTT({ onResult: () => {} }, { maxDurationMs: 10000 })
    session.start()
    await vi.waitFor(() => expect(vi.mocked(VoiceService.startRecording)).toHaveBeenCalledWith({ maxDurationMs: 10000 }))
    session.stop()
  })

  it('échec de startRecording → onError traduit, pas de résultat', async () => {
    const onError = vi.fn()
    const onResult = vi.fn()
    vi.mocked(VoiceService.startRecording).mockRejectedValueOnce(
      new Error('PERMISSION_DENIED: permission microphone refusée')
    )
    const session = await createVoiceServiceSingleShotSTT({ onResult, onError })

    session.start()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Micro non autorisé — accordez la permission microphone à Jùlaba'))
    expect(onResult).not.toHaveBeenCalled()
    expect(session.isListening()).toBe(false)
  })

  it('échec de transcribe → onError, pas de résultat, onEnd tout de même', async () => {
    const onError = vi.fn()
    const onResult = vi.fn()
    const onEnd = vi.fn()
    vi.mocked(VoiceService.transcribe).mockRejectedValueOnce(
      new Error('ENGINE_ERROR: decode failed')
    )
    const session = await createVoiceServiceSingleShotSTT({ onResult, onError, onEnd })

    session.start()
    await vi.waitFor(() => expect(vi.mocked(VoiceService.startRecording)).toHaveBeenCalledTimes(1))
    session.stop()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError).toHaveBeenCalledWith('Erreur du moteur vocal : decode failed')
    expect(onResult).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('abort() défausse le résultat en vol (pas de onResult parasite, onEnd terminal)', async () => {
    const onResult = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()
    let resolveStop: (v: { audioDurationMs: number; sampleCount: number }) => void = () => {}
    vi.mocked(VoiceService.stopRecording).mockImplementationOnce(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    const session = await createVoiceServiceSingleShotSTT({ onResult, onError, onEnd })

    session.start()
    await vi.waitFor(() => expect(vi.mocked(VoiceService.startRecording)).toHaveBeenCalledTimes(1))
    session.abort()
    resolveStop({ audioDurationMs: 100, sampleCount: 1600 })
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))
    // Aucune chaîne stop→transcribe lancée : le buffer est défaussé.
    expect(vi.mocked(VoiceService.transcribe)).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(session.isListening()).toBe(false)
  })

  it('initialisation impossible → session inerte « Aucun moteur STT disponible »', async () => {
    vi.mocked(VoiceService.initialize).mockRejectedValue(new Error('ENGINE_ERROR: x'))
    const onError = vi.fn()
    const session = await createVoiceServiceSingleShotSTT({ onResult: () => {}, onError })

    session.start()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Aucun moteur STT disponible'))
    expect(vi.mocked(VoiceService.startRecording)).not.toHaveBeenCalled()
  })
})

describe('voice-service — route Baoulé (emplacement réservé, mission §18)', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
  })

  it('lang bci → erreur explicite BAOULE_NOT_READY, aucun enregistrement lancé', async () => {
    const onError = vi.fn()
    const onResult = vi.fn()
    const onEnd = vi.fn()
    const session = await createVoiceServiceSingleShotSTT({ onResult, onError, onEnd }, { lang: 'bci' })

    session.start()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(BAOULE_NOT_READY_MESSAGE)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(vi.mocked(VoiceService.startRecording)).not.toHaveBeenCalled()
    expect(vi.mocked(VoiceService.initialize)).not.toHaveBeenCalled()
    expect(session.isListening()).toBe(false)
  })
})

describe('voice-service — fallback web', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = false
  })

  it('web sans Web Speech → session inerte « Aucun moteur STT disponible »', async () => {
    const onError = vi.fn()
    const session = await createVoiceServiceSingleShotSTT({ onResult: () => {}, onError })

    session.start()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Aucun moteur STT disponible'))
    expect(vi.mocked(VoiceService.startRecording)).not.toHaveBeenCalled()
  })
})

describe('voice-service — traduction des codes d\'erreur natifs (mission §15)', () => {
  it('BAOULE_NOT_READY → message d\'état Baoulé', () => {
    expect(mapVoiceServiceError(new Error('BAOULE_NOT_READY: moteur Baoulé non intégré')))
      .toBe(BAOULE_NOT_READY_MESSAGE)
  })

  it('PERMISSION_DENIED → message de permission', () => {
    expect(mapVoiceServiceError(new Error('PERMISSION_DENIED: refusé')))
      .toBe('Micro non autorisé — accordez la permission microphone à Jùlaba')
  })

  it('MIC_UNAVAILABLE → message de micro', () => {
    expect(mapVoiceServiceError(new Error('MIC_UNAVAILABLE: pas de micro')))
      .toBe('Micro indisponible sur cet appareil')
  })

  it('ENGINE_NOT_INITIALIZED → message d\'initialisation', () => {
    expect(mapVoiceServiceError(new Error('ENGINE_NOT_INITIALIZED: appeler initialize()')))
      .toBe('Moteur vocal non initialisé — réessayez dans un instant')
  })

  it('ALREADY_RECORDING / NO_RECORDING → messages dédiés', () => {
    expect(mapVoiceServiceError(new Error('ALREADY_RECORDING: x'))).toBe('Un enregistrement est déjà en cours')
    expect(mapVoiceServiceError(new Error('NO_RECORDING: x'))).toBe('Aucun audio enregistré')
  })

  it('chaîne inconnue → message brut préservé (aucun nettoyage agressif)', () => {
    expect(mapVoiceServiceError('boom')).toBe('boom')
  })
})
