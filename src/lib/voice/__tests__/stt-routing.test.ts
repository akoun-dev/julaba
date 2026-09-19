import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canAttemptSTT,
  createSmartContinuousSTT,
  createSmartSingleShotSTT,
  describeSTTError,
  normalizeVoiceLanguage,
  resetSherpaStateForTests,
} from '../stt-factory'
import { SherpaStt } from '../sherpa-stt'
import {
  createVoiceServiceSingleShotSTT,
  initVoiceService,
} from '../voice-service'
import { useVoiceLanguageStore } from '@/lib/stores/voice-language-store'

// Task 32 — branchement de VoiceService dans stt-factory avec sélecteur de
// langue. Routing attendu (single-shot) :
//   'bci' → route dédiée VoiceService, AUCUN fallback (mission §18)
//   'fr' natif → VoiceService (batch RTF) → Sherpa → Web Speech
//   'fr' web → chaîne historique sans VoiceService
// Le continu (mot d'appel) reste Sherpa ; bci continu → refus explicite.

const mockNative = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockNative.value },
  // B5-051 : stt-factory route le bci via la façade baoule-engine →
  // conversation → tata-tts → native-tts, qui appelle registerPlugin au
  // chargement. Pont inerte ici — ces tests n'exercent que le ROUTAGE.
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

const vsSession = { start: () => {}, stop: () => {}, abort: () => {}, isListening: () => false }

vi.mock('../voice-service', () => ({
  createVoiceServiceSingleShotSTT: vi.fn(async () => vsSession),
  initVoiceService: vi.fn(async () => true),
  BAOULE_NOT_READY_MESSAGE: 'BAOULE_STUB_MESSAGE',
  BAOULE_CONTINUOUS_UNAVAILABLE_MESSAGE: 'BAOULE_CONTINUOUS_STUB_MESSAGE',
  getVoiceServiceStatus: vi.fn(async () => null),
  mapVoiceServiceError: vi.fn((e: unknown) => String(e)),
  isVoiceServicePlatformAvailable: vi.fn(() => mockNative.value),
  resetVoiceServiceStateForTests: vi.fn(() => {}),
}))

describe('normalizeVoiceLanguage', () => {
  it('fr, fr-FR, undefined → fr', () => {
    expect(normalizeVoiceLanguage('fr')).toBe('fr')
    expect(normalizeVoiceLanguage('fr-FR')).toBe('fr')
    expect(normalizeVoiceLanguage(undefined)).toBe('fr')
  })

  it('bci, bci_Latn, bci-Latn → bci', () => {
    expect(normalizeVoiceLanguage('bci')).toBe('bci')
    expect(normalizeVoiceLanguage('bci_Latn')).toBe('bci')
    expect(normalizeVoiceLanguage('bci-Latn')).toBe('bci')
  })
})

describe('routing single-shot — VoiceService branché', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSherpaStateForTests()
    mockNative.value = true
    useVoiceLanguageStore.setState({ sttLanguage: 'fr' })
  })

  it('fr sur natif → VoiceService prioritaire, Sherpa non consulté', async () => {
    const session = await createSmartSingleShotSTT({ onResult: () => {} })
    expect(initVoiceService).toHaveBeenCalledWith('fr')
    expect(createVoiceServiceSingleShotSTT).toHaveBeenCalledWith(expect.anything(), { lang: 'fr' })
    expect(session).toBe(vsSession)
    expect(SherpaStt.isAvailable).not.toHaveBeenCalled()
  })

  it('VoiceService indisponible → retombe sur la chaîne historique (Sherpa)', async () => {
    vi.mocked(initVoiceService).mockResolvedValue(false)
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: true, modelLoaded: true })
    const session = await createSmartSingleShotSTT({ onResult: () => {} })
    expect(createVoiceServiceSingleShotSTT).not.toHaveBeenCalled()
    expect(session).not.toBe(vsSession)
    // La session Sherpa démarre réellement la reconnaissance mockée.
    session.start()
    await vi.waitFor(() => expect(vi.mocked(SherpaStt.startRecognition)).toHaveBeenCalledTimes(1))
    session.stop()
  })

  it('VoiceService ET Sherpa indisponibles → session inerte « Aucun moteur STT disponible »', async () => {
    vi.mocked(initVoiceService).mockResolvedValue(false)
    // Implémentations ré-affichées explicitement : mockResolvedValue d'un
    // test précédent survit à clearAllMocks (qui n'efface que les appels).
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: false, modelLoaded: false })
    vi.mocked(SherpaStt.initModel).mockRejectedValue(new Error('no assets'))
    const onError = vi.fn()
    const session = await createSmartSingleShotSTT({ onResult: () => {}, onError })
    session.start()
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith('Aucun moteur STT disponible')
  })

  it('web fr → jamais VoiceService (chaîne historique inchangée)', async () => {
    mockNative.value = false
    await createSmartSingleShotSTT({ onResult: () => {} })
    expect(initVoiceService).not.toHaveBeenCalled()
    expect(createVoiceServiceSingleShotSTT).not.toHaveBeenCalled()
  })

  it('bci via options.lang → route dédiée sans fallback, même sur web', async () => {
    mockNative.value = false
    const session = await createSmartSingleShotSTT({ onResult: () => {} }, { lang: 'bci' })
    expect(createVoiceServiceSingleShotSTT).toHaveBeenCalledWith(expect.anything(), { lang: 'bci' })
    expect(session).toBe(vsSession)
    expect(SherpaStt.isAvailable).not.toHaveBeenCalled()
  })

  it('bci via sélecteur global (store persisté) quand options.lang absent', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    await createSmartSingleShotSTT({ onResult: () => {} })
    expect(createVoiceServiceSingleShotSTT).toHaveBeenCalledWith(expect.anything(), { lang: 'bci' })
  })

  // Écran d'authentification (Task 39) : la connexion est francophone
  // uniquement — options.lang 'fr' doit écraser le sélecteur global bci
  // (persisté), sinon l'utilisateur web voyait l'erreur « modèle non
  // embarqué » dès la dictée du numéro.
  it("options.lang 'fr' ignore le sélecteur global bci → route français, jamais bci (web)", async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    mockNative.value = false
    await createSmartSingleShotSTT({ onResult: () => {} }, { lang: 'fr' })
    expect(createVoiceServiceSingleShotSTT).not.toHaveBeenCalled()
    expect(initVoiceService).not.toHaveBeenCalled()
  })

  it("options.lang 'fr' sur natif → VoiceService 'fr' même si le sélecteur global vaut bci", async () => {
    // Ré-affichage explicite : mockResolvedValue(false) d'un test précédent
    // survit à clearAllMocks (qui n'efface que les appels).
    vi.mocked(initVoiceService).mockResolvedValue(true)
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    await createSmartSingleShotSTT({ onResult: () => {} }, { lang: 'fr' })
    expect(createVoiceServiceSingleShotSTT).toHaveBeenCalledWith(expect.anything(), { lang: 'fr' })
  })
})

