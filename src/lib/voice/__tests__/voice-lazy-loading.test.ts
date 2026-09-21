import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useVoiceLanguageStore } from '@/lib/stores/voice-language-store'
import { VoiceService } from '../../../plugins/voice-service'
import {
  PACK_MISSING_MESSAGE,
  createVoiceServiceSingleShotSTT,
  initVoiceService,
  resetVoiceServiceStateForTests,
} from '../voice-service'

// MODE-962 — Chargement à la demande du système vocal multilingue.
//
// Règle absolue : « changer de langue ≠ charger les modèles ». Le changement
// de langue (fr→bci, fr→dyu, bci↔dyu) ne doit déclencher AUCUN chargement
// lourd (Omnilingual 349 Mo, NLLB ~870-893 Mo, MMS ~114 Mo, runtime
// ONNX/Transformers.js). Les modèles se chargent uniquement au premier
// usage réel : micro → ASR, traduction → NLLB, narration locale → MMS.
//
// Ces tests verrouillent :
//   1/2. setVoiceLanguage('bci'/'dyu') ne charge aucun modèle lourd
//        (régression du sélecteur : l'ancien warmMultilingualVoice gelait
//        le WebView Android en chargeant NLLB + MMS en Promise.all) ;
//   3.   le premier appui micro déclenche l'initialisation ASR ;
//   4.   deux initVoiceService simultanées (même langue) = UN chargement ;
//   5.   bci→dyu : bascule sans rechargement du moteur omnilingual partagé
//        (le natif réutilise le recognizer — VoiceServicePlugin.initialize)
//        et anti-race inter-langues (init bci en vol + demande dyu =
//        initialisations séquentielles, jamais la promesse de l'autre langue) ;
//   6.   NLLB n'est pas chargé sans traduction ;
//   7.   MMS n'est pas chargé sans TTS local ;
//   8.   pack absent → erreur explicite PACK_MISSING (jamais un fallback
//        silencieux vers le français) ;
//   9.   le français continue de fonctionner (chemin historique inchangé).

const mockNative = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockNative.value },
}))

