import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVoiceLanguageStore } from '../../stores/voice-language-store'
import { NllbError } from '../nllb-translation'

// ── Mocks de la façade ─────────────────────────────────────────────────────
// voice-service et mms-tts sont mockés en bloc (pont natif + cache MMS) ;
// nllb-translation garde ses VRAIES classes d'erreur (instanceof dans le
// mapping) avec ses sondes simulées ; tata-tts (sous conversation.ts) est
// mocké — la façade ne doit toucher aucun moteur réel.

const mockNative = vi.hoisted(() => ({ value: false }))
const mockNllbReady = vi.hoisted(() => ({ value: false }))
const mockVoiceReady = vi.hoisted(() => ({ value: false }))

vi.mock('../voice-service', () => ({
  createVoiceServiceSingleShotSTT: vi.fn(async () => makeInertSession()),
  initVoiceService: vi.fn(async (lang: string) => mockNative.value && lang === 'bci'),
  isVoiceServicePlatformAvailable: vi.fn(() => mockNative.value),
}))

vi.mock('../nllb-translation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nllb-translation')>()
  return {
    ...actual,
    isNllbModelReady: vi.fn(async () => mockNllbReady.value),
    downloadNllbModel: vi.fn(async () => true),
  }
})

vi.mock('../mms-tts', () => ({
  isMmsBciVoiceReady: vi.fn(async () => mockVoiceReady.value),
  downloadMmsBciVoice: vi.fn(async () => true),
}))

vi.mock('../tata-tts', () => ({
  tataSpeak: vi.fn(),
  tataSpeakWeb: vi.fn(),
  tataStop: vi.fn(),
}))

import {
  BaouleEngineError,
  createBaouleTranscriptionSession,
  describeBaouleEngineError,
  getBaouleEngineStatus,
  initializeBaouleEngine,
  installBaouleTranslator,
  installBaouleVoice,
  isBaouleEngineReady,
  prepareBaouleParserInput,
  speakBaoule,
  translateBaouleToFrench,
} from '../baoule-engine'
import { resetConversationForTests, setConversationNllbForTests } from '../conversation'
import { tataSpeak, tataSpeakWeb } from '../tata-tts'
import { createVoiceServiceSingleShotSTT } from '../voice-service'
import { downloadMmsBciVoice } from '../mms-tts'
import { downloadNllbModel } from '../nllb-translation'

const tataSpeakMock = vi.mocked(tataSpeak)
const tataSpeakWebMock = vi.mocked(tataSpeakWeb)
const createSessionMock = vi.mocked(createVoiceServiceSingleShotSTT)

function makeInertSession() {
  let fired = false
  return {
    start: () => {
      if (fired) return
      fired = true
    },
    stop: () => {},
    abort: () => {},
    isListening: () => false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetConversationForTests()
  mockNative.value = false
  mockNllbReady.value = false
  mockVoiceReady.value = false
  useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
})

describe('getBaouleEngineStatus / isBaouleEngineReady — sonde sans effet de bord', () => {
  it('tout absent : stt=false (pas de coque native), traducteur=false, voix=false', async () => {
    const status = await getBaouleEngineStatus()
    expect(status).toEqual({ sttReady: false, translatorReady: false, voiceReady: false })
    await expect(isBaouleEngineReady()).resolves.toBe(false)
  })

  it('tout présent (native + cache NLLB + cache MMS) : ready=true', async () => {
    mockNative.value = true
    mockNllbReady.value = true
    mockVoiceReady.value = true
    await expect(isBaouleEngineReady()).resolves.toBe(true)
  })

  it('un seul maillon manquant suffit à refuser le ready', async () => {
    mockNative.value = true
    mockNllbReady.value = true
    mockVoiceReady.value = false
    await expect(isBaouleEngineReady()).resolves.toBe(false)
  })
})

describe('initializeBaouleEngine — initialise sans JAMAIS télécharger', () => {
  it('natif présent : moteur STT bci chargé, état exact des maillons manquants', async () => {
    mockNative.value = true
    mockNllbReady.value = true

    const status = await initializeBaouleEngine()

    expect(status).toEqual({ sttReady: true, translatorReady: true, voiceReady: false })
    expect(downloadNllbModel).not.toHaveBeenCalled()
    expect(downloadMmsBciVoice).not.toHaveBeenCalled()
  })

  it('hors natif : sttReady=false, aucune initialisation STT tentée', async () => {
    const status = await initializeBaouleEngine()
    expect(status.sttReady).toBe(false)
    expect(downloadNllbModel).not.toHaveBeenCalled()
  })
})

