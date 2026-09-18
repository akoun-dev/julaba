// B4-042 (AGENT 2) — Tests E2E de la chaîne conversation baoulé, mocks aux
// SEULES frontières externes (pont natif STT, modèle NLLB, moteurs TTS).
// Tous les maillons MÉTIER sont les modules RÉELS branchés en production :
// baoule-engine (façade) → conversation (garde B2-022 + narrateResponse) →
// localIntent (parseIntent) / confirmations (parseConfirmation) → tata-tts
// (routage narration). Scénario TEST_PLAN §3-B4 : dictée bci → trad fr →
// intention vente → confirmation → trad bci → TTS bci.
//
// Hors périmètre (suites dédiées existantes) : exécution métier de la vente
// (completeQuickSale + stores + file offline), rendu des modales.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVoiceLanguageStore } from '../../stores/voice-language-store'
import { useAppStore } from '../../stores/app-store'
import { NllbError } from '../nllb-translation'

const mockNative = vi.hoisted(() => ({ value: true }))

// Pont natif STT simulé : start() ouvre le micro, stop() produit UN résultat
// final (phrase baoulé dictée), comme le VoiceServicePlugin réel.
const BCI_UTTERANCE = 'n be wɔrɔ tomate kun inyaan'
let sttCallbacks: {
  onResult?: (r: { transcript: string; confidence: number; isFinal: boolean }) => void
  onError?: (m: string) => void
  onEnd?: () => void
} | null = null

vi.mock('../voice-service', () => ({
  createVoiceServiceSingleShotSTT: vi.fn(async (callbacks: {
    onResult?: (r: { transcript: string; confidence: number; isFinal: boolean }) => void
    onError?: (m: string) => void
    onEnd?: () => void
  }) => {
    sttCallbacks = callbacks
    return {
      start: () => {},
      stop: () => {
        callbacks.onResult?.({
          transcript: BCI_UTTERANCE,
          confidence: 0.9,
          isFinal: true,
        })
        callbacks.onEnd?.()
      },
      abort: () => {},
      isListening: () => false,
    }
  }),
  initVoiceService: vi.fn(async () => mockNative.value),
  isVoiceServicePlatformAvailable: vi.fn(() => mockNative.value),
}))

vi.mock('../tata-tts', () => ({
  tataSpeak: vi.fn(),
  tataSpeakWeb: vi.fn(),
  tataStop: vi.fn(),
}))

import {
  createBaouleTranscriptionSession,
  getBaouleEngineStatus,
  prepareBaouleParserInput,
  speakBaoule,
} from '../baoule-engine'
import { parseIntent } from '../localIntent'
import { parseConfirmation } from '../confirmations'
import { setConversationNllbForTests, resetConversationForTests } from '../conversation'
import { tataSpeak, tataSpeakWeb } from '../tata-tts'

const tataSpeakMock = vi.mocked(tataSpeak)
const tataSpeakWebMock = vi.mocked(tataSpeakWeb)

const FR_TRANSLATION = 'tomates deux mille francs'
const BCI_NARRATION = 'n kun beogo ni ye'

beforeEach(() => {
  vi.clearAllMocks()
  resetConversationForTests()
  sttCallbacks = null
  mockNative.value = true
  useVoiceLanguageStore.setState({ sttLanguage: 'bci', ttsLanguage: 'bci' })
  useAppStore.setState({ voiceConfirmation: 'always' })
  // Traducteur NLLB simulé (modèle 872 Mo absent du sandbox) : bci→fr et
  // fr→bci déterministes — les vraies traductions se valident sur appareil
  // (B2-021) et par locuteur natif (B3-032).
  setConversationNllbForTests({
    parserInputResolver: vi.fn(async (t: string) => ({ text: FR_TRANSLATION, translated: true })),
    translateToBci: vi.fn(async () => BCI_NARRATION),
  })
})

