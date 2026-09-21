import { beforeEach, describe, expect, it, vi } from 'vitest'

// MODE-939 (AUDIT-003 F-12) — FIN de l'éviction silencieuse : quand la
// file offline dépasse son plafond, les entrées les plus vieilles sont
// retirées MAIS journalisées comme conflits (trace locale durable) et une
// notification utilisateur est émise. Une panne longue ne fait plus
// disparaître des opérations sans trace ni mot.
//
// L'environnement vitest est `node` (pas de localStorage) : on installe
// ici un localStorage en mémoire + un faux `window` — le strict minimum
// que offline-db exige (convention : ce test-ci teste la FILE, pas les
// handlers, contrairement aux autres suites qui mockent offline-db).

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
// offline-db passe par window.localStorage (et window.dispatchEvent).
vi.stubGlobal('window', { dispatchEvent: () => true, localStorage: localStorageMock })
// recordSyncConflict tente un miroir serveur best-effort : on neutralise
// fetch pour que le test reste hors réseau (l'échec est déjà attrapé).
vi.stubGlobal('fetch', vi.fn(async () => {
  throw new TypeError('fetch hors réseau (test)')
}))

import { getPendingSyncEntries, getSyncConflicts, queuePendingSync } from '../offline-db'

describe('queuePendingSync — éviction journalisée au-delà du plafond (MODE-939 F-12)', () => {
  beforeEach(() => {
    store.clear()
  })

  it(' retire les plus vieilles entrées au-delà du plafond et les journalise comme conflits d\u2019éviction', async () => {
    // MAX_QUEUE_LENGTH = 500 (constant du module). On pousse 502 entrées :
    // les 2 plus vieilles doivent sortir de la file ET laisser une trace.
    for (let i = 0; i < 502; i++) {
      const r = await queuePendingSync('sale', { clientId: `c-${i}`, merchantId: 'm1' })
      expect(r.ok).toBe(true)
    }

    const file = await getPendingSyncEntries()
    expect(file.length).toBe(500)

    const conflits = await getSyncConflicts()
    const evictions = conflits.filter((c) => c.message.includes('Éviction de la file hors ligne'))
    // Les 2 entrées les plus vieilles (c-0, c-1) : chacune a laissé une
    // trace parlée, jamais une disparition muette.
    expect(evictions.length).toBe(2)
    for (const c of evictions) {
      expect(c.entity).toBe('sale')
      const payload = c.payload as { clientId?: string }
      expect(['c-0', 'c-1']).toContain(payload.clientId)
      expect(c.message).toContain('jamais envoyée')
    }
    // La file gardée commence bien à la 3ᵉ entrée (rien d'autre n'a bougé).
    expect((file[0].payload as { clientId?: string }).clientId).toBe('c-2')
  })

  it(' ne journalise RIEN tant que le plafond n\u2019est pas atteint', async () => {
    for (let i = 0; i < 50; i++) {
      await queuePendingSync('expense', { clientId: `e-${i}`, merchantId: 'm1' })
    }
    expect((await getPendingSyncEntries()).length).toBe(50)
    const conflits = await getSyncConflicts()
    expect(conflits.filter((c) => c.message.includes('Éviction de la file hors ligne')).length).toBe(0)
  })
})
