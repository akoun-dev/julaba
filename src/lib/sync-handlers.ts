'use client'

import { registerSyncHandler, SyncConflictError } from '@/lib/offline-db'

/**
 * Replay handlers for the offline queue (src/lib/offline-db.ts), one per
 * queued entity — each one issues the exact same request the original
 * live attempt used (same URL, same method, same body shape), so the
 * online path and the replay path always agree. See docs/OFFLINE.md.
 *
 * Mount once via registerAllSyncHandlers() from the SyncFlusher component.
 * registerSyncHandler overwrites silently, and every module that imports
 * this file shares one registry, so double-mounting the component is
 * harmless.
 */

/** Statuses that mean "the server got the request but choked" — retrying
 * later is meaningful, unlike a plain 4xx. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function jsonRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  payload: unknown,
  opts?: { tolerate?: number[] }
): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Network-level failure — transient by definition.
    throw new Error('Réseau indisponible')
  }
  if (res.ok || (opts?.tolerate ?? []).includes(res.status)) return
  if (isTransientStatus(res.status)) {
    throw new Error(`Erreur serveur ${res.status} — réessai plus tard`)
  }
  // Definitive rejection (400/401/403/404/409/410/422...): retrying this
  // exact payload can never succeed, so surface a conflict and drop it.
  throw new SyncConflictError(`Rejet définitif du serveur (${res.status})`)
}

let registered = false

export function registerAllSyncHandlers(): void {
  if (registered) return
  registered = true

  // The claim is "done" when the server answers 200 (fresh claim) or 409
  // (device already bound — see /api/session/claim). 401/403 mean the
  // account is genuinely not claimable from this state → conflict.
  registerSyncHandler('device-claim', (payload) =>
    jsonRequest('/api/session/claim', 'POST', payload, { tolerate: [409] })
  )

  registerSyncHandler('sale', (payload) =>
    jsonRequest('/api/marchand/sales', 'POST', payload)
  )

  registerSyncHandler('expense', (payload) =>
    jsonRequest('/api/marchand/expenses', 'POST', payload)
  )

  registerSyncHandler('product', (payload) =>
    jsonRequest('/api/marchand/products', 'POST', payload)
  )

  registerSyncHandler('product-update', (payload) => {
    const { id, updates } = payload as { id: string; updates: Record<string, unknown> }
    return jsonRequest(`/api/marchand/products?id=${encodeURIComponent(id)}`, 'PATCH', updates)
  })

  // 404 tolerated to match the live path in auth-screen.tsx (the account
  // was registered locally-only and may not exist server-side yet).
  registerSyncHandler('merchant-update', (payload) =>
    jsonRequest('/api/merchant', 'PATCH', payload, { tolerate: [404] })
  )

  registerSyncHandler('tontine-contribution', (payload) =>
    jsonRequest('/api/marchand/tontines', 'POST', payload)
  )

  registerSyncHandler('supplier-order', (payload) =>
    jsonRequest('/api/marchand/supplier-orders', 'POST', payload)
  )

  registerSyncHandler('recolte-create', (payload) =>
    jsonRequest('/api/producteur/recoltes', 'POST', payload)
  )

  registerSyncHandler('recolte-update', (payload) =>
    jsonRequest('/api/producteur/recoltes', 'PATCH', payload)
  )

  registerSyncHandler('commande-update', (payload) =>
    jsonRequest('/api/producteur/commandes', 'PATCH', payload)
  )

  registerSyncHandler('journal', (payload) =>
    jsonRequest('/api/producteur/journal', 'POST', payload)
  )
}