vi.mock('../../../plugins/voice-service', () => ({
  VoiceService: {
    initialize: vi.fn(async (_o?: { language?: string }) => ({
      ready: true,
      language: 'fr',
      engine: 'sherpa-onnx',
      initialized: true,
    })),
    isReady: vi.fn(async () => ({ ready: true, language: 'fr', engine: 'sherpa-onnx' })),
    // Sonde MODE-953 : par défaut, modèle disponible (assets du build full).
    isModelAvailable: vi.fn(async (_o?: { language?: string }) => ({
      available: true,
      source: 'assets',
    })),
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

// Le pipeline Transformers.js est espionné : si un code de chargement lourd
// se déclenche au changement de langue, pipeline() est appelé → échec du test.
const mockPipeline = vi.hoisted(() => vi.fn(async () => ({ 'X': true })))

vi.mock('@xenova/transformers', () => ({
  pipeline: mockPipeline,
  env: { remoteHost: '', remotePathTemplate: '' },
}))

const mockedInitialize = vi.mocked(VoiceService.initialize)
const mockedIsModelAvailable = vi.mocked(VoiceService.isModelAvailable)
const mockedStartRecording = vi.mocked(VoiceService.startRecording)
const mockedTranscribe = vi.mocked(VoiceService.transcribe)

describe('MODE-962 — le changement de langue ne charge aucun modèle lourd', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
  })

  // Garde-fou de régression : l'ancien warm-up (voice-warmup.ts,
  // Promise.all([warmNllbModel, warmMmsVoice])) a été retiré du sélecteur —
  // aucune réintroduction ne doit passer inaperçue.
  it('le sélecteur de langue ne référence plus le warm-up multilingue (fichier supprimé)', () => {
    const repoRoot = process.cwd()
    expect(existsSync(join(repoRoot, 'src/lib/voice/voice-warmup.ts'))).toBe(false)
    const selector = readFileSync(
      join(repoRoot, 'src/components/voice/language-selector.tsx'),
      'utf8',
    )
    expect(selector).not.toContain('warmMultilingualVoice')
    expect(selector).not.toContain('voice-warmup')
  })

  it("Test 1 — setVoiceLanguage('bci') : pur changement d'état, aucun modèle lourd", () => {
    useVoiceLanguageStore.getState().setVoiceLanguage('bci')
    expect(useVoiceLanguageStore.getState().sttLanguage).toBe('bci')
    // Aucun pipeline Transformers.js (NLLB, MMS), aucun appel natif ASR :
    expect(mockPipeline).not.toHaveBeenCalled()
    expect(mockedInitialize).not.toHaveBeenCalled()
    expect(mockedStartRecording).not.toHaveBeenCalled()
  })

  it("Test 2 — setVoiceLanguage('dyu') : pur changement d'état, aucun modèle lourd", () => {
    useVoiceLanguageStore.getState().setVoiceLanguage('dyu')
    expect(useVoiceLanguageStore.getState().sttLanguage).toBe('dyu')
    expect(mockPipeline).not.toHaveBeenCalled()
    expect(mockedInitialize).not.toHaveBeenCalled()
  })

  it('bci → dyu → bci (changement de langue) : aucun chargement lourd en chaîne', () => {
    const store = useVoiceLanguageStore.getState()
    store.setVoiceLanguage('bci')
    store.setVoiceLanguage('dyu')
    store.setVoiceLanguage('bci')
    store.setVoiceLanguage('fr')
    expect(mockPipeline).not.toHaveBeenCalled()
    expect(mockedInitialize).not.toHaveBeenCalled()
  })
})

describe('MODE-962 — ASR chargé uniquement au premier usage réel (micro)', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
  })

  it('Test 3 — le premier appui micro déclenche l\'initialisation ASR baoulé (probe puis init)', async () => {
    const onResult = vi.fn()
    const onEnd = vi.fn()
    const session = await createVoiceServiceSingleShotSTT(
      { onResult, onEnd },
      { lang: 'bci' },
    )
    // Probe léger (MODE-953) puis init — SEULEMENT à la création de session :
    expect(mockedIsModelAvailable).toHaveBeenCalledWith({ language: 'bci' })
    expect(mockedInitialize).toHaveBeenCalledWith({ language: 'bci' })
    session.start()
    await vi.waitFor(() => expect(mockedStartRecording).toHaveBeenCalledTimes(1))
    session.stop()
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1))
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true }))
    expect(mockedTranscribe).toHaveBeenCalledWith({ language: 'bci' })
  })

  it('Test 4 — deux initVoiceService simultanées (même langue) = un seul chargement natif', async () => {
    let release: (() => void) | null = null
    mockedInitialize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ready: true, language: 'bci', engine: 'sherpa-onnx', initialized: true })
        }),
    )
    const first = initVoiceService('bci')
    const second = initVoiceService('bci')
    // Les deux promesses pendent sur la MÊME initialisation en vol :
    await vi.waitFor(() => expect(release).not.toBeNull())
    release!()
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(mockedInitialize).toHaveBeenCalledTimes(1)
  })

  it('Test 5a — bci → dyu : bascule du moteur omnilingual partagé (dédup, sans init fantôme)', async () => {
    expect(await initVoiceService('bci')).toBe(true)
    expect(await initVoiceService('dyu')).toBe(true)
    // Deux appels natifs : bci (chargement) puis dyu (bascule d'étiquette —
    // le natif NE recharge PAS le modèle partagé, VoiceServicePlugin L.161).
    expect(mockedInitialize).toHaveBeenCalledTimes(2)
    const languages = mockedInitialize.mock.calls.map(
      (call) => (call[0] as { language: string }).language,
    )
    expect(languages).toEqual(['bci', 'dyu'])
    // Dédup : dyu déjà prêt → aucun appel supplémentaire.
    expect(await initVoiceService('dyu')).toBe(true)
    expect(mockedInitialize).toHaveBeenCalledTimes(2)
  })

  it('Test 5b — anti-race inter-langues : init bci en vol + demande dyu = séquentiel, jamais confondu', async () => {
    const order: string[] = []
    mockedInitialize.mockImplementation(async (opts) => {
      const lang = (opts as { language?: 'fr' | 'bci' | 'dyu' } | undefined)?.language ?? 'fr'
      order.push(`start:${lang}`)
      // yield microtask : simule un chargement asynchrone réel
      await Promise.resolve()
      order.push(`end:${lang}`)
      return { ready: true, language: lang, engine: 'sherpa-onnx', initialized: true }
    })
    const bci = initVoiceService('bci')
    // dyu est demandé PENDANT que bci est en vol :
    const dyu = initVoiceService('dyu')
    expect(await bci).toBe(true)
    expect(await dyu).toBe(true)
    // Les deux langues ont été réellement initialisées, SÉQUENTIELLEMENT —
    // l'ancien code retournait la promesse bci pour la demande dyu :
    expect(mockedInitialize).toHaveBeenCalledTimes(2)
    expect(order).toEqual(['start:bci', 'end:bci', 'start:dyu', 'end:dyu'])
  })
})

