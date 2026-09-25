'use client'

/**
 * Local offline queue for business mutations that could not reach the
 * server (offline, flaky network, server hiccup).
 *
 * Storage is pluggable (MODE-1010, plan 30 j) behind the QueueStore
 * contract: entries are tiny JSON blobs (a sale, an expense, a product),
 * the queue is capped, and the DEFAULT adapter is IndexedDB since the
 * banc Chromium 20/20 (MODE-1010-ter, 25/09/2026 : enfilement/rejeu
 * offline réel, kill tab mid-write atomique, upgrade localStorage,
 * quota/repli) — with a TRANSPARENT hasIndexedDb() fallback to localStorage
 * (synchronous, race-free under the Web Locks layer MODE-1005) for old
 * webviews without IndexedDB. The BUILD flag JULABA_QUEUE_STORE=localstorage
 * restores the historical adapter at build time (rollback instantané).
 * Supabase stays the single source of truth: the queue only holds
 * *unacknowledged* writes, and every entry is dropped the moment the
 * server confirms it (markSynced), so a queue that survives a session is
 * always a list of writes Supabase has never seen.
 *
 * Replay semantics (see docs/OFFLINE.md):
 * - FIFO, in creation order, so dependent writes replay in the same order
 *   they were attempted live (e.g. a product before the sale that used it).
 * - A definitive server rejection (HTTP 4xx other than 408/429) becomes a
 *   SyncConflict: recorded locally + best-effort reported to
 *   /api/sync-conflicts/report, and the entry is dropped — retrying can
 *   never succeed.
 * - Transient failures (network error, 408/429, 5xx) keep the entry
 *   queued for the next flush.
 *
 * Each queued entity type has a handler registered by src/lib/sync-handlers.ts
 * (mounted once by the SyncFlusher component). The handler replays the exact
 * same request the original live attempt used, so both paths always agree
 * on shape.
 */

export interface PendingSyncEntry {
  id: number
  entity: string
  payload: unknown
  createdAt: number
  /** Stable domain key used to prevent replay under another account. */
  /** Optional only for legacy persisted/test entries; new writes always set it. */
  operationId?: string
  /** Merchant/actor scope. Legacy entries without it are never replayed. */
  ownerId?: string
}

export interface SyncConflict {
  id: string
  queueId: number
  entity: string
  payload: unknown
  message: string
  createdAt: number
}

/** Thrown by sync handlers when the server has definitively rejected the
 * write (4xx). flushPendingSync turns it into a recorded conflict and drops
 * the entry; any other error is treated as transient. */
export class SyncConflictError extends Error {
  readonly isSyncConflict = true
}

/** Session absente/expirée : le rejeu doit attendre un reclaim, jamais devenir un conflit définitif. */
export class SyncSessionError extends Error {
  readonly isSyncSessionError = true
}

export type QueueResult = { ok: true } | { ok: false; error: string }

const QUEUE_KEY = 'julaba-offline-queue-v1'
const CONFLICTS_KEY = 'julaba-offline-conflicts-v1'
// Keeps a long offline stretch from silently evicting fresh writes: the
// cap is generous (hundreds of sales), and eviction drops the OLDEST
// entries, which a flush has already had the most chances to send.
const MAX_QUEUE_LENGTH = 500
const MAX_CONFLICTS = 50

/** Module-level lock so two flushes (online transition + window focus
 * racing each other) never replay the same entry twice. */
let isFlushing = false
let activeOwnerId: string | null = null

export function setSyncOwnerId(ownerId: string | null): void {
  activeOwnerId = ownerId
}

