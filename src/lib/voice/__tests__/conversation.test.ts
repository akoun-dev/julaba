import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useVoiceLanguageStore } from '../../stores/voice-language-store'
import { NllbError } from '../nllb-translation'

// tata-tts est entièrement mocké : l'orchestrateur ne doit toucher ni le
// MMS, ni les moteurs français réels — on vérifie le ROUTAGE et le texte.
vi.mock('../tata-tts', () => ({
  tataSpeak: vi.fn(),
  tataSpeakWeb: vi.fn(),
  tataStop: vi.fn(),
}))

import {
  narrateResponse,
  resolveConversationInput,
  resetConversationForTests,
  setConversationNllbForTests,
  describeConversationError,
  fetchJsonWithTimeout,
  CONVERSATION_NETWORK_TIMEOUT_MS,
} from '../conversation'
import { tataSpeak, tataSpeakWeb } from '../tata-tts'

const tataSpeakMock = vi.mocked(tataSpeak)
const tataSpeakWebMock = vi.mocked(tataSpeakWeb)

function makeResolver(impl?: (transcript: string, language: 'fr' | 'bci' | 'dyu') => Promise<{ text: string; translated: boolean }>) {
  return vi.fn(
    impl ??
      (async (transcript: string) => ({ text: `traduit(${transcript})`, translated: true })),
  )
}

function makeTranslator(impl?: (french: string) => Promise<string>) {
  return vi.fn(
    impl ?? (async (french: string) => `baoule(${french})`),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetConversationForTests()
  useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
})

describe('resolveConversationInput — lien montant', () => {
  it('session fr : pass-through strict, aucun appel traducteur', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'fr' })
    const resolver = makeResolver()
    setConversationNllbForTests({ parserInputResolver: resolver })

    const input = await resolveConversationInput('Tomates deux mille francs')

    expect(input).toEqual({
      text: 'Tomates deux mille francs',
      sourceText: 'Tomates deux mille francs',
      translated: false,
    })
    expect(resolver).not.toHaveBeenCalled()
  })

  it('session bci : traduction obligatoire, texte parseur = traduction', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    const resolver = makeResolver(async (t) => ({ text: `Cela coûte ${t}`, translated: true }))
    setConversationNllbForTests({ parserInputResolver: resolver })

    const input = await resolveConversationInput('n sran beogo')

    expect(resolver).toHaveBeenCalledWith('n sran beogo', 'bci')
    expect(input).toEqual({
      text: 'Cela coûte n sran beogo',
      sourceText: 'n sran beogo',
      translated: true,
    })
  })

  it('GARDE B2-022 : traducteur absent → lève, jamais de bci brut en sortie', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    setConversationNllbForTests({
      parserInputResolver: makeResolver(async () => {
        throw new NllbError(
          'NLLB_NOT_READY',
          'Le traducteur Baoulé n’est pas encore téléchargé. Téléchargez-le dans les réglages de la voix.',
        )
      }),
    })

    await expect(resolveConversationInput('n sran beogo')).rejects.toMatchObject({
      name: 'NllbError',
      code: 'NLLB_NOT_READY',
    })
  })

  it('GARDE B2-022 : timeout traducteur → erreur typée explicite', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    setConversationNllbForTests({
      parserInputResolver: makeResolver(async () => {
        throw new NllbError(
          'NLLB_TIMEOUT',
          'La traduction a pris trop de temps. Réessayez avec une phrase plus courte.',
        )
      }),
    })

    await expect(resolveConversationInput('phrase longue baoulé')).rejects.toMatchObject({
      code: 'NLLB_TIMEOUT',
    })
  })

  it('langue inconnue → NLLB_UNSUPPORTED (jamais de pass-through implicite)', async () => {
    // Force une valeur hors union pour vérifier le rejet explicite.
    useVoiceLanguageStore.setState({ sttLanguage: 'xx' as 'fr' })

    await expect(resolveConversationInput('test')).rejects.toMatchObject({
      code: 'NLLB_UNSUPPORTED',
    })
  })
})