describe('MODE-962 — NLLB et MMS ne se chargent qu\u2019à l\u2019usage réel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
  })

  it('Test 6 — NLLB n\u2019est pas chargé sans traduction (import module + changement de langue inertes)', async () => {
    await import('../nllb-translation')
    useVoiceLanguageStore.getState().setVoiceLanguage('dyu')
    await Promise.resolve()
    // Le pipeline de traduction n'a PAS été créé (translateText seul
    // déclenche loadNllb — et l'ancien warm-up est supprimé) :
    expect(mockPipeline).not.toHaveBeenCalled()
  })

  it('Test 7 — MMS n\u2019est pas chargé sans TTS local (import module + changement de langue inertes)', async () => {
    await import('../mms-tts')
    useVoiceLanguageStore.getState().setVoiceLanguage('bci')
    await Promise.resolve()
    // Le pipeline text-to-speech n'a PAS été créé (mms*Speak seul déclenche
    // loadMms — et l'ancien warm-up est supprimé) :
    expect(mockPipeline).not.toHaveBeenCalled()
  })
})

describe('MODE-962 — packs et français', () => {
  beforeEach(() => {
    resetVoiceServiceStateForTests()
    vi.clearAllMocks()
    mockNative.value = true
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
  })

  it('Test 8 — pack omnilingual absent → erreur explicite PACK_MISSING, jamais un fallback', async () => {
    mockedIsModelAvailable.mockResolvedValueOnce({ available: false, source: 'none' })
    const onResult = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()
    const session = await createVoiceServiceSingleShotSTT(
      { onResult, onError, onEnd },
      { lang: 'bci' },
    )
    // Le probe suffit à conclure : AUCUNE initialisation lourde tentée.
    expect(mockedInitialize).not.toHaveBeenCalled()
    expect(mockedStartRecording).not.toHaveBeenCalled()
    session.start()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(PACK_MISSING_MESSAGE))
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(session.isListening()).toBe(false)
  })

  it('Test 9 — le français continue de fonctionner (chemin historique, sans probe)', async () => {
    const onResult = vi.fn()
    const onEnd = vi.fn()
    const session = await createVoiceServiceSingleShotSTT(
      { onResult, onEnd },
      { lang: 'fr' },
    )
    // Aucun probe pour 'fr' : modèle embarqué au build, chemin inchangé.
    expect(mockedIsModelAvailable).not.toHaveBeenCalled()
    expect(mockedInitialize).toHaveBeenCalledWith({ language: 'fr' })
    session.start()
    await vi.waitFor(() => expect(mockedStartRecording).toHaveBeenCalledTimes(1))
    session.stop()
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1))
  })
})
