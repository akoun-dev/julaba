// Background Runner entry point (@capacitor/background-runner).
//
// Runs in an isolated JS context on Android/iOS — no DOM, no access to the
// WebView's React state or Zustand stores. Uses CapacitorSQLite's native
// APIs to read pending_sync rows and flush them to the server.
//
// Configured in capacitor.config.ts: event "julabaSync", every 15 minutes
// while backgrounded, auto-start: true.
//
// Kept in sync BY HAND with the foreground registry in
// src/lib/sync-handlers.ts — same entity names, same endpoints, same
// retry/conflict semantics (see isPermanent below, mirroring that file's).
// A mismatch here means an entity queued offline can flush in the
// foreground but silently never sync in the background, or vice versa —
// this previously used a different, stale entity/endpoint table than the
// foreground one (recolte/commande-response/commande-livraison that no
// caller ever actually queues, and no device-claim/tontine-contribution/
// product-update/journal at all).
//
// Not verified against a real device/emulator in this environment — in
// particular whether the device-session cookie set by the WebView is
// actually available to this isolated context's fetch() calls is unproven
// here; every authenticated entity below (everything but device-claim
// itself) depends on it.

const DB_NAME = 'julaba'
const DB_VERSION = 1

const ENTITY_ENDPOINTS = {
  'device-claim':         { path: '/api/session/claim',        method: 'POST' },
  sale:                   { path: '/api/marchand/sales',       method: 'POST' },
  expense:                { path: '/api/marchand/expenses',    method: 'POST' },
  product:                { path: '/api/marchand/products',    method: 'POST' },
  'tontine-contribution': { path: '/api/marchand/tontines',    method: 'POST' },
  enrolment:              { path: '/api/backoffice/enrolments', method: 'POST' },
  'recolte-create':       { path: '/api/producteur/recoltes',  method: 'POST' },
  'recolte-update':       { path: '/api/producteur/recoltes',  method: 'PATCH' },
  'commande-update':      { path: '/api/producteur/commandes', method: 'PATCH' },
  journal:                { path: '/api/producteur/journal',   method: 'POST' },
}

// 400/404/422 = the server has definitively rejected this write (bad data,
// or the record it targets no longer exists) — retrying the exact same
// bytes will never change that. Must track sync-handlers.ts's isPermanent.
function isPermanent(status) {
  return status === 400 || status === 404 || status === 422
}

// product-update is the one entity whose queued payload doesn't go to the
// wire as-is: it wraps { id, updates } so id can be sent as a query param
// (see stock-store.ts and sync-handlers.ts's 'product-update' handler) —
// every other entity's payload is exactly its request body.
function requestFor(entity, payload) {
  if (entity === 'product-update') {
    return { path: `/api/marchand/products?id=${payload.id}`, method: 'PATCH', body: payload.updates }
  }
  const endpoint = ENTITY_ENDPOINTS[entity]
  if (!endpoint) return null
  return { path: endpoint.path, method: endpoint.method, body: payload }
}

addEventListener('julabaSync', async (resolve, reject) => {
  try {
    console.log('[background-runner] julabaSync fired')

    const sqlite = window.CapacitorSQLite
    if (!sqlite) {
      console.warn('[background-runner] CapacitorSQLite not available, skipping')
      resolve()
      return
    }

    // Open connection
    const conn = await sqlite.createConnection({
      database: DB_NAME,
      version: DB_VERSION,
      encrypted: false,
      mode: 'no-encryption',
    })

    if (!conn) {
      console.warn('[background-runner] Could not open SQLite connection')
      resolve()
      return
    }

    // Read pending entries — a single created_at-ordered pass across every
    // entity interleaved, unlike the foreground's per-entity ordered flush
    // (flushAllPendingSync in offline-db.ts). That's a real, pre-existing
    // difference in ordering guarantees between the two paths, not fixed
    // here — out of scope for the entity/endpoint contract mismatch this
    // rewrite addresses.
    const result = await conn.query(
      'SELECT id, entity, payload FROM pending_sync WHERE synced = 0 ORDER BY created_at ASC',
    )

    const rows = result?.values ?? []
    if (rows.length === 0) {
      await conn.close()
      console.log('[background-runner] No pending entries')
      resolve()
      return
    }

    console.log(`[background-runner] ${rows.length} pending entries to sync`)

    let syncedCount = 0
    let droppedCount = 0

    for (const row of rows) {
      let payload
      try {
        payload = JSON.parse(row.payload)
      } catch {
        console.warn(`[background-runner] Unreadable payload for ${row.entity} id=${row.id}, skipping`)
        continue
      }

      const req = requestFor(row.entity, payload)
      if (!req) {
        console.warn(`[background-runner] Unknown entity "${row.entity}", skipping`)
        continue
      }

      try {
        const res = await fetch(req.path, {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        })

        if (res.ok) {
          await conn.query('UPDATE pending_sync SET synced = 1 WHERE id = ?', [row.id])
          syncedCount++
          console.log(`[background-runner] Synced ${row.entity} id=${row.id}`)
        } else if (row.entity === 'device-claim' && res.status === 409) {
          // Already claimed by a different device — not this device's
          // failure to report, and retrying won't change it (see
          // sync-handlers.ts's device-claim handler for the same rule).
          await conn.query('UPDATE pending_sync SET synced = 1 WHERE id = ?', [row.id])
          syncedCount++
          console.log(`[background-runner] device-claim id=${row.id} already claimed elsewhere, dropped`)
        } else if (isPermanent(res.status)) {
          // Definitive rejection — recorded into sync_conflicts (the same
          // table the foreground path writes via recordSyncConflict) so the
          // app's conflict screen can surface it next time it's opened,
          // then dropped so it doesn't block every entry behind it forever.
          await conn.query(
            'INSERT INTO sync_conflicts (id, queue_id, entity, payload, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [`conflict-${row.id}-${Date.now()}`, row.id, row.entity, row.payload, `${req.path} → ${res.status}`, Date.now()],
          )
          await conn.query('UPDATE pending_sync SET synced = 1 WHERE id = ?', [row.id])
          droppedCount++
          console.warn(`[background-runner] ${row.entity} id=${row.id} permanently rejected (${res.status}), dropped`)
        } else {
          console.warn(`[background-runner] ${row.entity} id=${row.id} returned ${res.status}`)
        }
      } catch (fetchErr) {
        // Network error or timeout — skip, retry next cycle
        console.warn(`[background-runner] Failed ${row.entity} id=${row.id}:`, fetchErr.message)
      }
    }

    await conn.close()
    console.log(`[background-runner] Done: ${syncedCount} synced, ${droppedCount} dropped, ${rows.length} total`)
    resolve()
  } catch (err) {
    console.error('[background-runner] Fatal error:', err)
    reject(err)
  }
})
