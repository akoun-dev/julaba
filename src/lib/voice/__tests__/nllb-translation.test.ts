import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NLLB_MODEL_ID,
  NLLB_LANGUAGES,
  NLLB_MAX_NEW_TOKENS,
  type NllbLanguage,
} from '../nllb-translation'

type CacheLike = {
  keys: () => Promise<Array<{ url: string }>>
  match: (req: { url: string }) => Promise<Response | undefined>
  put: (req: { url: string }, res: Response) => Promise<void>
  delete: (req: { url: string }) => Promise<boolean>
}

function makeCacheMock(): { mock: CacheLike; store: Map<string, string>; api: { open: ReturnType<typeof vi.fn> } } {
  const store = new Map<string, string>()
  const cacheObj: CacheLike = {
    keys: async () => [...store.keys()].map((url) => ({ url })),
    match: async (req) => (store.has(req.url) ? new Response('x') : undefined),
    put: async (req) => {
      store.set(req.url, 'x')
    },
    delete: async (req) => store.delete(req.url),
  }
  const open = vi.fn(async () => cacheObj)
  return { mock: cacheObj, store, api: { open } }
}

type LoaderBundle = {
  loader: () => Promise<{ pipeline: unknown }>
  pipelineMock: ReturnType<typeof vi.fn>
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
  return { loader: loader as unknown as LoaderBundle['loader'], pipelineMock, translatorMock }
}

async function freshModule(loaderBundle?: LoaderBundle) {
  vi.resetModules()
  const bundle = loaderBundle ?? makeLoader()
  const mod = await import('../nllb-translation')
  mod.setNllbPipelineLoaderForTests(bundle.loader as never)
  return { mod, ...bundle }
}

const originalWindow = globalThis.window

function enableBrowser(cachesMock?: { open: ReturnType<typeof vi.fn> }) {
  vi.stubGlobal('window', {} as unknown as Window)
  vi.stubGlobal('caches', (cachesMock?.open ? cachesMock : { open: vi.fn(async () => null) }) as unknown as typeof caches)
}

beforeEach(() => {
  if (typeof globalThis.window === 'undefined') {
    vi.stubGlobal('window', {} as unknown as Window)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalWindow !== undefined) {
    vi.stubGlobal('window', originalWindow)
  }
})

