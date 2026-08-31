'use client'

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

const DB_NAME = 'julaba'
const WEB_QUEUE_KEY = 'julaba-offline-queue'
const WEB_CONFLICT_KEY = 'julaba-offline-conflicts'

let connectionPromise: Promise<SQLiteDBConnection> | null = null

/**
 * One-time setup for the web platform: @capacitor-community/sqlite needs the
 * `jeep-sqlite` custom element mounted in the DOM and its web store
 * initialized before any connection can be opened. No-op on native
 * (Android/iOS use the real SQLite engine directly, never reaching this
 * function's body at all).
 *
 * The jeep-sqlite web fallback is intentionally NOT attempted here: its
 * bundled WASM glue (frozen at publish time) doesn't link against the
 * sql.js .wasm binary its own declared dependency range resolves to today
 * — "Import #34 ... function import requires a callable", a real
 * WebAssembly.instantiate() ABI mismatch between jeep-sqlite's internal
 * loader and whatever sql.js version npm installs. That failure happens
 * as a side effect of merely evaluating the `jeep-sqlite/loader` module
 * (inside its own unawaited internal promise chain), so no try/catch
 * around the import can contain it — it surfaces as a genuine uncaught
 * page error no matter how the caller awaits it. Skipping the import
 * entirely on non-native platforms is the only reliable way to avoid it
 * until jeep-sqlite ships a build that matches its own sql.js dependency.
 * This only affects browser-tab testing: the offline queue this backs
 * (pending_sync) is meant for the native app, which never touches this
 * path.
 */
function ensureWebStore(): Promise<void> {
  if (Capacitor.isNativePlatform()) return Promise.resolve()
  return Promise.reject(new Error('SQLite hors-ligne indisponible dans le navigateur (réservé aux builds natives).'))
}

/**
 * Local, offline-capable SQLite database shared by the app — the primitive
 * behind the "write locally with synced:false, flush when Network.getStatus()
 * reports connected" pattern for drafts (enrollment dossiers, sales) created
 * while offline. Opening is idempotent: repeated calls reuse the same
 * connection.
 */
export async function openAppDatabase(): Promise<SQLiteDBConnection> {
  if (connectionPromise) return connectionPromise

  connectionPromise = (async () => {
    try {
      await ensureWebStore()
      const sqlite = new SQLiteConnection(CapacitorSQLite)

      const isConn = (await sqlite.isConnection(DB_NAME, false)).result
      const db = isConn
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)

      await db.open()

      // Generic offline outbox: any feature can queue a mutation here while
      // offline (payload as JSON) and flush it once connectivity returns,
      // instead of every screen inventing its own local queue.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS pending_sync (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity TEXT NOT NULL,
          client_id TEXT,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0
        );
      `)

      // Definitively-rejected entries (see SyncConflictError) dropped out of
      // pending_sync land here instead of vanishing, so there's a record of
      // what never made it and why — recordSyncConflict/getSyncConflicts
      // below assumed this table already existed; it never did on native.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          queue_id INTEGER NOT NULL,
          entity TEXT NOT NULL,
          payload TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `)

      return db
    } catch (err) {
      connectionPromise = null
      throw err
    }
  })()

  return connectionPromise
}

export interface PendingSyncEntry {
  id: number
  entity: string
  payload: unknown
  createdAt: number
}

export interface SyncConflict {
  id: string
  queueId: number
  entity: string
  payload: unknown
  message: string
  createdAt: number
}

/**
 * Thrown by a sync handler to mean "the server has definitively rejected
 * this — a 400/404/422, not a dropped connection or a 5xx — so retrying it
 * unchanged will never succeed." Distinct from a plain Error (network
 * failure, 5xx, or anything else transient), which stays queued and is
 * retried on the next reconnect. Kept separate from any single entity's
 * queue-position so one permanently-bad entry (e.g. a restock queued for a
 * product that was deleted before it could sync) doesn't block every
 * subsequent entry for that entity forever — see flushPendingSync below.
 */
