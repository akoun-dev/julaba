import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Audit mot de réveil (continuation VOCAL-604 — cycle de vie fiable) :
//  F1  deux starts concurrents (double resumeWakeWord à la fermeture
//      d'une modale : body + cleanup d'effet) ne laissent qu'UNE session
//      vivante — l'autre est supplantée par génération ;
//  F4  un stop (logout) pendant un start en vol ne crée aucune session
//      zombie ;
//  F3  la pause annule le « retour à l'écoute » (10 s) armé par une
//      détection — pas de résurrection du micro de fond pendant une
//      modale ouverte plus de 10 s ;
//  F2  resumeWakeWord respecte setWakeWordEnabled(false) — fermer une
//      modale ne rallume pas le mot de réveil désactivé dans les réglages.

const {
  createSmartContinuousSTTMock,
  isAnySTTAvailableMock,
  initSherpaModelMock,
  tataSpeakMock,
  playBeepMock,
  hapticMock,
} = vi.hoisted(() => ({
  createSmartContinuousSTTMock: vi.fn(),
  isAnySTTAvailableMock: vi.fn(() => true),
  initSherpaModelMock: vi.fn(async () => true),
  // Par défaut, la TTS invoque son callback de fin (comme en production).
  tataSpeakMock: vi.fn((_text: string, onEnd?: () => void) => { onEnd?.() }),
  playBeepMock: vi.fn(),
  hapticMock: vi.fn(),
}))

vi.mock('../stt-factory', () => ({
  createSmartContinuousSTT: createSmartContinuousSTTMock,
  isAnySTTAvailable: isAnySTTAvailableMock,
  initSherpaModel: initSherpaModelMock,
}))

vi.mock('../tata-tts', () => ({
  playBeep: playBeepMock,
  tataSpeak: tataSpeakMock,
  haptic: hapticMock,
}))

import {
  getWakeWordState,
  extractWakeWordCommand,
  onWakeDetected,
  pauseWakeWord,
  resumeWakeWord,
  setWakeWordEnabled,
  startWakeWordListener,
  stopWakeWordListener,
} from '../wake-word'

function fakeSession() {
  return { start: vi.fn(), stop: vi.fn(), abort: vi.fn(), isListening: vi.fn(() => true) }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  createSmartContinuousSTTMock.mockReset().mockResolvedValue(fakeSession() as never)
  isAnySTTAvailableMock.mockReturnValue(true)
  initSherpaModelMock.mockReset().mockResolvedValue(true)
  tataSpeakMock.mockClear()
  playBeepMock.mockClear()
  hapticMock.mockClear()
  onWakeDetected(() => {})
  // Réarme l'état module SANS créer de session : service coupé → lever la
  // pause (resume ne démarre rien tant que désactivé) → réactiver. Aucun
  // start résiduel ne doit polluer les compteurs des tests.
  setWakeWordEnabled(false)
  resumeWakeWord()
  setWakeWordEnabled(true)
})

afterEach(() => {
  // Coupe tout (listener + timers + génération) puis lève la pause SANS
  // redémarrer (service désactivé) — état neutre pour le test suivant.
  setWakeWordEnabled(false)
  resumeWakeWord()
  vi.useRealTimers()
})

