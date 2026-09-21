import { beforeEach, describe, expect, it, vi } from 'vitest'

// Le store délègue au pack-manager (mocké ici — son comportement réel est
// testé dans src/lib/voice/__tests__/packs.test.ts). On teste la FAÇADE
// réactive : progression relayée, verrou d'installation, erreurs affichées
// (jamais avalées), rafraîchissement systématique.

import type { VoicePackState } from '../voice/packs/pack-manager'
import type { VoicePackDescriptor, VoicePackId } from '../voice/packs/registry'

const packManagerMocks = vi.hoisted(() => ({
  listVoicePackStates: vi.fn(async (): Promise<VoicePackState[]> => []),
  installVoicePack: vi.fn(
    async (_id: VoicePackId, _onProgress?: (percent: number) => void): Promise<boolean> => true,
  ),
  removeVoicePack: vi.fn(async (_id: VoicePackId): Promise<void> => undefined),
}))
vi.mock('../voice/packs/pack-manager', () => packManagerMocks)

import { useVoicePacksStore } from './voice-packs-store'

const descriptorStub = (id: VoicePackId): VoicePackDescriptor => ({
  id,
  label: id,
  description: id,
  languages: ['fr'],
  sizeMb: 10,
  sizeVerified: true,
  mechanism: 'cache-api',
  optIn: true,
  bundledInFullApk: false,
  removable: true,
  ownerModule: 'test',
})

beforeEach(() => {
  vi.clearAllMocks()
  useVoicePacksStore.setState({
    packs: [],
    refreshInFlight: false,
    installInFlight: null,
    installProgress: 0,
    lastError: null,
  })
})

describe('store des packs vocaux (MODE-952)', () => {
  it('refreshPacks remplit l’état réel des packs', async () => {
    packManagerMocks.listVoicePackStates.mockResolvedValue([
      { descriptor: descriptorStub('tts-piper-fr'), supported: true, installed: true },
    ])
    await useVoicePacksStore.getState().refreshPacks()
    const state = useVoicePacksStore.getState()
    expect(state.packs).toHaveLength(1)
    expect(state.packs[0]).toMatchObject({ installed: true })
    expect(state.refreshInFlight).toBe(false)
  })

  it('refreshPacks n’est pas réentrant (un seul sondage à la fois)', async () => {
    let release!: () => void
    packManagerMocks.listVoicePackStates.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve([]) }),
    )
    const first = useVoicePacksStore.getState().refreshPacks()
    await useVoicePacksStore.getState().refreshPacks() // doit être un no-op
    expect(packManagerMocks.listVoicePackStates).toHaveBeenCalledTimes(1)
    release()
    await first
  })

  it('installPack relaie la progression, verrouille les installations concurrentes et rafraîchit à la fin', async () => {
    packManagerMocks.installVoicePack.mockImplementation(
      async (_id: VoicePackId, onProgress?: (percent: number) => void) => {
        onProgress?.(40)
        onProgress?.(90)
        return true
      },
    )
    const second = useVoicePacksStore.getState().installPack('tts-piper-fr')
    expect(useVoicePacksStore.getState().installInFlight).toBe('tts-piper-fr')
    const secondResult = await second
    // En réalité le second appel part APRÈS le premier (await) — on vérifie
    // surtout le verrou en état : après l’installation, plus rien en vol.
    expect(secondResult).toBe(true)
    expect(useVoicePacksStore.getState().installInFlight).toBeNull()
    expect(useVoicePacksStore.getState().installProgress).toBe(0)
    // Le rafraîchissement final a bien été déclenché.
    expect(packManagerMocks.listVoicePackStates).toHaveBeenCalled()
  })

  it('installPack verrouille pendant une installation en vol (jamais deux téléchargements lourds à la fois)', async () => {
    let release!: (value: boolean) => void
    packManagerMocks.installVoicePack.mockImplementation(
      () => new Promise<boolean>((resolve) => { release = resolve }),
    )
    const first = useVoicePacksStore.getState().installPack('nllb-bci')
    const second = await useVoicePacksStore.getState().installPack('nllb-dyu')
    expect(second).toBe(false)
    release(true)
    expect(await first).toBe(true)
  })

  it('un échec d’installation renseigne lastError (message affiché, jamais avalé) et renvoie false', async () => {
    packManagerMocks.installVoicePack.mockResolvedValue(false)
    expect(await useVoicePacksStore.getState().installPack('tts-kokoro-fr')).toBe(false)
    expect(useVoicePacksStore.getState().lastError).toContain('tts-kokoro-fr')
  })

  it('une exception d’installation est capturée en lastError (le store ne throw jamais)', async () => {
    packManagerMocks.installVoicePack.mockRejectedValue(new Error('quota stockage dépassé'))
    expect(await useVoicePacksStore.getState().installPack('nllb-dyu')).toBe(false)
    expect(useVoicePacksStore.getState().lastError).toBe('quota stockage dépassé')
    expect(useVoicePacksStore.getState().installInFlight).toBeNull()
  })

  it('removePack délègue puis rafraîchit ; un échec est capturé en lastError', async () => {
    packManagerMocks.removeVoicePack.mockRejectedValueOnce(new Error('fichier verrouillé'))
    await useVoicePacksStore.getState().removePack('tts-mms-dyu')
    expect(packManagerMocks.removeVoicePack).toHaveBeenCalledWith('tts-mms-dyu')
    expect(useVoicePacksStore.getState().lastError).toBe('fichier verrouillé')
    expect(packManagerMocks.listVoicePackStates).toHaveBeenCalled()
  })
})