export class SyncConflictError extends Error {
  readonly isSyncConflict = true
  constructor(message: string) {
    super(message)
    this.name = 'SyncConflictError'
  }
}

function isWebQueue(): boolean {
  return !Capacitor.isNativePlatform()
}

function readWebQueue(): PendingSyncEntry[] {
  try {
    const raw = localStorage.getItem(WEB_QUEUE_KEY)
    return raw ? JSON.parse(raw) as PendingSyncEntry[] : []
  } catch {
    return []
  }
}

function writeWebQueue(entries: PendingSyncEntry[]): void {
  try { localStorage.setItem(WEB_QUEUE_KEY, JSON.stringify(entries)) } catch (err) {
    console.warn('[offline-db] impossible de conserver la file web', err)
  }
}

function readWebConflicts(): SyncConflict[] {
  try {
    const raw = localStorage.getItem(WEB_CONFLICT_KEY)
    return raw ? JSON.parse(raw) as SyncConflict[] : []
  } catch {
    return []
  }
}

function writeWebConflicts(conflicts: SyncConflict[]): void {
  try { localStorage.setItem(WEB_CONFLICT_KEY, JSON.stringify(conflicts)) } catch { /* best effort */ }
}

export type QueueResult = { ok: true } | { ok: false; error: string }

/**
 * Queue a mutation for later sync (call this when Network.getStatus()
 * reports offline, or a live request itself failed). Returns an explicit
 * result instead of assuming success: if the local database itself can't be
 * opened (e.g. the web SQLite fallback failed to initialize, or native
 * storage is full/corrupted), the write is genuinely lost, and the caller
 * MUST check `ok` and tell the user rather than silently treating the
 * mutation as safely queued — see the audit finding this fixes (a lost
 * write used to look identical to a queued one from the caller's side).
 */
