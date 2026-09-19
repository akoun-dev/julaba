import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Intégration DIOULA (dyu_Latn) — même logique que le baoulé (B5-050) :
 *   B1 ÉCOUTE      : VoiceService natif, MÊME moteur Omnilingual ASR
 *                    (1 600 langues — dyu est une extension de code) ;
 *   B2 TRADUCTION  : NLLB-200 dyu↔fra (MÊME modèle téléchargé que bci) ;
 *   B4 CHAÎNE      : resolveConversationInput traduit OBLIGATOIREMENT
 *                    dyu→fr avant le parseur (garde B2-022 généralisée) ;
 *   NARRATION      : française (aucune voix TTS dyu — pas de port ONNX),
 *                    signalée une fois par session.
 */

// ── B2 — NLLB dyu_Latn ─────────────────────────────────────────────────────

type LoaderBundle = {
  loader: () => Promise<{ pipeline: unknown }>
  translatorMock: ReturnType<typeof vi.fn>
}

function makeLoader(
  translatorImpl?: (text: string, opts: Record<string, unknown>) => Promise<unknown>,
): LoaderBundle {
  const translatorMock = vi.fn(
    translatorImpl ?? (async () => [{ translation_text: 'Bonjour du traducteur' }]),
  )
  const pipelineMock = vi.fn(async () => translatorMock)
  const loader = vi.fn(async () => ({ pipeline: pipelineMock }))
  return { loader: loader as unknown as LoaderBundle['loader'], translatorMock }
}

async function freshNllb(loaderBundle?: LoaderBundle) {
  vi.resetModules()
  const bundle = loaderBundle ?? makeLoader()
  const mod = await import('../nllb-translation')
  mod.setNllbPipelineLoaderForTests(bundle.loader as never)
  return { mod, ...bundle }
}

const originalWindow = globalThis.window

function enableBrowserWithCachedModel() {
  vi.stubGlobal('window', {} as unknown as Window)
  const cacheObj = {
    keys: async () => [{ url: 'https://huggingface.co/Xenova/nllb-200-distilled-600M/onnx/encoder_model_quantized.onnx' }],
    match: async () => new Response('x'),
    put: async () => {},
    delete: async () => true,
  }
  vi.stubGlobal('caches', { open: vi.fn(async () => cacheObj) } as unknown as typeof caches)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  if (originalWindow !== undefined) vi.stubGlobal('window', originalWindow)
})

describe('intégration dioula — NLLB dyu_Latn (même modèle que le baoulé)', () => {
  it('NLLB_LANGUAGES expose dyu → dyu_Latn (code FLORES-200)', async () => {
    const { mod } = await freshNllb()
    expect(mod.NLLB_LANGUAGES.dyu).toBe('dyu_Latn')
  })

  it('translateText accepte la paire dyu→fra', async () => {
    enableBrowserWithCachedModel()
    const { mod, translatorMock } = await freshNllb()
    const out = await mod.translateText('N sɔn fɛɛrɛ', { src: 'dyu_Latn', tgt: 'fra_Latn' })
    expect(out).toBe('Bonjour du traducteur')
    expect(translatorMock).toHaveBeenCalledWith(
      'N sɔn fɛɛrɛ',
      expect.objectContaining({ src_lang: 'dyu_Latn', tgt_lang: 'fra_Latn' }),
    )
  })

  it('translateText accepte la paire fra→dyu (lien descendant)', async () => {
    enableBrowserWithCachedModel()
    const { mod, translatorMock } = await freshNllb()
    await mod.translateText('Vente enregistrée', { src: 'fra_Latn', tgt: 'dyu_Latn' })
    expect(translatorMock).toHaveBeenCalledWith(
      'Vente enregistrée',
      expect.objectContaining({ src_lang: 'fra_Latn', tgt_lang: 'dyu_Latn' }),
    )
  })

  it('refuse la paire dyu→dyu (traduction inutile)', async () => {
    enableBrowserWithCachedModel()
    const { mod } = await freshNllb()
    await expect(
      mod.translateText('x', { src: 'dyu_Latn', tgt: 'dyu_Latn' }),
    ).rejects.toMatchObject({ code: 'NLLB_UNSUPPORTED' })
  })

  it('resolveParserInput traduit OBLIGATOIREMENT en session dyu (garde B2-022)', async () => {
    enableBrowserWithCachedModel()
    const { mod, translatorMock } = await freshNllb()
    const resolved = await mod.resolveParserInput('N ye sara', 'dyu')
    expect(resolved).toEqual({ text: 'Bonjour du traducteur', translated: true })
    expect(translatorMock).toHaveBeenCalledWith(
      'N ye sara',
      expect.objectContaining({ src_lang: 'dyu_Latn', tgt_lang: 'fra_Latn' }),
    )
  })

  it('resolveParserInput refuse une langue hors pilote', async () => {
    const { mod } = await freshNllb()
    await expect(mod.resolveParserInput('x', 'zzu' as never)).rejects.toMatchObject({
      code: 'NLLB_UNSUPPORTED',
    })
  })
})

// ── Façade — jumelle dioula ────────────────────────────────────────────────

describe('intégration dioula — façade baoule-engine', () => {
  it('translateDioulaToFrench route vers NLLB dyu_Latn→fra_Latn', async () => {
    enableBrowserWithCachedModel()
    vi.resetModules()
    const nllb = await import('../nllb-translation')
    const spy = vi.spyOn(nllb, 'translateText').mockResolvedValue('Traduit du dioula')
    const engine = await import('../baoule-engine')
    const out = await engine.translateDioulaToFrench('N sɔn fɛɛrɛ')
    expect(out).toBe('Traduit du dioula')
    expect(spy).toHaveBeenCalledWith('N sɔn fɛɛrɛ', expect.objectContaining({ src: 'dyu_Latn', tgt: 'fra_Latn' }))
  })
})

