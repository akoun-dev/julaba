const CACHE_VERSION = 'julaba-shell-v1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', OFFLINE_URL]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('julaba-shell-') || key.startsWith('julaba-runtime-'))
        .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return

  const url = new URL(request.url)
  // Never cache API responses or authenticated data. Business reads remain
  // server-authoritative; local stores/outbox handle offline mutations.
  if (url.pathname.startsWith('/api/')) return

  // Navigation: prefer the live Next response, then the last successful shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          }
          return response
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')) || (await caches.match(OFFLINE_URL))),
    )
    return
  }

  // Static Next chunks and public assets use stale-while-revalidate. This
  // makes a previously opened application remain bootable after a cold start.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          }
          return response
        })
        .catch(() => cached)
      return cached || refresh
    }),
  )
})
