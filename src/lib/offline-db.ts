'use client'

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

const DB_NAME = 'julaba'

let connectionPromise: Promise<SQLiteDBConnection> | null = null
let webStoreReady: Promise<void> | null = null

/**
 * One-time setup for the web platform: @capacitor-community/sqlite needs the
 * `jeep-sqlite` custom element mounted in the DOM and its web store
 * initialized before any connection can be opened. No-op on native
 * (Android/iOS use the real SQLite engine directly).
 */
async function ensureWebStore(): Promise<void> {
  if (Capacitor.isNativePlatform()) return
  if (webStoreReady) return webStoreReady

  webStoreReady = (async () => {
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    await defineCustomElements(window)
    if (!document.querySelector('jeep-sqlite')) {
      const jeepEl = document.createElement('jeep-sqlite')
      document.body.appendChild(jeepEl)
      await customElements.whenDefined('jeep-sqlite')
    }
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    await sqlite.initWebStore()
  })()

  return webStoreReady
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
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );
    `)

    return db
  })()

  return connectionPromise
}

export interface PendingSyncEntry {
  id: number
  entity: string
  payload: unknown
  createdAt: number
}

/** Queue a mutation for later sync (call this when Network.getStatus() reports offline). */
export async function queuePendingSync(entity: string, payload: unknown): Promise<void> {
  const db = await openAppDatabase()
  await db.run(
    'INSERT INTO pending_sync (entity, payload, created_at, synced) VALUES (?, ?, ?, 0)',
    [entity, JSON.stringify(payload), Date.now()]
  )
}

/** All mutations still waiting to be synced, oldest first. */
export async function getPendingSyncEntries(entity?: string): Promise<PendingSyncEntry[]> {
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
}

/** Mark a queued mutation as synced once it has been successfully sent to the server. */
export async function markSynced(id: number): Promise<void> {
  const db = await openAppDatabase()
  await db.run('UPDATE pending_sync SET synced = 1 WHERE id = ?', [id])
}

/**
 * Sends every queued entry for one entity to the server, oldest first,
 * marking each synced as it succeeds. Stops at the first failure for that
 * entity (so a still-offline connection doesn't burn through retries out of
 * order) but still returns how many got through, and never throws — call
 * this from a Network 'online' transition.
 */
export async function flushPendingSync(
  entity: string,
  send: (payload: unknown) => Promise<void>
): Promise<{ sent: number; remaining: number }> {
  const entries = await getPendingSyncEntries(entity)
  let sent = 0
  for (const entry of entries) {
    try {
      await send(entry.payload)
      await markSynced(entry.id)
      sent++
    } catch (err) {
      console.warn(`[offline-db] flush of ${entity} #${entry.id} failed, will retry later`, err)
      break
    }
  }
  return { sent, remaining: entries.length - sent }
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
