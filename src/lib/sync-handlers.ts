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
    // 200 = idempotent duplicate (already exists), treat as synced
    // 201 = newly created
    // Any other non-OK = transient failure, retry later
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  registerSyncHandler('expense', async (payload) => {
    const res = await fetch('/api/marchand/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  registerSyncHandler('product', async (payload) => {
    const res = await fetch('/api/marchand/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  // Identificateur dossiers — no merchantId dependency, safe to flush in any order.
  registerSyncHandler('enrolment', async (payload) => {
    const res = await fetch('/api/backoffice/enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    // 200 = idempotent duplicate (dossierId already exists)
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  // Producteur récoltes
  registerSyncHandler('recolte', async (payload) => {
    const res = await fetch('/api/producteur/recoltes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    // 200 = idempotent duplicate
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  // Producteur réponses aux commandes
  registerSyncHandler('commande-response', async (payload) => {
    const res = await fetch('/api/producteur/commandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })

  // Producteur confirmation de livraison
  registerSyncHandler('commande-livraison', async (payload) => {
    const res = await fetch('/api/producteur/commandes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && res.status !== 200) throw new Error(`Erreur ${res.status}`)
  })
}
