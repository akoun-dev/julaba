import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// MODE-1010 (plan 30 j) — adaptateurs de stockage de la file offline.
// Le contrat QueueStore (readQueue/writeQueue/removeById/replaceAll) est
// AU-DESSUS de la section critique Web Locks (MODE-1005) : aucun test ici
// ne change la sémantique du rejeu (verbatim MODE-943) — on vérifie que
// les ENTRÉES traversent les adaptateurs à l'identique.
//
// Conventions offline-db-*.test.ts : environnement node, localStorage
// mémoire, faux window, fetch neutralisé. fake-indexeddb (devDep dédiée
// aux tests de l'adaptateur — jamais embarquée dans l'app) fournit une
// IndexedDB en mémoire : chaque test reçoit une fabrique NEUVE, comme un
// appareil vierge.

const QUEUE_KEY = 'julaba-offline-queue-v1'

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

function entry(id: number, clientId: string): PendingSyncEntry {
  return { id, entity: 'sale', payload: { clientId, merchantId: 'm1' }, createdAt: 1_700_000_000_000 + id, ownerId: 'm1' }
}

vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
vi.stubGlobal('fetch', vi.fn(async () => {
  throw new TypeError('fetch hors réseau (test)')
}))

import {
  BACKGROUND_SYNC_TAG,
  getPendingSyncEntries,
  indexedDbStore,
  localStorageStore,
  markSynced,
  queuePendingSync,
  registerBackgroundSync,
  resolveQueueStore,
  type PendingSyncEntry,
} from '../offline-db'

describe('resolveQueueStore — choix de l\u2019adaptateur (MODE-1010)', () => {
  beforeEach(() => {
    store.clear()
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch hors réseau (test)')
    }))
    vi.unstubAllEnvs()
    // Défaut = localStorage (comportement historique inchangé).
    vi.stubEnv('JULABA_QUEUE_STORE', '')
  })

  it('défaut (flag absent/vide) : localStorage, même si le test node n\u2019a pas d\u2019IndexedDB', () => {
    expect(resolveQueueStore().name).toBe('localStorage')
  })

  it('flag indexeddb mais IndexedDB absente (webview ancienne) : repli transparent localStorage', () => {
    vi.stubEnv('JULABA_QUEUE_STORE', 'indexeddb')
    // Pas d'indexedDB stubée ici — node n'en expose pas.
    expect(resolveQueueStore().name).toBe('localStorage')
  })

  it('flag indexeddb + IndexedDB présente : adaptateur indexeddb', () => {
    vi.stubEnv('JULABA_QUEUE_STORE', 'indexeddb')
    vi.stubGlobal('indexedDB', new IDBFactory())
    expect(resolveQueueStore().name).toBe('indexeddb')
  })
})

describe('localStorageStore — contrat QueueStore (comportement historique)', () => {
  beforeEach(() => {
    store.clear()
  })

  it('writeQueue puis readQueue restitue les entrées à l\u2019identique', async () => {
    const adapter = localStorageStore()
    const a = entry(1, 'a')
    const b = entry(2, 'b')
    expect(await adapter.writeQueue([a, b])).toBe(true)
    expect(await adapter.readQueue()).toEqual([a, b])
  })

  it('removeById retire UNE entrée ciblée', async () => {
    const adapter = localStorageStore()
    await adapter.writeQueue([entry(1, 'a'), entry(2, 'b'), entry(3, 'c')])
    await adapter.removeById(2)
    expect((await adapter.readQueue()).map((e) => e.id)).toEqual([1, 3])
  })

  it('replaceAll remplace toute la file', async () => {
    const adapter = localStorageStore()
    await adapter.writeQueue([entry(1, 'a')])
    await adapter.replaceAll([entry(9, 'z')])
    expect((await adapter.readQueue()).map((e) => e.id)).toEqual([9])
  })
})

