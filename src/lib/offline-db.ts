'use client'

/**
 * Supabase-strict mode does not persist business mutations locally.
 * Callers keep this small compatibility boundary so an offline action can
 * report a recoverable error instead of pretending that it was synchronized.
 */
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

export class SyncConflictError extends Error {
  readonly isSyncConflict = true
}

export type QueueResult = { ok: true } | { ok: false; error: string }

export async function queuePendingSync(..._args: unknown[]): Promise<QueueResult> {
  return { ok: false, error: 'Connexion Supabase requise pour enregistrer cette action' }
}

export async function getPendingSyncEntries(..._args: unknown[]): Promise<PendingSyncEntry[]> {
  return []
}

export async function markSynced(..._args: unknown[]): Promise<void> {}

export async function recordSyncConflict(..._args: unknown[]): Promise<void> {}

export async function getSyncConflicts(): Promise<SyncConflict[]> {
  return []
}

export function registerSyncHandler(..._args: unknown[]): void {}

export async function flushPendingSync(): Promise<{ sent: number; dropped: number; remaining: number }> {
  return { sent: 0, dropped: 0, remaining: 0 }
}

export async function flushAllPendingSync(): Promise<void> {}