describe('narrateResponse — lien descendant', () => {
  it('session fr : tataSpeak direct avec le texte original, dispatch inchangé', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'fr' })
    const translator = makeTranslator()
    setConversationNllbForTests({ translateToBci: translator })

    const cb = vi.fn()
    const reply = await narrateResponse('Vente enregistrée !', cb)

    expect(tataSpeakMock).toHaveBeenCalledWith('Vente enregistrée !', cb)
    expect(tataSpeakWebMock).not.toHaveBeenCalled()
    expect(translator).not.toHaveBeenCalled()
    expect(reply).toEqual({ spokenIn: 'fr' })
  })

  it('session bci : traduit fra→bci puis tataSpeak reçoit le texte baoulé BRUT', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    const translator = makeTranslator(async () => 'Kun beogo ni ye')
    setConversationNllbForTests({ translateToBci: translator })

    const cb = vi.fn()
    const reply = await narrateResponse('Vente enregistrée !', cb)

    expect(translator).toHaveBeenCalledWith('Vente enregistrée !')
    expect(tataSpeakMock).toHaveBeenCalledTimes(1)
    expect(tataSpeakMock).toHaveBeenCalledWith('Kun beogo ni ye', cb)
    expect(tataSpeakWebMock).not.toHaveBeenCalled()
    expect(reply).toEqual({ spokenIn: 'bci', bciText: 'Kun beogo ni ye' })
  })

  it('session bci + traduction impossible : repli tataSpeakWeb (JAMAIS du français dans la voix MMS)', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    setConversationNllbForTests({
      translateToBci: makeTranslator(async () => {
        throw new NllbError(
          'NLLB_NOT_READY',
          'Le traducteur Baoulé n’est pas encore téléchargé. Téléchargez-le dans les réglages de la voix.',
        )
      }),
    })

    const cb = vi.fn()
    const reply = await narrateResponse('Vente enregistrée !', cb)

    // Le texte français passe par tataSpeakWeb (chemin hors MMS + signal),
    // JAMAIS par tataSpeak dont le chemin bci donnerait le français à la voix akan.
    expect(tataSpeakMock).not.toHaveBeenCalled()
    expect(tataSpeakWebMock).toHaveBeenCalledTimes(1)
    expect(tataSpeakWebMock).toHaveBeenCalledWith('Vente enregistrée !', cb)
    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toContain('traducteur Baoulé')
  })

  it('session bci + échec traduction : narrateResponse ne lève jamais', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    setConversationNllbForTests({
      translateToBci: makeTranslator(async () => {
        throw new Error('panne moteur inattendue')
      }),
    })

    const reply = await narrateResponse('Dépense enregistrée !')

    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toContain('Traduction impossible')
    expect(tataSpeakWebMock).toHaveBeenCalledWith('Dépense enregistrée !', undefined)
  })

  it('sans callback : fonctionne et route quand même', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'bci' })
    setConversationNllbForTests({ translateToBci: makeTranslator() })

    const reply = await narrateResponse("D'accord, j'annule.")

    expect(reply).toEqual({ spokenIn: 'bci', bciText: "baoule(D'accord, j'annule.)" })
    expect(tataSpeakMock).toHaveBeenCalledWith("baoule(D'accord, j'annule.)", undefined)
  })

  it('session dyu : traduit fra→dyu puis tataSpeak reçoit le texte dioula BRUT (MODE-914)', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'dyu' })
    const translator = makeTranslator(async () => 'I ni ce, a ka nyi')
    setConversationNllbForTests({ translateToDyu: translator })

    const cb = vi.fn()
    const reply = await narrateResponse('Vente enregistrée !', cb)

    expect(translator).toHaveBeenCalledWith('Vente enregistrée !')
    expect(tataSpeakMock).toHaveBeenCalledTimes(1)
    expect(tataSpeakMock).toHaveBeenCalledWith('I ni ce, a ka nyi', cb)
    expect(tataSpeakWebMock).not.toHaveBeenCalled()
    expect(reply).toEqual({ spokenIn: 'dyu', dyuText: 'I ni ce, a ka nyi' })
  })

  it('session dyu + traduction impossible : repli tataSpeakWeb (JAMAIS du français dans la voix dyu)', async () => {
    useVoiceLanguageStore.setState({ ttsLanguage: 'dyu' })
    setConversationNllbForTests({
      translateToDyu: makeTranslator(async () => {
        throw new NllbError(
          'NLLB_NOT_READY',
          'Le traducteur (baoulé/dioula) n’est pas encore téléchargé. Téléchargez-le dans les réglages de la voix.',
        )
      }),
    })

    const cb = vi.fn()
    const reply = await narrateResponse('Vente enregistrée !', cb)

    // Le texte français passe par tataSpeakWeb (chemin hors voix dyu +
    // signal), JAMAIS par tataSpeak dont le chemin dyu donnerait le français
    // à la voix dioula MMS.
    expect(tataSpeakMock).not.toHaveBeenCalled()
    expect(tataSpeakWebMock).toHaveBeenCalledTimes(1)
    expect(tataSpeakWebMock).toHaveBeenCalledWith('Vente enregistrée !', cb)
    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toContain('baoulé/dioula')
  })

  it('session dyu + traducteur prêt par défaut : le fr tombé à l\'eau ne panique pas', async () => {
    // Sans seam injecté : resetConversationForTests() au beforeEach remet la
    // vraie chaîne (NLLB non chargé en tests) → échec géré, jamais levé.
    useVoiceLanguageStore.setState({ ttsLanguage: 'dyu' })

    const reply = await narrateResponse('Bonjour')

    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toBeTruthy()
    expect(tataSpeakWebMock).toHaveBeenCalledWith('Bonjour', undefined)
  })
})

