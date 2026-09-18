import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import {
  resetSherpaStateForTests,
  startSmartSingleShotSTT,
} from '../stt-factory'
import { SherpaStt } from '../sherpa-stt'
import { createSingleShotSTT, isSTTAvailable } from '../stt'
import { initVoiceService } from '../voice-service'

// Audit VOCAL-602 — session hybride web/natif :
//  • web + Web Speech : création + start() SYNCHRONES (activation utilisateur) ;
//  • natif : factory async (VoiceService → Sherpa) ;
//  • abort avant résolution : aucun démarrage (session fantôme impossible) ;
//  • aucun moteur : onError EXPLICITE (plus jamais de no-op silencieux).

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))

vi.mock('../stt', () => ({
  createSingleShotSTT: vi.fn(),
  createContinuousSTT: vi.fn(),
  isSTTAvailable: vi.fn(() => true),
}))

vi.mock('../voice-service', () => ({
  initVoiceService: vi.fn(async () => false),
  createVoiceServiceSingleShotSTT: vi.fn(),
  BAOULE_CONTINUOUS_UNAVAILABLE_MESSAGE: 'Reconnaissance baoulé continue indisponible',
}))

vi.mock('../sherpa-stt', () => ({
  SherpaStt: {
    isAvailable: vi.fn(async () => ({ available: true, modelLoaded: true })),
    initModel: vi.fn(async () => {}),
    startRecognition: vi.fn(async () => {}),
    stopRecognition: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
    removeAllListeners: vi.fn(async () => {}),
  },
}))

vi.mock('../baoule-engine', () => ({
  createBaouleTranscriptionSession: vi.fn(),
  BAOULE_CONTINUOUS_UNAVAILABLE_MESSAGE: 'Reconnaissance baoulé continue indisponible',
}))

vi.mock('../stores/voice-language-store', () => ({
  getSelectedVoiceLanguage: vi.fn(() => 'fr'),
  getSelectedTtsLanguage: vi.fn(() => 'fr'),
}))

function fakeSession() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    isListening: vi.fn(() => false),
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('startSmartSingleShotSTT — session hybride (audit VOCAL-602)', () => {
  beforeEach(() => {
    resetSherpaStateForTests() // état module Sherpa en cache entre tests
    vi.mocked(createSingleShotSTT).mockReset()
    vi.mocked(isSTTAvailable).mockReturnValue(true)
    vi.mocked(initVoiceService).mockResolvedValue(false)
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: true, modelLoaded: true })
    vi.mocked(SherpaStt.startRecognition).mockReset().mockResolvedValue(undefined)
    vi.mocked(SherpaStt.addListener).mockReset().mockResolvedValue({ remove: async () => {} })
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  it('web + Web Speech : start() appelé SYNCHRONEMENT (activation utilisateur)', () => {
    const session = fakeSession()
    vi.mocked(createSingleShotSTT).mockReturnValue(session as never)
    const onResult = vi.fn()
    const returned = startSmartSingleShotSTT({ onResult }, { lang: 'fr-FR' })
    // Pas un seul await : le start synchrone est le contrat.
    expect(createSingleShotSTT).toHaveBeenCalledTimes(1)
    expect(session.start).toHaveBeenCalledTimes(1)
    expect(returned).toBe(session)
  })

  it('web sans Web Speech : session inerte explicite → onError (jamais de no-op silencieux)', async () => {
    vi.mocked(isSTTAvailable).mockReturnValue(false)
    const onError = vi.fn()
    const session = startSmartSingleShotSTT({ onResult: vi.fn(), onError })
    await flush()
    session.start()
    await flush()
    expect(onError).toHaveBeenCalledWith('Aucun moteur STT disponible')
  })

  it('natif : factory async → session Sherpa démarrée', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    const onError = vi.fn()
    const session = startSmartSingleShotSTT({ onResult: vi.fn(), onError })
    await flush()
    await flush()
    expect(SherpaStt.startRecognition).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('natif : abort() AVANT la résolution de la factory → aucun démarrage', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    // Factory bloquée au PREMIER await (initVoiceService) — isSherpa
    // Available pouvant être servi depuis le cache module.
    let release!: (v: boolean) => void
    vi.mocked(initVoiceService).mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve }))
    const session = startSmartSingleShotSTT({ onResult: vi.fn() })
    await flush() // laisse la factory atteindre son premier await
    session.abort()
    release(false)
    await flush()
    await flush()
    expect(SherpaStt.startRecognition).not.toHaveBeenCalled()
  })

  it('natif : abort() APRÈS la résolution → la session réelle est avortée', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    const session = startSmartSingleShotSTT({ onResult: vi.fn() })
    await flush()
    await flush()
    expect(SherpaStt.startRecognition).toHaveBeenCalledTimes(1)
    session.abort()
    await flush()
    // stopRecognition est appelé par le stop interne de la session Sherpa.
    expect(SherpaStt.stopRecognition).toHaveBeenCalled()
  })
})
