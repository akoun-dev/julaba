import { registerSyncHandler } from '@/lib/offline-db'

/**
 * Registers, once per app load, how each offline-queued entity actually gets
 * sent to the server once connectivity returns. Kept separate from
 * offline-db.ts (which stays a generic queue with no knowledge of specific
 * API routes) and imported once from CapacitorProvider.
 */
export function registerSyncHandlers(): void {
  // Registered before 'sale': flushAllPendingSync() processes entities in
  // registration order, and a sale references merchantId as a foreign key —
  // the merchant account must exist server-side first.
  registerSyncHandler('merchant', async (payload) => {
    const res = await fetch('/api/merchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    // 409 = already registered under a different id — a genuine conflict,
    // not a transient failure, so don't keep retrying it.
    if (!res.ok && res.status !== 409) throw new Error(`Erreur ${res.status}`)
  })

  registerSyncHandler('sale', async (payload) => {
    const res = await fetch('/api/marchand/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
  })
}
