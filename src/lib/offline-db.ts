'use client'

/**
 * Local offline queue for business mutations that could not reach the
 * server (offline, flaky network, server hiccup).
 *
 * Storage is localStorage — deliberately, not IndexedDB: entries are tiny
 * JSON blobs (a sale, an expense, a product), the queue is capped, and
 * localStorage is synchronous, which keeps `queuePendingSync` race-free
 * across the many concurrent call sites (caisse, voice modal, stores)
 * without a locking layer. Supabase stays the single source of truth: the
 * queue only holds *unacknowledged* writes, and every entry is dropped the
 * moment the server confirms it (markSynced), so a queue that survives a
 * session is always a list of writes Supabase has never seen.
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

function readQueue(): PendingSyncEntry[] {
  const entries = readJson<PendingSyncEntry[]>(QUEUE_KEY, [])
  return Array.isArray(entries) ? entries : []
}

function writeQueue(entries: PendingSyncEntry[]): boolean {
  return writeJson(QUEUE_KEY, entries)
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
  const queue = readQueue()
  queue.push(entry)
  const trimmed = queue.slice(-MAX_QUEUE_LENGTH)
  if (!writeQueue(trimmed)) {
    return { ok: false, error: 'Stockage local indisponible' }
  }
  // Notify any open listener (SyncFlusher) that flushable work appeared.
  window.dispatchEvent(new CustomEvent('julaba-offline-queue-changed'))
  return { ok: true }
}

export async function getPendingSyncEntries(): Promise<PendingSyncEntry[]> {
  return readQueue()
}

export async function markSynced(id: number): Promise<void> {
  writeQueue(readQueue().filter((e) => e.id !== id))
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
}

/** Replays queued writes in FIFO order. Safe to call concurrently — a
 * second call while one is in flight is a no-op (it does not double-send,
 * and it reports the current queue length as `remaining`). */
export async function flushPendingSync(): Promise<FlushResult> {
  if (typeof window === 'undefined') return { sent: 0, dropped: 0, remaining: 0 }
  if (isFlushing) {
    return { sent: 0, dropped: 0, remaining: readQueue().length }
  }
  isFlushing = true
  try {
    let sent = 0
    let dropped = 0
    for (const entry of readQueue()) {
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
    return { sent, dropped, remaining: readQueue().length }
  } finally {
    isFlushing = false
  }
}

/** Flushes until the queue is empty or no progress is possible (entries
 * failing transiently stay queued; the loop stops as soon as a full pass
 * sends nothing, so a dead network costs at most one pass per trigger). */
export async function flushAllPendingSync(): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    const { sent, dropped, remaining } = await flushPendingSync()
    if (remaining === 0 || (sent === 0 && dropped === 0)) return
  }
}
