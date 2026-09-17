// Déclencheurs côté client (Task 28) — colle les événements métier aux
// notifications sans dupliquer de logique dans les composants. Les écrans
// importent notify(input) (ou un helper de events.ts) et ne savent rien du
// store ni des toasts.

import { useEffect } from 'react'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import type { NotificationInput } from './types'
import { connectionRestoredInput, syncCompletedInput, syncQueuedInput } from './events'

/** Crée une notification locale (appareil + serveur si en ligne + toast si
 * pertinent). Best-effort : ne jette jamais — une notification ne doit pas
 * faire échouer l'action qui l'a déclenchée. */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    await useNotificationsStore.getState().createLocal(input)
  } catch (err) {
    console.warn('[notifications] create failed (best-effort)', err)
  }
}

// ── File de synchronisation → notifications ──────────────────────────────
// La file offline-db diffuse déjà 'julaba-offline-queue-changed' quand une
// opération part en attente. On en déduit deux événements :
//  • une opération vient d'être mise en file → « mise en attente » ;
//  • la file vient de se vider après avoir été pleine → « synchronisation
//    terminée » (avec le nombre d'opérations traitées).

let lastQueueSize: number | null = null
let queuedDuringBurst = 0
let attachInstalled = false

async function readQueueSize(): Promise<number> {
  try {
    const { getPendingSyncEntries } = await import('@/lib/offline-db')
    return (await getPendingSyncEntries()).length
  } catch {
    return 0
  }
}

/** Installe (une seule fois) l'écoute de la file offline pour notifier
 * « mise en attente » et « synchronisation terminée ». Appelé au montage
 * racine (page.tsx) — idempotent. */
export function attachSyncNotifications(): void {
  if (attachInstalled || typeof window === 'undefined') return
  attachInstalled = true

  void readQueueSize().then((size) => { lastQueueSize = size })

  window.addEventListener('julaba-offline-queue-changed', () => {
    void (async () => {
      const size = await readQueueSize()
      const previous = lastQueueSize ?? 0
      lastQueueSize = size

      if (size > previous) {
        // Une (ou plusieurs) opération(s) viennent d'être mises en file.
        queuedDuringBurst += size - previous
        const { getPendingSyncEntries } = await import('@/lib/offline-db')
        const entries = await getPendingSyncEntries()
        const newest = entries[entries.length - 1]
        await notify(syncQueuedInput({ entity: newest?.entity ?? 'opération', queueId: newest?.id ?? Date.now() }))
      } else if (size === 0 && previous > 0 && queuedDuringBurst > 0) {
        // La file s'est vidée : tout ce qui attendait est parti.
        await notify(syncCompletedInput({ count: queuedDuringBurst }))
        queuedDuringBurst = 0
      }
    })()
  })
}

/** Hook racine : installe les listeners globaux une fois. */
export function useNotificationTriggers(): void {
  useEffect(() => {
    attachSyncNotifications()
  }, [])
}

/** À appeler au retour du réseau (capacitor-provider) : notifie le
 * rétablissement avec le nombre d'opérations en attente. */
export async function notifyConnectionRestored(): Promise<void> {
  let pendingCount = 0
  try {
    const { getPendingSyncEntries } = await import('@/lib/offline-db')
    pendingCount = (await getPendingSyncEntries()).length
  } catch {
    pendingCount = 0
  }
  await notify(connectionRestoredInput({ pendingCount }))
}
