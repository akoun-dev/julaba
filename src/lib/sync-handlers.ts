import { registerSyncHandler, SyncConflictError } from '@/lib/offline-db'

/**
 * Registers, once per app load, how each offline-queued entity actually gets
 * sent to the server once connectivity returns. Kept separate from
 * offline-db.ts (which stays a generic queue with no knowledge of specific
 * API routes) and imported once from CapacitorProvider.
 *
 * Shared policy across every handler here: 200 means the server already had
 * this exact write (idempotent replay of a create whose response was lost —
 * every POST route below is keyed on a client-generated id, so a retried
 * flush is provably the same request, not a guess) — treat that as success.
 * 201/204 is a fresh success. A 400/404/422 is the server *rejecting* the
 * request outright — bad data, or the record this update targets no longer
 * exists — and retrying the exact same bytes will never change that, so it's
 * thrown as SyncConflictError (dropped from the queue, logged, the flush
 * moves on to the next entry). Anything else (network failure, 5xx) is a
 * plain Error — stays queued, retried on the next reconnect.
 */
function isPermanent(status: number): boolean {
  return status === 400 || status === 404 || status === 422
}

async function post(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 200 || res.ok) return
  if (isPermanent(res.status)) throw new SyncConflictError(`${url} → ${res.status}`)
  throw new Error(`${url} → ${res.status}`)
}

async function patch(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.ok) return
  if (isPermanent(res.status)) throw new SyncConflictError(`${url} → ${res.status}`)
  throw new Error(`${url} → ${res.status}`)
}

export function registerSyncHandlers(): void {
  // Registered first: every other handler below now requires a device
  // session (see device-session.ts) to write anything, so the claim has to
  // land before merchant/sale/expense/... are retried, or they'll all just
  // 401 again this flush and wait for the next one.
  registerSyncHandler('device-claim', (payload) => {
    const { subjectType, id } = payload as { subjectType: string; id: string }
    return post('/api/session/claim', { subjectType, id }).catch((err) => {
      // 409 = already claimed by a different device — not retryable, but
      // also not this device's failure to report.
      if (err instanceof Error && err.message.includes('409')) return
      throw err
    })
  })

  // Registered before 'sale'/'expense'/'product': flushAllPendingSync()
  // processes entities in registration order, and all three reference
  // merchantId as a foreign key — the merchant account must exist
  // server-side first.
  registerSyncHandler('merchant', (payload) => post('/api/merchant', payload).catch((err) => {
    // 409 = already registered under a different id — a genuine conflict,
    // not a transient failure, so don't keep retrying it either.
    if (err instanceof Error && err.message.includes('409')) return
    throw err
  }))

  // Registered after 'merchant': credential recovery queues a PATCH to
  // update pinHash/patternHash on the server — the merchant account must
  // exist first (same ordering rationale as merchant-before-sale).
  registerSyncHandler('merchant-update', (payload) => patch('/api/merchant', payload))

  registerSyncHandler('sale', (payload) => post('/api/marchand/sales', payload))
  registerSyncHandler('expense', (payload) => post('/api/marchand/expenses', payload))
  registerSyncHandler('product', (payload) => post('/api/marchand/products', payload))
  registerSyncHandler('tontine-contribution', (payload) => post('/api/marchand/tontines', payload))

  // Registered after 'product': a restock/edit queued for a product that
  // was itself created offline must reach the server after that product
  // does — same ordering rationale as merchant-before-sale.
  registerSyncHandler('product-update', (payload) => {
    const { id, updates } = payload as { id: string; updates: Record<string, unknown> }
    return patch(`/api/marchand/products?id=${id}`, updates)
  })

  // Identificateur dossiers — no merchantId dependency, safe to flush in any order.
  registerSyncHandler('enrolment', (payload) => post('/api/backoffice/enrolments', payload))

  // Producteur — récoltes, réponses aux commandes, carnet de champ. None of
  // these depend on a producteur record existing server-side first
  // (producteurId/cycleId aren't foreign keys), so registration order
  // relative to each other doesn't matter.
  registerSyncHandler('recolte-create', (payload) => post('/api/producteur/recoltes', payload))
  registerSyncHandler('recolte-update', (payload) => {
    const { id, ...updates } = payload as { id: string } & Record<string, unknown>
    return patch('/api/producteur/recoltes', { id, ...updates })
  })
  registerSyncHandler('commande-update', (payload) => patch('/api/producteur/commandes', payload))
  registerSyncHandler('journal', (payload) => post('/api/producteur/journal', payload))
}