// ── B4 — chaîne de conversation en session dioula ─────────────────────────

describe('intégration dioula — chaîne de conversation', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { useVoiceLanguageStore } = await import('../../stores/voice-language-store')
    useVoiceLanguageStore.setState({ sttLanguage: 'dyu', ttsLanguage: 'dyu' })
  })

  it('resolveConversationInput passe par la traduction dyu→fr', async () => {
    const conversation = await import('../conversation')
    conversation.setConversationNllbForTests({
      parserInputResolver: vi.fn(async (t: string, lang: string) => ({
        text: `fr(${t})`,
        translated: lang === 'dyu',
      })),
    })
    const input = await conversation.resolveConversationInput('N ye sara')
    expect(input).toEqual({ text: 'fr(N ye sara)', sourceText: 'N ye sara', translated: true })
    conversation.resetConversationForTests()
  })

  it('narrateResponse en session dyu : traduit fra→dyu puis tataSpeak reçoit le texte dioula (MODE-914)', async () => {
    const conversation = await import('../conversation')
    const tataTts = await import('../tata-tts')
    const speakSpy = vi.spyOn(tataTts, 'tataSpeak').mockImplementation((_t, cb) => cb?.('done'))
    conversation.setConversationNllbForTests({
      translateToDyu: vi.fn(async () => 'A ka nyi, vente fin'),
    })
    const reply = await conversation.narrateResponse('Vente enregistrée.', vi.fn())
    expect(reply).toEqual({ spokenIn: 'dyu', dyuText: 'A ka nyi, vente fin' })
    expect(speakSpy).toHaveBeenCalledWith('A ka nyi, vente fin', expect.anything())
    conversation.resetConversationForTests()
  })

  it('narrateResponse en session dyu sans voix ni traducteur : repli français EXPLICITE (jamais silencieux)', async () => {
    const conversation = await import('../conversation')
    const tataTts = await import('../tata-tts')
    const speakSpy = vi.spyOn(tataTts, 'tataSpeak').mockImplementation((_t, cb) => cb?.('done'))
    const webSpy = vi.spyOn(tataTts, 'tataSpeakWeb').mockImplementation((_t, cb) => cb?.('done'))
    // Pas de seam : la vraie chaîne NLLB n'est ni chargée ni en cache dans
    // l'environnement de test → NLLB_NOT_READY → narration française via
    // tataSpeakWeb (hors voix dyu) + translationError affichable.
    const reply = await conversation.narrateResponse('Vente enregistrée.', vi.fn())
    expect(reply.spokenIn).toBe('fr')
    expect(reply.translationError).toBeTruthy()
    expect(webSpy).toHaveBeenCalledWith('Vente enregistrée.', expect.anything())
    // Le texte français n'a JAMAIS atteint le chemin dyu (voix MMS).
    expect(speakSpy).not.toHaveBeenCalled()
  })
})

// ── Store — langue dioula persistée sur les deux facettes ─────────────────

describe('intégration dioula — voice-language-store', () => {
  it('setVoiceLanguage(« dyu ») règle dictée ET narration', async () => {
    const { useVoiceLanguageStore, getSelectedVoiceLanguage, getSelectedTtsLanguage } =
      await import('../../stores/voice-language-store')
    useVoiceLanguageStore.getState().setVoiceLanguage('dyu')
    expect(getSelectedVoiceLanguage()).toBe('dyu')
    expect(getSelectedTtsLanguage()).toBe('dyu')
    useVoiceLanguageStore.getState().setVoiceLanguage('fr')
    expect(getSelectedVoiceLanguage()).toBe('fr')
  })
})

// ── B1 — normalisation et routage STT ─────────────────────────────────────

describe('intégration dioula — stt-factory', () => {
  it('normalizeVoiceLanguage reconnaît dyu (dyu, dyu-Latn, dyu_Latn, DYU)', async () => {
    const { normalizeVoiceLanguage } = await import('../stt-factory')
    expect(normalizeVoiceLanguage('dyu')).toBe('dyu')
    expect(normalizeVoiceLanguage('dyu-Latn')).toBe('dyu')
    expect(normalizeVoiceLanguage('dyu_Latn')).toBe('dyu')
    expect(normalizeVoiceLanguage('DYU')).toBe('dyu')
    expect(normalizeVoiceLanguage('dyula-x')).toBe('dyu') // « dyula » = orthographe dioula
    expect(normalizeVoiceLanguage('fr-FR')).toBe('fr')
    expect(normalizeVoiceLanguage()).toBe('fr')
  })

  it('écoute continue en dioula : refus explicite (push-to-talk uniquement)', async () => {
    const { useVoiceLanguageStore } = await import('../../stores/voice-language-store')
    useVoiceLanguageStore.setState({ sttLanguage: 'dyu', ttsLanguage: 'dyu' })
    const { createSmartContinuousSTT } = await import('../stt-factory')
    const onError = vi.fn()
    const onEnd = vi.fn()
    const session = await createSmartContinuousSTT({ onResult: vi.fn(), onError, onEnd })
    session.start()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('dioula'))
    expect(onEnd).toHaveBeenCalled()
  })
})