describe('B4-042 — E2E chaîne : dictée bci → vente confirmée → TTS bci', () => {
  it('tour complet : session STT → transcript bci → trad fr → intent vente → narration bci', async () => {
    // 1) Sonde : STT natif prêt ; traducteur/voix = sondes RÉELLES (Cache API
    //    absente du sandbox → false, même avec les seams de traduction actifs
    //    ci-dessous) — sur appareil, ces flags reflètent les installations
    //    opt-in réelles (réglages voix).
    const status = await getBaouleEngineStatus()
    expect(status.sttReady).toBe(true)

    // 2) Écoute : la session STT bci produit le transcript baoulé
    let transcript = ''
    const session = await createBaouleTranscriptionSession({
      onResult: (r) => { transcript = r.transcript },
      onError: () => {},
      onEnd: () => {},
    })
    session.start()
    session.stop()
    await vi.waitFor(() => expect(transcript).toBe(BCI_UTTERANCE))

    // 3) Lien montant : traduction OBLIGATOIRE bci→fr (garde B2-022)
    const input = await prepareBaouleParserInput(transcript)
    expect(input.translated).toBe(true)
    expect(input.text).toBe(FR_TRANSLATION)
    expect(input.text).not.toBe(BCI_UTTERANCE)

    // 4) IA locale : le parseur français identifie l'intention de vente
    const intent = parseIntent(input.text)
    expect(intent.type).toBe('sale')
    expect(intent.amount).toBe(2000)
    expect(intent.product).toMatch(/tomate/i)

    // 5) Confirmation (préférence « always ») : la réponse bci « ɛhɛ » confirme
    const shouldConfirm = useAppStore.getState().voiceConfirmation === 'always'
    expect(shouldConfirm).toBe(true)
    expect(parseConfirmation('ɛhɛ')).toBe('yes')

    // 6) Narration de la réponse : fr → NLLB fra→bci → tataSpeak (texte brut
    //    baoulé, cheminement MMS en production)
    const reply = await speakBaoule(intent.responseText)
    expect(reply.spokenIn).toBe('bci')
    expect(reply.bciText).toBe(BCI_NARRATION)
    expect(tataSpeakMock).toHaveBeenCalledWith(BCI_NARRATION, undefined)
    expect(tataSpeakWebMock).not.toHaveBeenCalled()
  })

  it('réponse « ao » : la confirmation bci annule et le message est narré en bci', async () => {
    expect(parseConfirmation('ao')).toBe('no')
    const reply = await speakBaoule("D'accord, j'annule.")
    expect(reply.spokenIn).toBe('bci')
    expect(tataSpeakMock).toHaveBeenCalledWith(BCI_NARRATION, undefined)
  })

  it('garde en chaîne réelle : traducteur absent → BaouleEngineError, la chaîne s\u2019arrête AVANT parseIntent', async () => {
    setConversationNllbForTests({
      parserInputResolver: vi.fn(async () => {
        throw new NllbError('NLLB_NOT_READY', 'Le traducteur Baoulé n’est pas encore téléchargé.')
      }),
    })

    let parserCalled = false
    try {
      const input = await prepareBaouleParserInput(BCI_UTTERANCE)
      parseIntent(input.text) // ne doit JAMAIS être atteint
      parserCalled = true
    } catch (error) {
      expect((error as Error).name).toBe('BaouleEngineError')
      expect((error as Error & { code: string }).code).toBe('BAOULE_TRANSLATOR_NOT_READY')
    }
    expect(parserCalled).toBe(false)
  })

  it('réponse en bci impossible : repli français hors chemin MMS, explicite', async () => {
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

describe('B4-042 — non-régression : le même parcours en session française', () => {
  it('fr : pass-through strict (aucune traduction), intent identique, narration française', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
    const parserInputResolver = vi.fn()
    setConversationNllbForTests({ parserInputResolver })

    // 1) Transcript français → pass-through (garde inactive)
    const input = await prepareBaouleParserInput('tomates deux mille francs')
    expect(input.translated).toBe(false)
    expect(input.text).toBe('tomates deux mille francs')
    expect(parserInputResolver).not.toHaveBeenCalled()

    // 2) Même IA, même résultat
    const intent = parseIntent(input.text)
    expect(intent.type).toBe('sale')
    expect(intent.amount).toBe(2000)

    // 3) Confirmation française inchangée
    expect(parseConfirmation('oui')).toBe('yes')
    expect(parseConfirmation('non')).toBe('no')

    // 4) Narration française directe (chaîne historique)
    const reply = await speakBaoule('Vente enregistrée !')
    expect(reply).toEqual({ spokenIn: 'fr' })
    expect(tataSpeakMock).toHaveBeenCalledWith('Vente enregistrée !', undefined)
    expect(tataSpeakWebMock).not.toHaveBeenCalled()
  })
})
