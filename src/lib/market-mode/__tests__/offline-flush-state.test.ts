import { describe, it, expect, vi, beforeEach } from 'vitest'

// MODE-904 (§34) — l'état « Synchronisation… » doit être observable par l'UI
// sans polluer la file : offline-db expose isSyncFlushInProgress(), vrai tant
// qu'un flush est en vol (y compris quand un handler échoue — finally).

/** Stockage en mémoire fidèle à l'API localStorage (vitest environment node). */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

const storage = fakeStorage()
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', {
  localStorage: storage,
  dispatchEvent: vi.fn(),
})
vi.stubGlobal('CustomEvent', class CustomEvent { constructor(public type: string) {} })
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }))) // miroir conflit best-effort

import { flushPendingSync, registerSyncHandler, isSyncFlushInProgress, queuePendingSync } from '@/lib/offline-db'

beforeEach(async () => {
  storage.clear()
})

describe('isSyncFlushInProgress (§34)', () => {
  it('faux hors flush', () => {
    expect(isSyncFlushInProgress()).toBe(false)
  })

  it('vrai pendant un flush en vol, faux après', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    registerSyncHandler('flush-state-test', async () => { await gate })
    await queuePendingSync('flush-state-test', { hello: 1 })

    const flushPromise = flushPendingSync()
    // Le handler est en vol : le flush est en cours.
    await Promise.resolve()
    await Promise.resolve()
    expect(isSyncFlushInProgress()).toBe(true)
    release()
    await flushPromise
    expect(isSyncFlushInProgress()).toBe(false)
  })

  it('retombé à faux même si le handler échoue (finally)', async () => {
    registerSyncHandler('flush-state-err', async () => { throw new Error('réseau coupé') })
    await queuePendingSync('flush-state-err', { hello: 2 })
    await flushPendingSync()
    expect(isSyncFlushInProgress()).toBe(false)
  })
})
