import { beforeEach, describe, expect, it, vi } from 'vitest'

// Audit VOCAL-604 — la pause du wake word est un ÉTAT : elle annule un
// startWakeWordListener() encore en vol (await initSherpaModel), sinon la
// session de fond était créée APRÈS la pause et le micro restait actif
// pendant la modale vocale.

const { createSmartContinuousSTTMock, isAnySTTAvailableMock, initSherpaModelMock } = vi.hoisted(() => ({
  createSmartContinuousSTTMock: vi.fn(),
  isAnySTTAvailableMock: vi.fn(() => true),
  initSherpaModelMock: vi.fn(async () => true),
}))

vi.mock('../stt-factory', () => ({
  createSmartContinuousSTT: createSmartContinuousSTTMock,
  isAnySTTAvailable: isAnySTTAvailableMock,
  initSherpaModel: initSherpaModelMock,
}))

vi.mock('../tata-tts', () => ({
  playBeep: vi.fn(),
  tataSpeak: vi.fn(),
  haptic: vi.fn(),
}))

import {
  getWakeWordState,
  onWakeDetected,
  pauseWakeWord,
  resumeWakeWord,
  startWakeWordListener,
} from '../wake-word'

function fakeSession() {
  return { start: vi.fn(), stop: vi.fn(), abort: vi.fn(), isListening: vi.fn(() => true) }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('wake-word — pause annulant un start en vol (audit VOCAL-604)', () => {
  let currentFake: ReturnType<typeof fakeSession>

  beforeEach(async () => {
    currentFake = fakeSession()
    createSmartContinuousSTTMock.mockReset().mockResolvedValue(currentFake as never)
    isAnySTTAvailableMock.mockReturnValue(true)
    initSherpaModelMock.mockReset().mockResolvedValue(true)
    onWakeDetected(() => {})
    // Réarme l'état module (le flag _paused survit entre les tests) :
    resumeWakeWord()
    await flush()
  })

  it('pause demandée PENDANT initSherpaModel → aucune session créée', async () => {
    let release!: (v: boolean) => void
    initSherpaModelMock.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve }))
    const session = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(session as never)

    const pending = startWakeWordListener()
    // La modale s'ouvre pendant le chargement du modèle :
    pauseWakeWord()
    release(true)
    await pending
    await flush()

    expect(session.start).not.toHaveBeenCalled()
    expect(getWakeWordState()).toBe('inactive')
  })

  it('pause pendant l\'écoute → session avortée, état inactive', async () => {
    const session = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(session as never)

    await startWakeWordListener()
    await flush()
    expect(session.start).toHaveBeenCalledTimes(1)
    expect(getWakeWordState()).toBe('listening')

    pauseWakeWord()
    expect(session.abort).toHaveBeenCalledTimes(1)
    expect(getWakeWordState()).toBe('inactive')
  })

  it('resume après pause → le listener repart proprement', async () => {
    let release!: (v: boolean) => void
    initSherpaModelMock.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve }))
    const session = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(session as never)

    const pending = startWakeWordListener()
    pauseWakeWord()
    release(true)
    await pending

    // Le resume relance startWakeWordListener : l'init ne doit plus être
    // bloquée (le deferred ci-dessus est consommé).
    initSherpaModelMock.mockResolvedValue(true)
    resumeWakeWord()
    await flush()
    await flush()
    expect(session.start).toHaveBeenCalledTimes(1)
    expect(getWakeWordState()).toBe('listening')
  })
})
