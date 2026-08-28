// Background Runner entry point (@capacitor/background-runner).
//
// This runs in an isolated JS context on Android/iOS — no DOM, no access to
// the WebView's React state or Zustand stores, only the limited native APIs
// the plugin exposes to this sandbox (fetch-like HTTP, Geolocation, Notifications).
//
// It fires periodically (see the BackgroundRunner config in
// capacitor.config.ts: event "julabaSync", every `interval` minutes while
// backgrounded) so pending offline mutations — sales, enrollment dossiers —
// queued in the local SQLite database (see src/lib/offline-db.ts,
// `pending_sync` table) can be flushed to the server even if the user hasn't
// reopened the app.
//
// This is a scaffold, not a finished sync engine: wire the actual read /
// POST / mark-synced sequence here once the API contract for bulk-submitting
// queued entities is settled. The isolated context can reach the same
// SQLite database file via CapacitorSQLite's native APIs, but that access
// pattern needs its own testing on-device — left as a TODO rather than
// guessed at.
addEventListener('julabaSync', (resolve, reject, args) => {
  try {
    console.log('[background-runner] julabaSync fired', args)
    // TODO: read pending_sync rows via CapacitorSQLite, POST each to the
    // Jùlaba API, then mark it synced. See src/lib/offline-db.ts for the
    // schema this runner would read from.
    resolve()
  } catch (err) {
    reject(err)
  }
})