describe('wake-word — cycle de vie fiable (audit mot de réveil F1-F4)', () => {
  it('F1 : double resume (body + cleanup à la fermeture) → une seule session vivante', async () => {
    const s1 = fakeSession()
    const s2 = fakeSession()
    createSmartContinuousSTTMock
      .mockResolvedValueOnce(s1 as never)
      .mockResolvedValueOnce(s2 as never)

    // Fermeture d'une modale : le body de l'effet PUIS le cleanup
    // appellent chacun resumeWakeWord() — deux starts quasi simultanés.
    resumeWakeWord()
    resumeWakeWord()
    await flush()
    await flush()

    const started = [s1, s2].filter((s) => s.start.mock.calls.length > 0)
    expect(started).toHaveLength(1)
    expect(getWakeWordState()).toBe('listening')
  })

  it('F4 : stop (logout) pendant un start en vol → aucune session zombie', async () => {
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)
    let release!: (v: boolean) => void
    initSherpaModelMock.mockImplementation(
      () => new Promise<boolean>((resolve) => { release = resolve })
    )

    const pending = startWakeWordListener()
    stopWakeWordListener() // logout pendant le chargement du modèle
    release(true)
    await pending
    await flush()

    // La session n'a jamais été créée ni démarrée : rien à avorter, rien
    // qui écoute après le stop.
    expect(createSmartContinuousSTTMock).not.toHaveBeenCalled()
    expect(s.start).not.toHaveBeenCalled()
    expect(s.abort).not.toHaveBeenCalled()
    expect(getWakeWordState()).toBe('inactive')
  })

  it('F3 : détection puis pause → le retour à l\u2019écoute (10 s) ne ressuscite rien', async () => {
    vi.useFakeTimers()
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)

    await startWakeWordListener()
    expect(getWakeWordState()).toBe('listening')
    expect(s.start).toHaveBeenCalledTimes(1)

    // Le marchand dit « Julaba » → état detected + timer 10 s armé.
    const callbacks = createSmartContinuousSTTMock.mock.calls[0][0]
    callbacks.onResult({ transcript: 'eh Julaba', isFinal: true, confidence: 1 })
    expect(getWakeWordState()).toBe('detected')

    // La modale s'ouvre (pause) et RESTE ouverte plus de 10 s — cas
    // normal d'une vente vocale. Avant correctif, le timer armé par la
    // détection voyait l'état 'detected' figé et relançait session.start().
    pauseWakeWord()
    expect(getWakeWordState()).toBe('inactive')

    await vi.advanceTimersByTimeAsync(11000)
    expect(s.start).toHaveBeenCalledTimes(1) // seulement le start initial
    expect(getWakeWordState()).toBe('inactive')
  })

  it('F3b : sans pause, le retour à l\u2019écoute après détection relance la session (récupération voulue)', async () => {
    vi.useFakeTimers()
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)

    await startWakeWordListener()
    const callbacks = createSmartContinuousSTTMock.mock.calls[0][0]
    callbacks.onResult({ transcript: 'Julaba', isFinal: true, confidence: 1 })
    expect(getWakeWordState()).toBe('detected')

    // La modale ne s'ouvre jamais (callback absent) : après 10 s le
    // listener DOIT repartir tout seul.
    await vi.advanceTimersByTimeAsync(11000)
    expect(getWakeWordState()).toBe('listening')
    expect(s.start).toHaveBeenCalledTimes(2)
  })

  it('F2 : mot de réveil désactivé → resumeWakeWord ne relance pas le listener', async () => {
    setWakeWordEnabled(false)
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)

    // Ouverture puis fermeture d'une modale vocale…
    pauseWakeWord()
    resumeWakeWord()
    await flush()
    await flush()

    expect(createSmartContinuousSTTMock).not.toHaveBeenCalled()
    expect(getWakeWordState()).toBe('inactive')
  })

  it('F2b : mot de réveil activé → resumeWakeWord relance le listener', async () => {
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)

    pauseWakeWord()
    resumeWakeWord()
    await flush()
    await flush()

    expect(s.start).toHaveBeenCalledTimes(1)
    expect(getWakeWordState()).toBe('listening')
  })

  it('détection « Julaba » → beep, haptique, TTS, callback de réveil', async () => {
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)
    const onWake = vi.fn()
    onWakeDetected(onWake)

    await startWakeWordListener()
    const callbacks = createSmartContinuousSTTMock.mock.calls[0][0]
    callbacks.onResult({ transcript: 'eh julaba', isFinal: true, confidence: 1 })

    expect(playBeepMock).toHaveBeenCalledWith('success')
    expect(hapticMock).toHaveBeenCalledWith('success')
    expect(tataSpeakMock).toHaveBeenCalledWith('Oui, je vous écoute !', expect.any(Function))
    expect(onWake).toHaveBeenCalledTimes(1)
    expect(getWakeWordState()).toBe('detected')
  })

  it('détection « Tata » → ouvre le même parcours vocal', async () => {
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)
    const onWake = vi.fn()
    onWakeDetected(onWake)

    await startWakeWordListener()
    const callbacks = createSmartContinuousSTTMock.mock.calls[0][0]
    callbacks.onResult({ transcript: 'Tata, ouvre mes ventes', isFinal: true, confidence: 0.72 })

    expect(playBeepMock).toHaveBeenCalledWith('success')
    expect(onWake).toHaveBeenCalledTimes(1)
    expect(onWake).toHaveBeenCalledWith('ouvre mes ventes')
    expect(getWakeWordState()).toBe('detected')
  })

  it('conserve la commande prononcée après Tata pour la navigation directe', () => {
    expect(extractWakeWordCommand('Tata, ouvre mes ventes')).toBe('ouvre mes ventes')
    expect(extractWakeWordCommand('ta ta ouvre mon stock')).toBe('ouvre mon stock')
    expect(extractWakeWordCommand('Tatah ouvre ma caisse')).toBe('ouvre ma caisse')
    expect(extractWakeWordCommand('Bonjour Tata, dépense 1 000 francs')).toBe('dépense 1 000 francs')
    expect(extractWakeWordCommand('Assistant Tata, ouvre mon stock')).toBe('ouvre mon stock')
    expect(extractWakeWordCommand("T ata, s'il te plaît ouvre mes ventes")).toBe('ouvre mes ventes')
    expect(extractWakeWordCommand('Julaba')).toBe('')
  })

  it('bruit et résultats intermédiaires ne déclenchent pas le réveil', async () => {
    const s = fakeSession()
    createSmartContinuousSTTMock.mockResolvedValue(s as never)
    const onWake = vi.fn()
    onWakeDetected(onWake)

    await startWakeWordListener()
    const callbacks = createSmartContinuousSTTMock.mock.calls[0][0]
    // Interim ignoré (bruité par conception).
    callbacks.onResult({ transcript: 'djoula le marché', isFinal: false, confidence: 1 })
    // « djoula » seul est volontairement exclu (nom de la langue, pas du
    // marchand) ; « bonjour » n'est pas le mot de réveil.
    callbacks.onResult({ transcript: 'djoula', isFinal: true, confidence: 1 })
    callbacks.onResult({ transcript: 'bonjour', isFinal: true, confidence: 1 })

    expect(onWake).not.toHaveBeenCalled()
    expect(getWakeWordState()).toBe('listening')
  })
})