describe('describeConversationError', () => {
  it('NllbError → message français tel quel', () => {
    const message = describeConversationError(
      new NllbError('NLLB_TIMEOUT', 'La traduction a pris trop de temps.'),
    )
    expect(message).toBe('La traduction a pris trop de temps.')
  })

  it('erreur générique → message formulé, jamais brut', () => {
    const message = describeConversationError(new Error('boom'))
    expect(message).toBe('Traduction impossible : boom')
  })
})

describe('resetConversationForTests', () => {
  it('rétablit la garde réelle resolveParserInput (bci sans modèle → NOT_READY)', async () => {
    useVoiceLanguageStore.setState({ sttLanguage: 'bci' })
    setConversationNllbForTests({
      parserInputResolver: makeResolver(async () => ({ text: 'pirate', translated: true })),
    })
    resetConversationForTests()

    // Hors navigateur (pas de caches) : la garde réelle refuse explicitement.
    await expect(resolveConversationInput('n sran beogo')).rejects.toMatchObject({
      code: 'NLLB_NOT_READY',
    })
  })
})

describe('fetchJsonWithTimeout — robustesse réseau (REQ-B4c)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('constante : borne à 10 s (jamais de fetch non borné en conversation)', () => {
    expect(CONVERSATION_NETWORK_TIMEOUT_MS).toBe(10_000)
  })

  it('réponse à temps → Response transmise telle quelle', async () => {
    const response = new Response('{}', { status: 200 })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    await expect(fetchJsonWithTimeout('/api/test', { method: 'POST' })).resolves.toBe(response)
  })

  it('serveur suspendu → erreur explicite avant la borne, signal avorté', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )

    await expect(fetchJsonWithTimeout('/api/test', undefined, 30)).rejects.toThrow(
      'Aucune réponse du serveur après 0 s',
    )
  })

  it('échec réseau non-abort → erreur d\'origine propagée (file offline côté appelant)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(fetchJsonWithTimeout('/api/test')).rejects.toThrow('Failed to fetch')
  })
})