function payloadString(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function operationIdFor(entity: string, payload: unknown): string {
  return payloadString(payload, ['operationId', 'operation_id', 'clientId', 'client_id', 'idempotencyKey', 'idempotency_key'])
    ?? `${entity}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded / private mode — the caller reports the write as lost
    // rather than pretending it was queued.
    return false
  }
}

// ------------------------------------------------------------------
// Adaptateurs de stockage de la file (MODE-1010, plan 30 j)
// ------------------------------------------------------------------

/**
 * CONTRAT de stockage de la file. La section critique (Web Locks,
 * MODE-1005) reste AU-DESSUS de ces méthodes — un adaptateur ne gère
 * JAMAIS lui-même la concurrence inter-onglets, et le payload d'une entrée
 * n'est jamais relu ni transformé (rejeu verbatim MODE-943 préservé).
 * Deux implémentations :
 * - localStorageStore : comportement historique (écriture synchrone) ;
 * - indexedDbStore : file durable pour files volumineuses, bascule via le
 *   flag de BUILD JULABA_QUEUE_STORE=indexeddb après banc device (WF7).
 */
export interface QueueStore {
  readonly name: 'localStorage' | 'indexeddb'
  readQueue(): Promise<PendingSyncEntry[]>
  /** Persiste la liste donnée comme file complète (false = stockage refuse). */
  writeQueue(entries: PendingSyncEntry[]): Promise<boolean>
  /** Retire UNE entrée par id (les retraits du flush sont ciblés, jamais écrasants). */
  removeById(id: number): Promise<void>
  /** Alias explicite de writeQueue pour les chemins de réécriture complète. */
  replaceAll(entries: PendingSyncEntry[]): Promise<boolean>
}

/** Adaptateur historique : localStorage (les helpers readJson/writeJson
 * portent déjà les gardes SSR/quota). */
export function localStorageStore(): QueueStore {
  return {
    name: 'localStorage',
    async readQueue() {
      const entries = readJson<PendingSyncEntry[]>(QUEUE_KEY, [])
      return Array.isArray(entries) ? entries : []
    },
    async writeQueue(entries) {
      return writeJson(QUEUE_KEY, entries)
    },
    async removeById(id) {
      const entries = readJson<PendingSyncEntry[]>(QUEUE_KEY, [])
      writeJson(QUEUE_KEY, (Array.isArray(entries) ? entries : []).filter((e) => e.id !== id))
    },
    async replaceAll(entries) {
      return writeJson(QUEUE_KEY, entries)
    },
  }
}

const QUEUE_DB_NAME = 'julaba-offline'
const QUEUE_DB_STORE = 'queue'
const QUEUE_DB_VERSION = 1

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

/** Ouvre la base file. À l'UPGRADE (création du store, version 1), la file
 * localStorage existante est importée DANS la transaction de création
 * (aucune opération perdue à la bascule ; rejeu verbatim — entrées stockées
 * telles quelles). `importedLegacy` permet à l'adaptateur de purger la clé
 * legacy APRÈS le commit (si l'ouverture échoue, la file localStorage
 * reste intacte et le prochain essai ré-importe — idempotent). */
function openQueueDb(): Promise<{ db: IDBDatabase; importedLegacy: boolean }> {
  return new Promise((resolve, reject) => {
    let importedLegacy = false
    const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (db.objectStoreNames.contains(QUEUE_DB_STORE)) return
      const store = db.createObjectStore(QUEUE_DB_STORE, { keyPath: 'id' })
      const legacy = readJson<PendingSyncEntry[]>(QUEUE_KEY, [])
      if (Array.isArray(legacy)) {
        for (const entry of legacy) {
          try {
            store.put(entry)
          } catch {
            // Entrée illisible : ignorée ici — le flush la classera en
            // conflit (chemin « entrée sans gestionnaire ») si elle réapparaît.
          }
        }
        importedLegacy = legacy.length > 0
      }
    }
    request.onsuccess = () => resolve({ db: request.result, importedLegacy })
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'))
    request.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'))
  })
}

/** Adaptateur IndexedDB : DB « julaba-offline », store « queue » keyPath
 * « id », version 1 (design MODE-1010). Les écritures remplacent la file
 * dans UNE transaction (clear+put, commit atomique) — la sémantique
 * readQueue→push→writeQueue de la section critique est préservée. */
export function indexedDbStore(): QueueStore {
  let dbPromise: Promise<IDBDatabase> | null = null
  let legacyPurged = false

  const open = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = openQueueDb()
        .then(({ db, importedLegacy }) => {
          if (importedLegacy && !legacyPurged) {
            // Purge de la clé legacy APRÈS le commit de la transaction de
            // création (onsuccess) — jamais avant (onerror la laisserait
            // partir sans copie).
            legacyPurged = true
            try {
              window.localStorage.removeItem(QUEUE_KEY)
            } catch {
              // Purge best-effort : une clé résiduelle est inoffensive
              // (l'adaptateur actif lit IndexedDB).
            }
          }
          return db
        })
        .catch((err) => {
          dbPromise = null // permet une nouvelle tentative au prochain appel
          throw err
        })
    }
    return dbPromise
  }

  function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB : échec de requête'))
    })
  }

  function transactionDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB : transaction abandonnée'))
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB : erreur de transaction'))
    })
  }

  async function persistAll(db: IDBDatabase, entries: PendingSyncEntry[]): Promise<boolean> {
    const tx = db.transaction(QUEUE_DB_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_DB_STORE)
    store.clear()
    for (const entry of entries) {
      store.put(entry)
    }
    try {
      await transactionDone(tx)
      return true
    } catch {
      // Quota/erreur d'écriture : même contrat que localStorage (l'appelant
      // rapporte l'écriture comme perdue plutôt que de mentir).
      return false
    }
  }

  return {
    name: 'indexeddb',
    async readQueue() {
      const db = await open()
      const tx = db.transaction(QUEUE_DB_STORE, 'readonly')
      const entries = await requestToPromise(
        tx.objectStore(QUEUE_DB_STORE).getAll() as IDBRequest<PendingSyncEntry[]>
      )
      // getAll() retourne par ordre de clé primaire (id monotone) → FIFO.
      return Array.isArray(entries) ? entries : []
    },
    async writeQueue(entries) {
      return persistAll(await open(), entries)
    },
    async removeById(id) {
      const db = await open()
      const tx = db.transaction(QUEUE_DB_STORE, 'readwrite')
      tx.objectStore(QUEUE_DB_STORE).delete(id)
      await transactionDone(tx).catch(() => {
        // Un retrait raté est sans danger : l'entrée resterait dans la file
        // et serait retirée au prochain flush (id identique).
      })
    },
    async replaceAll(entries) {
      return persistAll(await open(), entries)
    },
  }
}

/** Résout l'adaptateur actif. Le flag JULABA_QUEUE_STORE est une constante
 * de BUILD (next.config env) : 'indexeddb' par défaut DEPUIS le banc
 * Chromium 20/20 (MODE-1010-ter — les 4 étapes du design MODE-1010 sont
 * vertes : enfilement/rejeu offline réel, kill tab mid-write atomique,
 * upgrade avec file préexistante, quota). Rollback = JULABA_QUEUE_STORE=
 * localstorage à la build (adaptateur historique). Repli transparent sur
 * localStorage si IndexedDB est absente (webview ancienne, tests node). */
export function resolveQueueStore(): QueueStore {
  const flag = (process.env.JULABA_QUEUE_STORE ?? 'indexeddb').toLowerCase()
  if (flag === 'indexeddb' && hasIndexedDb()) return indexedDbStore()
  return localStorageStore()
}

// ------------------------------------------------------------------
// Background sync (MODE-1011, plan 30 j)
// ------------------------------------------------------------------

/** Tag unique des événements sync/periodicsync (voir public/sw.js). */
export const BACKGROUND_SYNC_TAG = 'julaba-flush'

/** Enregistrement best-effort d'un événement background sync : au retour
 * du réseau, le service worker réveillera les clients ouverts pour
 * déclencher le flusher EXISTANT (aucun rejeu dans le SW — le contrat de
 * rejeu reste dans sync-handlers.ts, sérialisé par les Web Locks ci-dessus).
 * Silencieux partout où l'API n'existe pas (natif Capacitor, webview
 * ancienne, tests) : le flusher classique (online/focus/visibility) reste
 * le chemin principal. */
export async function registerBackgroundSync(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
    // Type local : SyncManager n'est pas exposé par la lib DOM du projet
    // (miroir de l'extension periodicSync dans capacitor-provider).
    interface SyncManagerLike {
      register(tag: string): Promise<void>
    }
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: SyncManagerLike
    }
    if (!registration.sync) return false
    await registration.sync.register(BACKGROUND_SYNC_TAG)
    return true
  } catch {
    return false
  }
}

/** MODE-1005 (AUDIT-012 P2) — verrou inter-onglets sur la clé file.
 * Web Locks API quand elle existe (WebView Capacitor, navigateurs modernes) ;
 * repli transparent = exécution directe (comportement historique) quand
 * l'API est absente (vieux navigateurs, happy-dom/vitest). Le verrou ne
 * fait que sérialiser : il ne change aucune sémantique de la file. */
const QUEUE_LOCK_NAME = 'julaba-offline-queue'

type LockManagerLike = {
  request<R>(name: string, callback: () => R | Promise<R>): Promise<R>
}

function queueLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null
  const candidate = (navigator as Navigator & { locks?: unknown }).locks
  if (!candidate || typeof (candidate as LockManagerLike).request !== 'function') return null
  return candidate as LockManagerLike
}

async function withQueueLock<T>(critical: () => T): Promise<T> {
  const locks = queueLockManager()
  if (!locks) return critical()
  return locks.request(QUEUE_LOCK_NAME, () => critical())
}

/** Monotonic-enough id: createdAt ms plus a per-ms counter so two entries
 * created in the same millisecond keep both a unique id and FIFO order. */
let lastIdMs = 0
function nextEntryId(): number {
  const now = Date.now()
  lastIdMs = now > lastIdMs ? now : lastIdMs + 1
  return lastIdMs
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function queuePendingSync(entity: string, payload: unknown): Promise<QueueResult> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Stockage local indisponible' }
  }
  const entry: PendingSyncEntry = {
    id: nextEntryId(),
    entity,
    payload,
    createdAt: Date.now(),
    operationId: operationIdFor(entity, payload),
    ownerId: payloadString(payload, ['ownerId', 'owner_id', 'merchantId', 'merchant_id']) ?? activeOwnerId ?? undefined,
  }
  // MODE-1005 (AUDIT-012 P2) — COURSE INTER-ONGLETS : deux onglets du même
  // navigateur partagent le même localStorage. Le bloc readQueue → push →
  // writeQueue est atomique DANS un onglet (synchrone, jamais entrecoupé
  // d'await) mais peut être entrelacé par l'AUTRE onglet (thread distinct,
  // préemption à tout instant) → l'écriture de l'un écrase l'enfilement de
  // l'autre (opération perdue sans trace). La Web Locks API (disponible
  // dans les WebView Capacitor et navigateurs modernes, contexte sécurisé)
  // sérialise la section critique ; repli = comportement historique quand
  // l'API est absente (vieux navigateurs, environnements de test). Les
  // notifications d'éviction et conflits, elles, ne touchent pas la clé
  // file — elles restent fire-and-forget DANS la section, sans en sortir.
  // NB : les retraits de flush (markSynced) relisent déjà la file à frais
  // et filtrent PAR ID — ils n'écrasent jamais un enfilement concurrent ;
  // un double-envoi inter-onglets du même entry est absorbé par
  // l'idempotence serveur (clé Idempotency-Key propagée).
  return withQueueLock(async () => {
    const store = resolveQueueStore()
    const queue = await store.readQueue()
    queue.push(entry)
    // MODE-939 (AUDIT-003 F-12) — FIN DE L'ÉVICTION SILENCIEUSE : quand le
    // plafond est dépassé, les entrées les plus vieilles sont toujours
    // retirées (garde-fou localStorage), mais CHACUNE est journalisée comme
    // conflit (trace locale durable + miroir serveur best-effort) et
    // l'utilisateur reçoit une notification parlée/écrite. Une panne longue
    // ne fait plus disparaître des opérations sans trace ni mot.
    const overflow = queue.length - MAX_QUEUE_LENGTH
    if (overflow > 0) {
      const evicted = queue.slice(0, overflow)
      for (const e of evicted) {
        void recordSyncConflict({
          queueId: e.id,
          entity: e.entity,
          payload: e.payload,
          message: `Éviction de la file hors ligne (plafond ${MAX_QUEUE_LENGTH} atteint) — opération jamais envoyée, à vérifier/resaisir après reconnexion.`,
          createdAt: e.createdAt,
        }).catch(() => {
          // Best-effort : la trace locale (écrite dans recordSyncConflict)
          // est déjà en place ; l'échec du miroir serveur est normal offline.
        })
      }
      void (async () => {
        try {
          const [{ notify }, { queueEvictedInput }] = await Promise.all([
            import('@/lib/notifications/triggers'),
            import('@/lib/notifications/events'),
          ])
          await notify(queueEvictedInput({ count: overflow, cap: MAX_QUEUE_LENGTH }))
        } catch {
          // Notification impossible (SSR/test) : la trace conflit suffit.
        }
      })()
    }
    const trimmed = queue.slice(-MAX_QUEUE_LENGTH)
    if (!(await store.writeQueue(trimmed))) {
      return { ok: false, error: 'Stockage local indisponible' }
    }
    // Notify any open listener (SyncFlusher) that flushable work appeared.
    window.dispatchEvent(new CustomEvent('julaba-offline-queue-changed'))
    // MODE-1011 — background sync : demande au SW un événement 'sync' au
    // retour du réseau. JAMAIS attendu (l'enfilement ne doit pas dépendre
    // du SW — absent en natif Capacitor, en tests, webviews anciennes) et
    // JAMAIS une condition de succès : silencieux sinon.
    void registerBackgroundSync()
    return { ok: true }
  })
}

export async function getPendingSyncEntries(): Promise<PendingSyncEntry[]> {
  return resolveQueueStore().readQueue()
}

/** Retrait ciblé par id : ne réécrit jamais une liste relue à un autre
 * instant (aucun enfilement concurrent ne peut être écrasé — MODE-1005). */
export async function markSynced(id: number): Promise<void> {
  await resolveQueueStore().removeById(id)
}

export async function recordSyncConflict(
  conflict: Omit<SyncConflict, 'id' | 'createdAt'> & { createdAt?: number }
): Promise<void> {
  const full: SyncConflict = {
    id: randomId(),
    queueId: conflict.queueId,
    entity: conflict.entity,
    payload: conflict.payload,
    message: conflict.message,
    createdAt: conflict.createdAt ?? Date.now(),
  }
  const conflicts = readJson<SyncConflict[]>(CONFLICTS_KEY, [])
  conflicts.unshift(full)
  writeJson(CONFLICTS_KEY, conflicts.slice(0, MAX_CONFLICTS))

  // Best-effort server mirror so the backoffice sees definitive rejections
  // too (see /api/sync-conflicts/report). Fails silently while offline —
  // the conflict is already durably local.
  try {
    await fetch('/api/sync-conflicts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: full.entity,
        payload: full.payload,
        operationId: payloadString(full.payload, ['operationId', 'operation_id', 'clientId', 'client_id', 'idempotencyKey', 'idempotency_key']),
        message: full.message,
        clientCreatedAt: full.createdAt,
      }),
    })
  } catch {
    // Offline or server unreachable — local record is enough for now.
  }
}

export async function getSyncConflicts(): Promise<SyncConflict[]> {
  const conflicts = readJson<SyncConflict[]>(CONFLICTS_KEY, [])
  return Array.isArray(conflicts) ? conflicts : []
}

// ------------------------------------------------------------------
// Handler registry + flush
// ------------------------------------------------------------------

export type SyncHandler = (payload: unknown) => Promise<void>

const handlers = new Map<string, SyncHandler>()

export function registerSyncHandler(entity: string, handler: SyncHandler): void {
  handlers.set(entity, handler)
}

export interface FlushResult {
  sent: number
  dropped: number
  remaining: number
  /** La file est suspendue car la session doit être réclamée/renouvelée. */
  authRequired: boolean
}

/** Replays queued writes in FIFO order. Safe to call concurrently — a
 * second call while one is in flight is a no-op (it does not double-send,
 * and it reports the current queue length as `remaining`). */
export async function flushPendingSync(): Promise<FlushResult> {
  if (typeof window === 'undefined') {
    return { sent: 0, dropped: 0, remaining: 0, authRequired: false }
  }
  if (isFlushing) {
    return { sent: 0, dropped: 0, remaining: (await resolveQueueStore().readQueue()).length, authRequired: false }
  }
  isFlushing = true
  try {
    let sent = 0
    let dropped = 0
    let authRequired = false
    for (const entry of await resolveQueueStore().readQueue()) {
      if (!activeOwnerId || !entry.ownerId || entry.ownerId !== activeOwnerId) {
        await recordSyncConflict({
          queueId: entry.id,
          entity: entry.entity,
          payload: entry.payload,
          message: !entry.ownerId
            ? 'Mutation offline sans propriétaire : rejeu bloqué par sécurité.'
            : 'Mutation offline appartenant à un autre compte : rejeu bloqué.',
          createdAt: entry.createdAt,
        })
        await markSynced(entry.id)
        dropped++
        continue
      }
      const handler = handlers.get(entry.entity)
      if (!handler) {
        // No handler for this entity — typically a queue entry written by
        // a newer/older app version with a different entity registry. It
        // can never be replayed, so record it as a conflict instead of
        // leaving it stuck in the queue forever.
        await recordSyncConflict({
          queueId: entry.id,
          entity: entry.entity,
          payload: entry.payload,
          message: 'Aucun gestionnaire de synchronisation pour cette donnée',
          createdAt: entry.createdAt,
        })
        await markSynced(entry.id)
        dropped++
        continue
      }
      try {
        await handler(entry.payload)
        await markSynced(entry.id)
        sent++
      } catch (err) {
        if (err instanceof SyncConflictError) {
          await recordSyncConflict({
            queueId: entry.id,
            entity: entry.entity,
            payload: entry.payload,
            message: err.message,
            createdAt: entry.createdAt,
          })
          await markSynced(entry.id)
          dropped++
        }
        // Transient failure (network, 408/429, 5xx): keep the entry queued
        // and move on — an independent write later in the queue may still
        // be sendable even if this one is not.
      }
    }
    // MODE-1004 : le statut de suspension session (401/403, amont c3378bc)
    // est propagé aussi sur cette sortie de flush — AVANT, ce return oubliait
    // `authRequired` (erreur tsc héritée de la passe sync amont, jamais
    // rejouée — cf. REVIEW_LOG « aucun gate exécuté »).
    return { sent, dropped, remaining: (await resolveQueueStore().readQueue()).length, authRequired }
  } finally {
    isFlushing = false
  }
}

/** Flushes until the queue is empty or no progress is possible (entries
 * failing transiently stay queued; the loop stops as soon as a full pass
 * sends nothing, so a dead network costs at most one pass per trigger). */
export async function flushAllPendingSync(): Promise<FlushResult> {
  let last: FlushResult = { sent: 0, dropped: 0, remaining: (await resolveQueueStore().readQueue()).length, authRequired: false }
  for (let pass = 0; pass < 3; pass++) {
    last = await flushPendingSync()
    if (last.remaining === 0 || last.authRequired || (last.sent === 0 && last.dropped === 0)) {
      return last
    }
  }
  return last
}
