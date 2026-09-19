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

  // ── Stock offline (STK-808, §2.8) ──────────────────────────────────
  // Chaque opération stock portée par la file embarque son operation_id
  // (UUID déterministe dérivé du clientId côté route, via operationUuid)
  // : rejouer la même entrée = le serveur re-reconnaît l'opération déjà
  // enregistrée, JAMAIS un double mouvement (idempotence RPC §31-32).
  // Un 422 (stock insuffisant/produit absent) est un rejet définitif →
  // SyncConflictError → conflit signalé, jamais de retry en boucle.
  registerSyncHandler('stock-movement', (payload) =>
    jsonRequest('/api/marchand/stock/movements', 'POST', payload)
  )

  registerSyncHandler('stock-count', (payload) =>
    jsonRequest('/api/marchand/stock/count', 'POST', payload)
  )

  registerSyncHandler('stock-purchase', (payload) =>
    jsonRequest('/api/marchand/purchases', 'POST', payload)
  )

  // STK-809 — transferts inter-marchands (§28) : envoi + action
  // (réception chez le destinataire / annulation chez l'expéditeur).
  // L'envoi porte son clientId (→ operation_id déterministe) ; la
  // réception est naturellement idempotente côté RPC (statut). Le rejet
  // 422 (stock insuffisant à l'envoi, transfert déjà clôturé) est un
  // conflit définitif — jamais de boucle.
  registerSyncHandler('stock-transfer', (payload) =>
    jsonRequest('/api/marchand/stock/transfers', 'POST', payload)
  )

  registerSyncHandler('stock-transfer-action', (payload) =>
    jsonRequest('/api/marchand/stock/transfers', 'PATCH', payload)
  )

  // STK-809 — réception d'une commande fournisseur : même contrat que la
  // voie en ligne (PATCH {action:'recevoir'}) ; 409 (déjà livrée/annulée)
  // et 422 (produit absent du stock) = conflits définitifs.
  registerSyncHandler('stock-reception', (payload) => {
    const { id, ...rest } = payload as { id: string } & Record<string, unknown>
    return jsonRequest(`/api/marchand/supplier-orders?id=${encodeURIComponent(id)}`, 'PATCH', rest)
  })

  // MODE-902 (§7-8) — session de journée marché : upsert idempotent par
  // client_id (le rejeu offline rejoue le MÊME payload). Un 4xx = conflit
  // définitif via jsonRequest (comportement standard, jamais de boucle).
  registerSyncHandler('market-session', (payload) =>
    jsonRequest('/api/marchand/market-sessions', 'POST', payload)
  )

  // MODE-906 (§21-22) — crédits clients. Deux entités, rejeu verbatim
  // (même URL/méthode que le live) :
  //  • 'merchant-partner' → upsert idempotent par client_id (le partenaire
  //    est créé AVANT l'op qui le référence — l'ordre FIFO de la file
  //    garantit que le partenaire part en premier) ;
  //  • 'credit-op' → op du grand livre (kind credit/repayment), idempotence
  //    sur operation_id ; un 422 REPAYMENT_EXCEEDS_DEBT est un rejet
  //    définitif → conflit signalé, jamais de boucle.
  registerSyncHandler('merchant-partner', (payload) =>
    jsonRequest('/api/marchand/partners', 'POST', payload)
  )

  registerSyncHandler('credit-op', (payload) =>
    jsonRequest('/api/marchand/credit-ops', 'POST', payload)
  )

  // MODE-908 (§18) — points de vente : upsert idempotent par client_id (le
  // rejeu offline rejoue le MÊME payload ; rename/archive voyagent par le
  // même client_id → UPDATE côté route). La file part AVANT la vente qui
  // référence le point (FIFO) : au rejeu, le point existe déjà côté serveur
  // quand la vente arrive et l'étiquette peut être résolue.
  registerSyncHandler('selling-point', (payload) =>
    jsonRequest('/api/marchand/selling-points', 'POST', payload)
  )
}