export async function queuePendingSync(entity: string, payload: unknown, clientId?: string): Promise<QueueResult> {
  try {
    if (isWebQueue()) {
      const entries = readWebQueue()
      entries.push({ id: Date.now(), entity, payload, createdAt: Date.now() })
      writeWebQueue(entries)
      return { ok: true }
    }
    const db = await openAppDatabase()
    await db.run(
      'INSERT INTO pending_sync (entity, client_id, payload, created_at, synced) VALUES (?, ?, ?, ?, 0)',
      [entity, clientId || null, JSON.stringify(payload), Date.now()]
    )
    return { ok: true }
  } catch (err) {
    console.warn(`[offline-db] could not queue ${entity} for offline sync`, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Stockage local indisponible' }
  }
}

/** All mutations still waiting to be synced, oldest first. Never throws. */
export async function getPendingSyncEntries(entity?: string): Promise<PendingSyncEntry[]> {
  try {
    if (isWebQueue()) {
      return readWebQueue()
        .filter((entry) => !entity || entry.entity === entity)
        .sort((a, b) => a.createdAt - b.createdAt)
    }
    const db = await openAppDatabase()
    const result = entity
      ? await db.query('SELECT * FROM pending_sync WHERE synced = 0 AND entity = ? ORDER BY created_at ASC', [entity])
      : await db.query('SELECT * FROM pending_sync WHERE synced = 0 ORDER BY created_at ASC')

    return (result.values || []).map((row) => ({
      id: row.id,
      entity: row.entity,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    }))
  } catch (err) {
    console.warn('[offline-db] could not read pending sync entries', err)
    return []
  }
}

/** Mark a queued mutation as synced once it has been successfully sent to the server. */
export async function markSynced(id: number): Promise<void> {
  if (isWebQueue()) {
    writeWebQueue(readWebQueue().filter((entry) => entry.id !== id))
    return
  }
  const db = await openAppDatabase()
  await db.run('UPDATE pending_sync SET synced = 1 WHERE id = ?', [id])
}

/**
 * Sends every queued entry for one entity to the server, oldest first,
 * marking each synced as it succeeds. A transient failure (network drop,
 * 5xx, anything the handler throws as a plain Error) stops processing this
 * entity right there — order matters (e.g. a product must exist before its
 * restock does), so skipping ahead could apply a later entry out of order.
 * A PermanentSyncError (the server definitively rejected this one — a
 * deleted target, bad data) is different: it can never succeed no matter
 * how many times it's retried, so it's dropped (marked synced, logged) and
 * the loop moves on — otherwise one bad entry would block every entry
 * behind it forever. Never throws — call this from a Network 'online'
 * transition.
 */
export async function flushPendingSync(
  entity: string,
  send: (payload: unknown) => Promise<void>
): Promise<{ sent: number; dropped: number; remaining: number }> {
  const entries = await getPendingSyncEntries(entity)
  let sent = 0
  let dropped = 0
  for (const entry of entries) {
    try {
      await send(entry.payload)
      await markSynced(entry.id)
      sent++
    } catch (err) {
      if (err instanceof SyncConflictError || (err as { isSyncConflict?: boolean })?.isSyncConflict) {
        // Definitive rejection (bad data, or the record this update targets
        // no longer exists) — retrying the exact same bytes will never
        // change that, so it's recorded for later review and dropped from
        // the queue instead of blocking every entry behind it forever.
        await recordSyncConflict(entry, err instanceof Error ? err.message : 'Conflit de synchronisation')
        await markSynced(entry.id)
        dropped++
        continue
      }
      console.warn(`[offline-db] flush of ${entity} #${entry.id} failed, will retry later`, err)
      break
    }
  }
  return { sent, dropped, remaining: entries.length - sent - dropped }
}

export async function recordSyncConflict(entry: PendingSyncEntry, message: string): Promise<void> {
  const conflict: SyncConflict = {
    id: `conflict-${entry.id}-${Date.now()}`,
    queueId: entry.id,
    entity: entry.entity,
    payload: entry.payload,
    message,
    createdAt: Date.now(),
  }
  if (isWebQueue()) {
    writeWebConflicts([...readWebConflicts(), conflict])
  } else {
    const db = await openAppDatabase()
    await db.run(
      'INSERT INTO sync_conflicts (id, queue_id, entity, payload, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [conflict.id, conflict.queueId, conflict.entity, JSON.stringify(conflict.payload), conflict.message, conflict.createdAt]
    )
  }

  // Best-effort mirror to the server (see /api/sync-conflicts/report) so an
  // admin can actually see this — a conflict logged only in this device's
  // local table was invisible to everyone but the device's own owner.
  // Never lets a reporting failure affect the local record above: this is
  // strictly additional visibility, not the source of truth.
  try {
    await fetch('/api/sync-conflicts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: conflict.entity,
        payload: conflict.payload,
        message: conflict.message,
        clientCreatedAt: conflict.createdAt,
      }),
    })
  } catch {
    // No device session yet, or offline — the local record above is what
    // matters; this is only a best-effort admin-visibility mirror.
  }
}

export async function getSyncConflicts(): Promise<SyncConflict[]> {
  if (isWebQueue()) return readWebConflicts().sort((a, b) => b.createdAt - a.createdAt)
  try {
    const db = await openAppDatabase()
    const result = await db.query('SELECT * FROM sync_conflicts ORDER BY created_at DESC')
    return (result.values || []).map((row) => ({
      id: row.id,
      queueId: row.queue_id,
      entity: row.entity,
      payload: JSON.parse(row.payload),
      message: row.message,
      createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

type SyncHandler = (payload: unknown) => Promise<void>
const syncHandlers = new Map<string, SyncHandler>()

/** Registers how to actually send a queued entity to the server. Call once per entity, e.g. at module load. */
export function registerSyncHandler(entity: string, send: SyncHandler): void {
  syncHandlers.set(entity, send)
}

/** Flushes every entity that has a registered handler. Safe to call any time (e.g. on every reconnect); no-ops if there's nothing queued. */
export async function flushAllPendingSync(): Promise<void> {
  for (const [entity, send] of syncHandlers) {
    await flushPendingSync(entity, send)
  }
}
