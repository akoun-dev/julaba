import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pont natif simulé — @capacitor/network ne fonctionne pas sous Node. Le
// mock capture le listener networkStatusChange et laisse chaque test piloter
// le statut (résolution du getStatus initial, puis événements de transition).
const { listeners, getStatusMock, removeMock } = vi.hoisted(() => ({
  listeners: [] as Array<(status: { connected: boolean; connectionType: string }) => void>,
  getStatusMock: vi.fn<() => Promise<{ connected: boolean; connectionType: string }>>(),
  removeMock: vi.fn(),
}))

vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: getStatusMock,
    addListener: vi.fn(async (_event: string, listener: (status: { connected: boolean; connectionType: string }) => void) => {
      listeners.push(listener)
      return { remove: removeMock }
    }),
  },
}))

// Le store est un singleton de module avec un watcher singleton — chaque
// test repart d'une registry de modules fraîche pour isoler les états.
let networkStore: typeof import('@/lib/stores/network-store')

beforeEach(async () => {
  vi.resetModules()
  listeners.length = 0
  getStatusMock.mockReset()
  removeMock.mockReset()
  networkStore = await import('@/lib/stores/network-store')
})

describe('initNetworkWatcher', () => {
  it('hydrate le store depuis le getStatus initial (connecté)', async () => {
    getStatusMock.mockResolvedValue({ connected: true, connectionType: 'wifi' })

    const cleanup = networkStore.initNetworkWatcher()
    await vi.waitFor(() => {
      expect(networkStore.useNetworkStore.getState().hydrated).toBe(true)
    })

    expect(networkStore.useNetworkStore.getState().connected).toBe(true)
    expect(networkStore.useNetworkStore.getState().connectionType).toBe('wifi')
    cleanup()
  })

  it('hydrate le store depuis le getStatus initial (hors ligne)', async () => {
    getStatusMock.mockResolvedValue({ connected: false, connectionType: 'none' })

    const cleanup = networkStore.initNetworkWatcher()
    await vi.waitFor(() => {
      expect(networkStore.useNetworkStore.getState().hydrated).toBe(true)
    })

    expect(networkStore.useNetworkStore.getState().connected).toBe(false)
    expect(networkStore.useNetworkStore.getState().connectionType).toBe('none')
    cleanup()
  })

  it('avant hydratation, connected reste true (optimiste, pas de flash « Hors ligne »)', async () => {
    getStatusMock.mockReturnValue(new Promise(() => {})) // jamais résolu

    const cleanup = networkStore.initNetworkWatcher()
    expect(networkStore.useNetworkStore.getState().connected).toBe(true)
    expect(networkStore.useNetworkStore.getState().hydrated).toBe(false)
    cleanup()
  })

  it('échec du getStatus : hydraté quand même, optimisme connected:true conservé', async () => {
    getStatusMock.mockRejectedValue(new Error('plugin indisponible'))

    const cleanup = networkStore.initNetworkWatcher()
    await vi.waitFor(() => {
      expect(networkStore.useNetworkStore.getState().hydrated).toBe(true)
    })

    expect(networkStore.useNetworkStore.getState().connected).toBe(true)
    cleanup()
  })

  it('propage les événements networkStatusChange dans le store', async () => {
    getStatusMock.mockResolvedValue({ connected: true, connectionType: 'wifi' })

    const cleanup = networkStore.initNetworkWatcher()
    await vi.waitFor(() => {
      expect(networkStore.useNetworkStore.getState().hydrated).toBe(true)
    })
    expect(listeners).toHaveLength(1)

    listeners[0]({ connected: false, connectionType: 'none' })
    expect(networkStore.useNetworkStore.getState().connected).toBe(false)
    expect(networkStore.useNetworkStore.getState().connectionType).toBe('none')

    listeners[0]({ connected: true, connectionType: 'cellular' })
    expect(networkStore.useNetworkStore.getState().connected).toBe(true)
    expect(networkStore.useNetworkStore.getState().connectionType).toBe('cellular')
    cleanup()
  })

  it('est idempotent : un seul getStatus / listener natif, même cleanup renvoyé', async () => {
    getStatusMock.mockResolvedValue({ connected: true, connectionType: 'wifi' })

    const cleanup1 = networkStore.initNetworkWatcher()
    const cleanup2 = networkStore.initNetworkWatcher()

    expect(cleanup2).toBe(cleanup1)
    expect(getStatusMock).toHaveBeenCalledTimes(1)
    expect(listeners).toHaveLength(1)

    cleanup1()
  })

  it('le cleanup retire le listener natif et ré-arme le singleton', async () => {
    getStatusMock.mockResolvedValue({ connected: true, connectionType: 'wifi' })

    const cleanup = networkStore.initNetworkWatcher()
    cleanup()
    // handlePromise.then(...) est asynchrone : le remove() tombe au
    // microtask suivant.
    await vi.waitFor(() => {
      expect(removeMock).toHaveBeenCalledTimes(1)
    })

    // Après cleanup, un nouvel appel re-pose un watcher (simulateur de
    // remontage du provider, ex. StrictMode / re-navigation).
    listeners.length = 0
    const cleanup2 = networkStore.initNetworkWatcher()
    expect(getStatusMock).toHaveBeenCalledTimes(2)
    expect(listeners).toHaveLength(1)
    cleanup2()
  })
})

describe('classifyNetworkTransition', () => {
  const snap = (connected: boolean, hydrated: boolean) => ({ connected, hydrated })

  it.each([
    ['rien si rien ne change (hydraté)', snap(true, true), snap(true, true), 'none'],
    ['rien si rien ne change (hors ligne)', snap(false, true), snap(false, true), 'none'],
    ['rien tant que le statut suivant n\u2019est pas hydraté', snap(true, false), snap(true, true), 'none'],
    ['rien si ni l\u2019un ni l\u2019autre n\u2019est hydraté', snap(false, false), snap(false, false), 'none'],
    ['premier statut résolu en ligne → initial-connected', snap(true, true), snap(true, false), 'initial-connected'],
    ['premier statut résolu hors ligne → initial-offline', snap(false, true), snap(true, false), 'initial-offline'],
    ['reconnexion effective → went-online', snap(true, true), snap(false, true), 'went-online'],
    ['perte effective → went-offline', snap(false, true), snap(true, true), 'went-offline'],
  ] as const)('%s', (_name, next, prev, expected) => {
    expect(networkStore.classifyNetworkTransition(next, prev)).toBe(expected)
  })
})