describe('nllb-translation', () => {
  describe('support et disponibilité', () => {
    it('isNllbSupported: false sans window (SSR/node pur)', async () => {
      vi.unstubAllGlobals()
      const { mod } = await freshModule()
      expect(mod.isNllbSupported()).toBe(false)
    })

    it('isNllbSupported: true avec window + WebAssembly + caches', async () => {
      const cachesMock = makeCacheMock()
      vi.stubGlobal('caches', cachesMock as unknown as typeof caches)
      const { mod } = await freshModule()
      expect(mod.isNllbSupported()).toBe(true)
    })

    it('isNllbModelReady: false quand cache vide, true quand le modèle est en cache', async () => {
      const cachesMock = makeCacheMock()
      enableBrowser(cachesMock.api)
      let { mod } = await freshModule()
      expect(await mod.isNllbModelReady()).toBe(false)

      cachesMock.store.set(`https://huggingface.co/${NLLB_MODEL_ID}/resolve/main/onnx/encoder_model_quantized.onnx`, 'x')
      ;({ mod } = await freshModule())
      expect(await mod.isNllbModelReady()).toBe(true)
    })

    it('isNllbModelReady: true quand une instance est déjà chargée en mémoire', async () => {
      enableBrowser()
      const { mod } = await freshModule()
      await mod.downloadNllbModel()
      expect(await mod.isNllbModelReady()).toBe(true)
    })
  })

  describe('downloadNllbModel', () => {
    it('télécharge avec le bon modèle et agrège la progression', async () => {
      enableBrowser()
      const { mod, pipelineMock } = await freshModule()
      const percents: number[] = []
      const progress = (p: number) => percents.push(p)

      // Simule le flux progress_callback de Transformers.js sur 2 fichiers.
      pipelineMock.mockImplementation(async (_task, _model, options) => {
        const cb = (options as { progress_callback?: (info: Record<string, unknown>) => void })
          .progress_callback
        cb?.({ status: 'progress', file: 'encoder.onnx', loaded: 50, total: 100 })
        cb?.({ status: 'progress', file: 'encoder.onnx', loaded: 100, total: 100 })
        cb?.({ status: 'progress', file: 'decoder.onnx', loaded: 50, total: 100 })
        cb?.({ status: 'done', file: 'decoder.onnx' })
        return vi.fn()
      })

      await expect(mod.downloadNllbModel(progress)).resolves.toBe(true)
      expect(pipelineMock).toHaveBeenCalledWith('translation', NLLB_MODEL_ID, expect.anything())
      // Agrégation : (100+50)/(100+100) = 75 %
      expect(percents[percents.length - 1]).toBe(75)
    })

    it('échec réseau → NLLB_DOWNLOAD_FAILED avec message explicite', async () => {
      enableBrowser()
      const bundle = makeLoader()
      bundle.pipelineMock.mockRejectedValue(new Error('fetch failed'))
      const { mod } = await freshModule(bundle)
      await expect(mod.downloadNllbModel()).rejects.toMatchObject({
        code: 'NLLB_DOWNLOAD_FAILED',
      })
      await expect(mod.downloadNllbModel()).rejects.toThrow(/connexion/i)
    })

    it('téléchargement baoulé → charge le modèle spécialisé du hub local', async () => {
      enableBrowser()
      const { mod, pipelineMock } = await freshModule()
      await expect(mod.downloadNllbModel(undefined, 'bci')).resolves.toBe(true)
      expect(pipelineMock).toHaveBeenCalledWith('translation', mod.NLLB_BCI_MODEL_ID, expect.anything())
    })

    it('isNllbModelReady par langue : chaque langue suit SON modèle', async () => {
      const cachesMock = makeCacheMock()
      cachesMock.store.set(`https://huggingface.co/${NLLB_MODEL_ID}/resolve/main/onnx/encoder_model_quantized.onnx`, 'x')
      enableBrowser(cachesMock.api)
      const premier = await freshModule()
      expect(await premier.mod.isNllbModelReady('dyu')).toBe(true)
      // le modèle baoulé n'est pas en cache : bci reste indisponible
      expect(await premier.mod.isNllbModelReady('bci')).toBe(false)
      expect(await premier.mod.isNllbModelReady('fr')).toBe(true)
      // une fois le modèle baoulé en cache (URLs same-origin du hub local),
      // la sonde baoulé passe
      cachesMock.store.set('https://app.test/api/voix/nllb-baoule-v1/resolve/main/onnx/encoder_model_quantized.onnx', 'x')
      const second = await freshModule()
      expect(await second.mod.isNllbModelReady('bci')).toBe(true)
    })

    it('contexte non supporté (sans window) → NLLB_UNSUPPORTED', async () => {
      vi.unstubAllGlobals()
      const { mod } = await freshModule()
      await expect(mod.downloadNllbModel()).rejects.toMatchObject({ code: 'NLLB_UNSUPPORTED' })
    })
  })

  describe('translateText', () => {
    it('refuse un texte vide → NLLB_EMPTY_INPUT', async () => {
      enableBrowser()
      const { mod } = await freshModule()
      await expect(
        mod.translateText('   ', { src: 'bci_Latn', tgt: 'fra_Latn' }),
      ).rejects.toMatchObject({ code: 'NLLB_EMPTY_INPUT' })
    })

    it('refuse une paire de langues invalide → NLLB_UNSUPPORTED', async () => {
      enableBrowser()
      const { mod } = await freshModule()
      await expect(
        mod.translateText('bonjour', { src: 'eng_Latn' as NllbLanguage, tgt: 'fra_Latn' }),
      ).rejects.toMatchObject({ code: 'NLLB_UNSUPPORTED' })
      await expect(
        mod.translateText('bonjour', { src: 'fra_Latn', tgt: 'fra_Latn' }),
      ).rejects.toMatchObject({ code: 'NLLB_UNSUPPORTED' })
    })

    it('ne télécharge JAMAIS implicitement → NLLB_NOT_READY si absent (dyu)', async () => {
      const cachesMock = makeCacheMock()
      enableBrowser(cachesMock.api)
      const { mod, pipelineMock } = await freshModule()
      await expect(
        mod.translateText('mani océ', { src: NLLB_LANGUAGES.dyu, tgt: NLLB_LANGUAGES.fra }),
      ).rejects.toMatchObject({ code: 'NLLB_NOT_READY' })
      expect(pipelineMock).not.toHaveBeenCalled()
    })

    it('paire baoulé sans cache → NLLB_NOT_READY avec libellé baoulé (modèle spécialisé)', async () => {
      const cachesMock = makeCacheMock()
      enableBrowser(cachesMock.api)
      const { mod, pipelineMock } = await freshModule()
      await expect(
        mod.translateText('mani océ', { src: NLLB_LANGUAGES.bci, tgt: NLLB_LANGUAGES.fra }),
      ).rejects.toMatchObject({ code: 'NLLB_NOT_READY' })
      await expect(
        mod.translateText('mani océ', { src: NLLB_LANGUAGES.bci, tgt: NLLB_LANGUAGES.fra }),
      ).rejects.toThrow(/baoulé/i)
      expect(pipelineMock).not.toHaveBeenCalled()
    })

    it('NLLB_MODELS déclare le modèle baoulé spécialisé sur le hub local (Task 84)', async () => {
      const { mod } = await freshModule()
      const bci = mod.NLLB_MODELS.find((m) => m.id === mod.NLLB_BCI_MODEL_ID)
      expect(bci).toBeDefined()
      expect(bci!.languages).toContain('bci_Latn')
      expect(bci!.languages).toContain('fra_Latn')
      expect(bci!.localHub).toBe(true)
      // et le modèle dioula reste sur le hub HF
      const dyu = mod.NLLB_MODELS.find((m) => m.id === mod.NLLB_MODEL_ID)
      expect(dyu).toBeDefined()
      expect(dyu!.localHub).toBe(false)
    })

    it('traduit dyu→fra quand le modèle est en cache, avec les bons paramètres', async () => {
      const cachesMock = makeCacheMock()
      cachesMock.store.set(`https://huggingface.co/${NLLB_MODEL_ID}/resolve/main/onnx/decoder_model_merged_quantized.onnx`, 'x')
      enableBrowser(cachesMock.api)
      const { mod, translatorMock } = await freshModule()

      const out = await mod.translateText('mani océ', {
        src: NLLB_LANGUAGES.dyu,
        tgt: NLLB_LANGUAGES.fra,
      })
      expect(out).toBe('Bonjour du traducteur')
      expect(translatorMock).toHaveBeenCalledWith('mani océ', {
        src_lang: 'dyu_Latn',
        tgt_lang: 'fra_Latn',
        max_new_tokens: NLLB_MAX_NEW_TOKENS,
      })
    })

    it('retourne la sortie sans télécharger quand une instance est déjà chargée', async () => {
      enableBrowser()
      const { mod, pipelineMock, translatorMock } = await freshModule()
      await mod.downloadNllbModel()
      expect(pipelineMock).toHaveBeenCalledTimes(1)
      await mod.translateText('je vends du manioc', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu })
      await mod.translateText('je vends de l’attiéké', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu })
      // L’instance est réutilisée : le loader n’a servi qu’une fois.
      expect(pipelineMock).toHaveBeenCalledTimes(1)
      expect(translatorMock).toHaveBeenCalledTimes(2)
    })

    it('timeout → NLLB_TIMEOUT (génération pendante)', async () => {
      enableBrowser()
      const bundle = makeLoader(() => new Promise(() => {}))
      const { mod } = await freshModule(bundle)
      await mod.downloadNllbModel()
      await expect(
        mod.translateText('phrase longue', {
          src: NLLB_LANGUAGES.fra,
          tgt: NLLB_LANGUAGES.dyu,
          timeoutMs: 50,
        }),
      ).rejects.toMatchObject({ code: 'NLLB_TIMEOUT' })
    })

    it('sortie vide → NLLB_EMPTY_OUTPUT', async () => {
      enableBrowser()
      const bundle = makeLoader(async () => [{ translation_text: '  ' }])
      const { mod } = await freshModule(bundle)
      await mod.downloadNllbModel()
      await expect(
        mod.translateText('bonjour', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu }),
      ).rejects.toMatchObject({ code: 'NLLB_EMPTY_OUTPUT' })
    })

    it('erreur moteur « code de langue invalide » → NLLB_UNSUPPORTED avec message français (défense en profondeur)', async () => {
      enableBrowser()
      const bundle = makeLoader(async () => {
        throw new Error('Source language code "bci_Latn" is not valid. Must be one of: {…}')
      })
      const { mod } = await freshModule(bundle)
      await mod.downloadNllbModel()
      await expect(
        mod.translateText('bonjour', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu }),
      ).rejects.toMatchObject({ code: 'NLLB_UNSUPPORTED' })
      await expect(
        mod.translateText('bonjour', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu }),
      ).rejects.toThrow(/ne couvre pas cette paire|modèle adapté/i)
    })

    it('erreur moteur inattendue → NLLB_ENGINE_ERROR', async () => {
      enableBrowser()
      const bundle = makeLoader(async () => {
        throw new Error('ONNX runtime error')
      })
      const { mod } = await freshModule(bundle)
      await mod.downloadNllbModel()
      await expect(
        mod.translateText('bonjour', { src: NLLB_LANGUAGES.fra, tgt: NLLB_LANGUAGES.dyu }),
      ).rejects.toMatchObject({ code: 'NLLB_ENGINE_ERROR' })
    })
  })

  describe('resolveParserInput — garde d’architecture (le parseur ne voit jamais de bci brut)', () => {
    it('fr → passthrough sans traducteur (aucun appel pipeline)', async () => {
      enableBrowser()
      const { mod, pipelineMock } = await freshModule()
      const result = await mod.resolveParserInput('tomates deux mille', 'fr')
      expect(result).toEqual({ text: 'tomates deux mille', translated: false })
      expect(pipelineMock).not.toHaveBeenCalled()
    })

    it('bci + modèle spécialisé absent du cache → NLLB_NOT_READY avec libellé baoulé', async () => {
      enableBrowser()
      const { mod, pipelineMock } = await freshModule()
      await expect(mod.resolveParserInput('nán wɔ maŋ', 'bci')).rejects.toMatchObject({
        code: 'NLLB_NOT_READY',
      })
      await expect(mod.resolveParserInput('nán wɔ maŋ', 'bci')).rejects.toThrow(/baoulé/i)
      expect(pipelineMock).not.toHaveBeenCalled()
    })

    it('dyu + traducteur absent → lève NLLB_NOT_READY (jamais de dyu brut)', async () => {
      const cachesMock = makeCacheMock()
      enableBrowser(cachesMock.api)
      const { mod } = await freshModule()
      await expect(mod.resolveParserInput('n sran beogo', 'dyu')).rejects.toMatchObject({
        code: 'NLLB_NOT_READY',
      })
      // Le message est explicite pour l’utilisateur.
      await expect(mod.resolveParserInput('n sran beogo', 'dyu')).rejects.toThrow(
        /télécharg/i,
      )
    })

    it('langue de session inconnue → NLLB_UNSUPPORTED', async () => {
      enableBrowser()
      const { mod } = await freshModule()
      await expect(mod.resolveParserInput('x', 'es' as 'fr')).rejects.toMatchObject({
        code: 'NLLB_UNSUPPORTED',
      })
    })
  })

  describe('removeNllbModel et erreurs', () => {
    it('removeNllbModel ne supprime que les fichiers NLLB', async () => {
      const cachesMock = makeCacheMock()
      const nllbUrl = `https://huggingface.co/${NLLB_MODEL_ID}/resolve/main/onnx/encoder_model_quantized.onnx`
      cachesMock.store.set(nllbUrl, 'x')
      cachesMock.store.set('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/model_quantized.onnx', 'x')
      enableBrowser(cachesMock.api)
      const { mod } = await freshModule()
      await mod.removeNllbModel()
      expect(cachesMock.store.has(nllbUrl)).toBe(false)
      expect(cachesMock.store.size).toBe(1)
    })

    it('describeNllbError couvre les trois familles d’erreurs', async () => {
      // NB : NllbError provient de l’exemplaire frais du module —
      // vi.resetModules() rend un import statique top-level non instanceof.
      const { mod } = await freshModule()
      expect(mod.describeNllbError(new mod.NllbError('NLLB_NOT_READY', 'pas prêt'))).toBe('pas prêt')
      expect(mod.describeNllbError(new Error('boom'))).toBe('Traduction impossible : boom')
      expect(
        mod.describeNllbError(
          new Error('Source language code "bci_Latn" is not valid. Must be one of: {…}'),
        ),
      ).toMatch(/ne connaît pas la langue « bci_Latn »/)
      expect(mod.describeNllbError('inconnu')).toBe(
        'Traduction impossible : erreur inconnue du traducteur.',
      )
    })
  })
})
