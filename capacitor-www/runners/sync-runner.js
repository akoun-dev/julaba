// Background Runner entry point (@capacitor/background-runner).
//
// Runs in an isolated JS context on Android/iOS — no DOM, no access to the
// WebView's React state or Zustand stores. Uses CapacitorSQLite's native
// APIs to read pending_sync rows and flush them to the server.
//
// Configured in capacitor.config.ts: event "julabaSync", every 15 minutes
// while backgrounded, auto-start: true.

const DB_NAME = 'julaba'
const DB_VERSION = 1

const ENTITY_ENDPOINTS = {
  merchant:            { path: '/api/merchant',                method: 'POST' },
  sale:                { path: '/api/marchand/sales',          method: 'POST' },
  expense:             { path: '/api/marchand/expenses',       method: 'POST' },
  product:             { path: '/api/marchand/products',       method: 'POST' },
  enrolment:           { path: '/api/backoffice/enrolments',   method: 'POST' },
  recolte:             { path: '/api/producteur/recoltes',     method: 'POST' },
  'commande-response':  { path: '/api/producteur/commandes',    method: 'POST' },
  'commande-livraison': { path: '/api/producteur/commandes',    method: 'PATCH' },
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

    // Read pending entries
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

    for (const row of rows) {
      const endpoint = ENTITY_ENDPOINTS[row.entity]
      if (!endpoint) {
        console.warn(`[background-runner] Unknown entity "${row.entity}", skipping`)
        continue
      }

      try {
        const res = await fetch(endpoint.path, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: row.payload,
        })

        // 409 = idempotent duplicate — treat as synced
        if (res.ok || res.status === 409) {
          await conn.query('UPDATE pending_sync SET synced = 1 WHERE id = ?', [row.id])
          syncedCount++
          console.log(`[background-runner] Synced ${row.entity} id=${row.id}`)
        } else {
          console.warn(`[background-runner] ${row.entity} id=${row.id} returned ${res.status}`)
        }
      } catch (fetchErr) {
        // Network error or timeout — skip, retry next cycle
        console.warn(`[background-runner] Failed ${row.entity} id=${row.id}:`, fetchErr.message)
      }
    }

    await conn.close()
    console.log(`[background-runner] Done: ${syncedCount}/${rows.length} entries synced`)
    resolve()
  } catch (err) {
    console.error('[background-runner] Fatal error:', err)
    reject(err)
  }
})