describe('createBaouleTranscriptionSession — B1 écoute', () => {
  it('délègue au VoiceService en langue bci (offline natif)', async () => {
    await createBaouleTranscriptionSession({ onResult: () => {} })
    expect(createSessionMock).toHaveBeenCalledWith(
      { onResult: expect.any(Function) },
      { lang: 'bci', maxDurationMs: undefined },
    )
  })

  it('transmet maxDurationMs au moteur natif', async () => {
    await createBaouleTranscriptionSession({ onResult: () => {} }, { maxDurationMs: 15000 })
    expect(createSessionMock).toHaveBeenCalledWith(
      { onResult: expect.any(Function) },
      { lang: 'bci', maxDurationMs: 15000 },
    )
  })
})

describe('translateBaouleToFrench / prepareBaouleParserInput — B2/B4 lien montant', () => {
  it('traduit bci→fr via le maillon B2', async () => {
    setConversationNllbForTests({
      parserInputResolver: vi.fn(async (t: string) => ({ text: `fr(${t})`, translated: true })),
    })
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })

    await expect(prepareBaouleParserInput('n sran beogo')).resolves.toEqual({
      text: 'fr(n sran beogo)',
      sourceText: 'n sran beogo',
      translated: true,
    })
  })

  it('session fr : pass-through strict, aucune traduction', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'fr' })
    await expect(prepareBaouleParserInput('tomates 2000')).resolves.toEqual({
      text: 'tomates 2000',
      sourceText: 'tomates 2000',
      translated: false,
    })
  })

  it('GARDE : traducteur absent → BAOULE_TRANSLATOR_NOT_READY (jamais de bci brut)', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    setConversationNllbForTests({
      parserInputResolver: vi.fn(async () => {
        throw new NllbError('NLLB_NOT_READY', 'Le traducteur Baoulé n’est pas encore téléchargé.')
      }),
    })

    const err = await prepareBaouleParserInput('n sran beogo').catch((e) => e)
    expect(err).toBeInstanceOf(BaouleEngineError)
    expect((err as BaouleEngineError).code).toBe('BAOULE_TRANSLATOR_NOT_READY')
    expect((err as BaouleEngineError).message).toContain('traducteur Baoulé')
  })

  it('mapping NllbError → codes façade préservant le message français (bci sans modèle spécialisé → UNSUPPORTED)', async () => {
    // Chemin RÉEL : aucune paire baoulé n'est couverte tant que le modèle
    // spécialisé n'est pas enregistré (bci_Latn absent du tokenizer NLLB-200,
    // vérification 2026-09-20) — la façade préserve NLLB_UNSUPPORTED et son
    // message français honnête.
    try {
      await translateBaouleToFrench('phrase')
      expect.unreachable('la traduction baoulé doit échouer sans modèle spécialisé')
    } catch (error) {
      expect((error as BaouleEngineError).code).toBe('BAOULE_UNSUPPORTED')
      expect(describeBaouleEngineError(error)).toContain('baoulé')
    }
  })
})

describe('speakBaoule — B3/B4 lien descendant', () => {
  it('session fr : tataSpeak direct (chaîne historique inchangée)', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'fr' })
    const reply = await speakBaoule('Vente enregistrée !')
    expect(tataSpeakMock).toHaveBeenCalledWith('Vente enregistrée !', undefined)
    expect(reply).toEqual({ spokenIn: 'fr' })
  })

  it('session bci + maillons prêts : traduit puis narré en bci', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    setConversationNllbForTests({ translateToBci: vi.fn(async () => 'kun beogo') })

    const reply = await speakBaoule('Vente enregistrée !')

    expect(reply).toEqual({ spokenIn: 'bci', bciText: 'kun beogo' })
    expect(tataSpeakMock).toHaveBeenCalledWith('kun beogo', undefined)
  })

  it('traduction impossible : repli français hors chemin MMS + translationError', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    setConversationNllbForTests({
      translateToBci: vi.fn(async () => {
        throw new NllbError('NLLB_NOT_READY', 'Le traducteur Baoulé n’est pas encore téléchargé.')
      }),
    })

    const reply = await speakBaoule('Vente enregistrée !')

    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toContain('traducteur Baoulé')
    expect(tataSpeakMock).not.toHaveBeenCalled()
    expect(tataSpeakWebMock).toHaveBeenCalledWith('Vente enregistrée !', undefined)
  })
})

describe('installations opt-in — actions utilisateur explicites', () => {
  it('installBaouleTranslator délègue au téléchargement NLLB (jamais appelé ailleurs)', async () => {
    await expect(installBaouleTranslator()).resolves.toBe(true)
    expect(downloadNllbModel).toHaveBeenCalledTimes(1)
  })

  it('installBaouleVoice délègue au téléchargement MMS et wrappe les erreurs', async () => {
    vi.mocked(downloadMmsBciVoice).mockRejectedValueOnce(new Error('réseau coupé'))
    const err = await installBaouleVoice().catch((e) => e)
    expect(err).toBeInstanceOf(BaouleEngineError)
    expect((err as BaouleEngineError).code).toBe('BAOULE_VOICE_ERROR')
    expect((err as BaouleEngineError).message).toBe('réseau coupé')
  })
})