describe('indexedDbStore — contrat QueueStore (MODE-1010)', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  it('writeQueue puis readQueue restitue les entrées dans l\u2019ordre FIFO (clé primaire)', async () => {
    const adapter = indexedDbStore()
    const a = entry(1, 'a')
    const b = entry(2, 'b')
    const c = entry(3, 'c')
    expect(await adapter.writeQueue([a, b, c])).toBe(true)
    expect(await adapter.readQueue()).toEqual([a, b, c])
  })

  it('removeById retire UNE entrée ciblée (retrait du flush)', async () => {
    const adapter = indexedDbStore()
    await adapter.writeQueue([entry(1, 'a'), entry(2, 'b'), entry(3, 'c')])
    await adapter.removeById(2)
    expect((await adapter.readQueue()).map((e) => e.id)).toEqual([1, 3])
  })

  it('replaceAll remplace toute la file (clear+put, transaction unique)', async () => {
    const adapter = indexedDbStore()
    await adapter.writeQueue([entry(1, 'a'), entry(2, 'b')])
    await adapter.replaceAll([entry(7, 'x')])
    expect((await adapter.readQueue()).map((e) => e.id)).toEqual([7])
  })

  it('UPGRADE : la file localStorage préexistante est importée, puis la clé legacy est purgée APRÈS commit', async () => {
    // File laissée par la session précédente (avant bascule du flag).
    store.set(QUEUE_KEY, JSON.stringify([entry(5, 'legacy-5'), entry(6, 'legacy-6')]))
    const adapter = indexedDbStore()
    const entries = await adapter.readQueue()
    expect(entries.map((e) => e.id)).toEqual([5, 6])
    expect((entries[0]?.payload as { clientId?: string }).clientId).toBe('legacy-5')
    // Purge legacy : la clé localStorage est retirée une fois l'import
    // commité — la source de vérité locale devient IndexedDB.
    expect(store.has(QUEUE_KEY)).toBe(false)
  })

  it('ouverture sans file préexistante : aucune purge (rien à importer)', async () => {
    const adapter = indexedDbStore()
    expect(await adapter.readQueue()).toEqual([])
    expect(store.has(QUEUE_KEY)).toBe(false)
  })
})

describe('file offline de bout en bout en mode indexeddb (flag JULABA_QUEUE_STORE)', () => {
  beforeEach(() => {
    store.clear()
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch hors réseau (test)')
    }))
    vi.unstubAllEnvs()
    vi.stubEnv('JULABA_QUEUE_STORE', 'indexeddb')
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  it('queuePendingSync persiste dans IndexedDB (PAS dans la clé localStorage) et markSynced retire l\u2019entrée', async () => {
    expect(await queuePendingSync('sale', { clientId: 'c-idb', merchantId: 'm1' })).toEqual({ ok: true })
    const file = await getPendingSyncEntries()
    expect(file).toHaveLength(1)
    expect((file[0]?.payload as { clientId?: string }).clientId).toBe('c-idb')
    // Preuve de l'adaptateur actif : la clé localStorage n'a jamais été écrite.
    expect(store.has(QUEUE_KEY)).toBe(false)
    await markSynced(file[0]!.id)
    expect(await getPendingSyncEntries()).toHaveLength(0)
  })

  it('deux enfilements consécutifs restent en FIFO (même ordre qu\u2019en localStorage)', async () => {
    await queuePendingSync('sale', { clientId: 'first', merchantId: 'm1' })
    await queuePendingSync('sale', { clientId: 'second', merchantId: 'm1' })
    const file = await getPendingSyncEntries()
    expect(file.map((e) => (e.payload as { clientId?: string }).clientId)).toEqual(['first', 'second'])
  })
})

describe('registerBackgroundSync (MODE-1011)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
  })

  it('enregistre le tag \u00ab julaba-flush \u00bb auprès du service worker quand l\u2019API existe', async () => {
    const syncRegister = vi.fn(async (_tag: string) => {})
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ sync: { register: syncRegister } }),
      },
    })
    await expect(registerBackgroundSync()).resolves.toBe(true)
    expect(syncRegister).toHaveBeenCalledWith(BACKGROUND_SYNC_TAG)
  })

  it('silencieux (false) sans service worker — natif Capacitor / tests', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registerBackgroundSync()).resolves.toBe(false)
  })

  it('silencieux (false) sans navigator du tout (SSR / node)', async () => {
    vi.stubGlobal('navigator', undefined)
    await expect(registerBackgroundSync()).resolves.toBe(false)
  })

  it('silencieux (false) si l\u2019enregistrement rejette (permission refusée, SW en échec)', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ sync: { register: vi.fn(async () => { throw new Error('NotAllowedError') }) } }),
      },
    })
    await expect(registerBackgroundSync()).resolves.toBe(false)
  })

  it('queuePendingSync déclenche l\u2019enregistrement sans jamais bloquer ni échouer dessus', async () => {
    vi.stubEnv('JULABA_QUEUE_STORE', '')
    const syncRegister = vi.fn(async (_tag: string) => {})
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ sync: { register: syncRegister } }),
      },
    })
    // L'enfilement ne doit NI attendre le SW, NI rapporter son échec.
    const result = await queuePendingSync('sale', { clientId: 'c-bg', merchantId: 'm1' })
    expect(result).toEqual({ ok: true })
    // Fire-and-forget : le tag finit par être posé.
    await vi.waitFor(() => {
      expect(syncRegister).toHaveBeenCalledWith('julaba-flush')
    })
  })
})