describe('routing continuous — mot d\u2019appel inchangé, bci refusé', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSherpaStateForTests()
    mockNative.value = true
    useVoiceLanguageStore.setState({ sttLanguage: 'fr' })
  })

  it('bci continu → session inerte avec message explicite (mode continu non supporté), Sherpa jamais touché', async () => {
    const onError = vi.fn()
    const onEnd = vi.fn()
    const session = await createSmartContinuousSTT({ onResult: () => {}, onError, onEnd }, { lang: 'bci' })
    session.start()
    expect(onError).toHaveBeenCalledWith('BAOULE_CONTINUOUS_STUB_MESSAGE')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(vi.mocked(SherpaStt.startRecognition)).not.toHaveBeenCalled()
    expect(session.isListening()).toBe(false)
  })

  it('fr continu → Sherpa streaming inchangé', async () => {
    vi.mocked(SherpaStt.isAvailable).mockResolvedValue({ available: true, modelLoaded: true })
    const session = await createSmartContinuousSTT({ onResult: () => {} })
    session.start()
    await vi.waitFor(() => expect(vi.mocked(SherpaStt.startRecognition)).toHaveBeenCalledTimes(1))
    session.stop()
  })
})

describe('canAttemptSTT — porte des boutons micro', () => {
  beforeEach(() => {
    resetSherpaStateForTests()
    useVoiceLanguageStore.setState({ sttLanguage: 'fr' })
  })

  it('natif → toujours true (VoiceService charge son moteur au premier usage)', () => {
    mockNative.value = true
    expect(canAttemptSTT()).toBe(true)
  })

  it('web sans Web Speech ni Sherpa chargé → false', () => {
    mockNative.value = false
    expect(canAttemptSTT()).toBe(false)
  })
})

describe('describeSTTError — codes connus vs messages formulés', () => {
  it('codes Web Speech → messages français dédiés', () => {
    expect(describeSTTError('no-speech')).toBe("Je n'ai rien entendu. Réessayez.")
    // VOCAL-612 — micro indisponible : proposition clavier explicite
    const microIndisponible = 'Le micro n\'est pas disponible. Vérifiez l\'autorisation du micro ou utilisez le clavier.'
    expect(describeSTTError('not-allowed')).toBe(microIndisponible)
    expect(describeSTTError('service-not-allowed')).toBe(microIndisponible)
    expect(describeSTTError('audio-capture')).toBe(microIndisponible)
    expect(describeSTTError('network')).toBe(
      'Connexion internet nécessaire pour la reconnaissance vocale. Vérifiez votre réseau.'
    )
    expect(describeSTTError('failed')).toBe("Je n'ai pas bien entendu. Réessayez.")
  })

  it('message déjà formulé (VoiceService / Baoulé) → pass-through intégral', () => {
    const baoule = 'Langue baoulé : le moteur Omnilingual ASR (bci_Latn) n\u2019est pas encore intégré…'
    expect(describeSTTError(baoule)).toBe(baoule)
    expect(describeSTTError('Erreur du moteur vocal : decode failed')).toBe(
      'Erreur du moteur vocal : decode failed'
    )
  })
})
