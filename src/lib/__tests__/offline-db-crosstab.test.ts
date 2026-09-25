import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-1005 (AUDIT-012 P2) — COURSE INTER-ONGLETS sur la file offline :
// deux onglets du même navigateur partagent le même localStorage et le
// bloc readQueue → push → writeQueue de queuePendingSync peut être
// entrelacé par l'autre onglet (thread distinct) → enfilement écrasé,
// opération perdue sans trace. Le correctif sérialise la section critique
// avec la Web Locks API (repli = comportement historique sans l'API).
//
// Conventions identiques à offline-db-eviction.test.ts (environnement
// `node` : localStorage mémoire + faux window + fetch neutralisé).

const store = new Map<string, string>()

const localStorageMock = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size
  },
}

vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
vi.stubGlobal('fetch', vi.fn(async () => {
  throw new TypeError('fetch hors réseau (test)')
}))

import { getPendingSyncEntries, queuePendingSync } from '../offline-db'

describe('queuePendingSync — verrou inter-onglets (MODE-1005, AUDIT-012 P2)', () => {
  beforeEach(() => {
    store.clear()
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch hors réseau (test)')
    }))
  })

  it('sans navigator.locks (repli) : enfilement inchangé, ok:true', async () => {
    // Node n'expose pas navigator.locks — l'absence de stub navigator
    // (ou un navigator sans locks) doit suivre le chemin historique.
    const r = await queuePendingSync('sale', { clientId: 'c-1', merchantId: 'm1' })
    expect(r.ok).toBe(true)
    const file = await getPendingSyncEntries()
    expect(file.length).toBe(1)
    expect(file[0]?.entity).toBe('sale')
  })

  it('avec navigator.locks : la section critique passe par le verrou « julaba-offline-queue »', async () => {
    const requestMock = vi.fn(
      (_name: string, cb: () => { ok: boolean }) => Promise.resolve(cb())
    )
    vi.stubGlobal('navigator', { locks: { request: requestMock } })

    const r = await queuePendingSync('sale', { clientId: 'c-lock', merchantId: 'm1' })
    expect(r.ok).toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock).toHaveBeenCalledWith('julaba-offline-queue', expect.any(Function))

    // L'entrée est bien dans la file APRÈS le passage du verrou.
    const file = await getPendingSyncEntries()
    expect(file.length).toBe(1)
    expect(file[0]?.payload).toEqual({ clientId: 'c-lock', merchantId: 'm1' })
  })

  it('avec navigator.locks : deux enfilements concurrents sont sérialisés par le verrou', async () => {
    // Verrou RÉELLEMENT sérialisant : chaque callback attend la fin du
    // précédent (chaîne de promesses) — simule l'entrelacement inter-onglets
    // que la séquence synchrone intra-onglet ne laisse pas voir.
    let chain: Promise<unknown> = Promise.resolve()
    const requestMock = vi.fn((_name: string, cb: () => Promise<{ ok: boolean }>) => {
      const run = chain.then(cb)
      chain = run.catch(() => undefined)
      return run
    })
    vi.stubGlobal('navigator', { locks: { request: requestMock } })

    const [a, b] = await Promise.all([
      queuePendingSync('sale', { clientId: 'c-A', merchantId: 'm1' }),
      queuePendingSync('sale', { clientId: 'c-B', merchantId: 'm1' }),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(2)

    // AUCUNE des deux écritures n'a écrasé l'autre.
    const file = await getPendingSyncEntries()
    expect(file.map((e) => (e.payload as { clientId?: string }).clientId).sort())
      .toEqual(['c-A', 'c-B'])
  })
})
