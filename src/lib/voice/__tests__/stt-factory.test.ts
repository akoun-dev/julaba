import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAnySTTAvailable,
  getSTTStatus,
  resetSherpaStateForTests,
  initSherpaModel,
  createSmartContinuousSTT,
  type STTSession,
} from '../stt-factory'
import { SherpaStt } from '../sherpa-stt'

// Audit P0-1 : isAnySTTAvailable() ne doit plus se limiter à la Web Speech
// API (un moteur EN LIGNE) — il doit refléter un modèle Sherpa chargé, sans
// quoi le mot d'appel et les modales meurent silencieusement hors ligne.
// En environnement de test (jsdom) : pas de SpeechRecognition — la Web
// Speech est donc "absente" et Sherpa est simulé via le mock du pont natif.

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  // Task 32 : stt-factory importe voice-service → plugins/voice-service,
  // qui appelle registerPlugin au chargement du module. Pont inerte ici —
  // ces tests n'exercent que la chaîne Sherpa/Web Speech.
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))

vi.mock('../sherpa-stt', () => ({
  SherpaStt: {
    isAvailable: vi.fn(async () => ({ available: false, modelLoaded: false })),
    initModel: vi.fn(async () => {}),
    startRecognition: vi.fn(async () => {}),
    stopRecognition: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    removeAllListeners: vi.fn(async () => {}),
  },
}))

describe('stt-factory — porte de contrôle STT (audit P0-1)', () => {
  beforeEach(() => {
    resetSherpaStateForTests()
    vi.mocked(SherpaStt.isAvailable).mockReset()
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: false, modelLoaded: false })
    vi.mocked(SherpaStt.initModel).mockReset()
    vi.mocked(SherpaStt.initModel).mockResolvedValue(undefined)
  })

  it('reports unavailable before anything is loaded (offline device at boot)', () => {
    expect(isAnySTTAvailable()).toBe(false)
    expect(getSTTStatus()).toEqual({ webspeech: false, sherpa: 'unknown' })
  })

  it('is true once the Sherpa model finished loading (offline device)', async () => {
    const ok = await initSherpaModel()
    expect(ok).toBe(true)
    expect(isAnySTTAvailable()).toBe(true)
    expect(getSTTStatus().sherpa).toBe('ready')
  })

  it('stays unavailable when the model init fails', async () => {
    vi.mocked(SherpaStt.initModel).mockRejectedValueOnce(new Error('no assets'))
    const ok = await initSherpaModel()
    expect(ok).toBe(false)
    expect(isAnySTTAvailable()).toBe(false)
    expect(getSTTStatus().sherpa).toBe('unavailable')
  })

  it('keeps the fallback session that reports "aucun moteur STT disponible"', async () => {
    vi.mocked(SherpaStt.initModel).mockRejectedValue(new Error('no assets'))
    const onError = vi.fn()
    const session = await createSmartContinuousSTT({ onResult: () => {}, onError })
    session.start()
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith('Aucun moteur STT disponible')
    expect(session.isListening()).toBe(false)
  })

  it('returns a Sherpa continuous session that loops past final results (audit P2-10)', async () => {
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: true, modelLoaded: true })
    const onResult = vi.fn()
    const session: STTSession = await createSmartContinuousSTT({ onResult, onError: () => {} })

    session.start()
    // startOnce() is fire-and-forget async — wait for the recognition to
    // actually begin before inspecting the registered handler.
    await vi.waitFor(() => expect(vi.mocked(SherpaStt.startRecognition)).toHaveBeenCalledTimes(1))

    // Extract the 'sttResult' handler the factory registered.
    const addListener = vi.mocked(SherpaStt.addListener)
    expect(addListener).toHaveBeenCalled()
    const handler = addListener.mock.calls[0][1]

    // First final result → forwarded…
    handler({ transcript: 'julaba', isFinal: true })
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'julaba', isFinal: true }))
    // …and recognition is restarted (a single-shot would have ended here).
    await vi.waitFor(() => expect(vi.mocked(SherpaStt.startRecognition)).toHaveBeenCalledTimes(2))

    session.stop()
  })
})
