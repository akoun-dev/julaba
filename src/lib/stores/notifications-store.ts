import { create } from 'zustand'
import {
  deduplicationKeyOf,
  isExpired,
  mergeNotifications,
  shouldDisplayNotification,
  sortForDisplay,
} from '@/lib/notifications/rules'
import { getNotificationPrefs } from '@/lib/notifications/preferences'
import { showNotificationToast } from '@/lib/notifications/toast'
import { trackNotificationMetric } from '@/lib/notifications/metrics'
import {
  fetchNotificationFeed,
  fetchOlderNotifications,
  createNotification as createDeviceAndSync,
  markNotificationAsRead as persistRead,
  markAllNotificationsAsRead as persistAllRead,
  deleteNotification as persistDelete,
  archiveNotification as persistArchive,
  syncPendingDeviceNotifications,
} from '@/lib/notifications/client'
import {
  getDeviceNotifications,
} from '@/lib/notifications/device-notifications'
import type { InAppNotification, NotificationFilter, NotificationInput } from '@/lib/notifications/types'

// Type historique conservé pour les importeurs existants (watcher,
// notification locale Capacitor) : une InAppNotification est structurellement
// compatible (elle porte tous les champs de l'ancienne forme).
export type NotificationType = string
export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  data: string | null
  read: boolean
  createdAt: string
}

const PAGE_SIZE = 50

interface NotificationsState {
  /** Feed affiché : serveur + appareil, dédupliqués, triés par priorité
   * puis date, expirées et archivées retirées. */
  notifications: InAppNotification[]
  unreadCount: number
  /** Notifications d'appareil pas encore envoyées au serveur. */
  devicePendingCount: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  /** Dernier échec de chargement (état d'erreur du centre). */
  error: string | null
  filter: NotificationFilter
  fetchNotifications: () => Promise<void>
  loadMore: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  archiveNotification: (id: string) => Promise<void>
  clearRead: () => Promise<void>
  /** Crée une notification locale (déclencheur métier) : persistance
   * appareil, envoi serveur si en ligne, toast si pertinent. */
  createLocal: (input: NotificationInput) => Promise<InAppNotification | null>
  /** Renvoie au serveur les notifications locales en attente (retour réseau). */
  syncPending: () => Promise<void>
  setFilter: (filter: NotificationFilter) => void
  /** Ids vus lors d'un fetch précédent — le watcher en tire les vraies
   * nouveautés (voix, notification système) sans redécouvrir l'historique. */
  consumeNewlyArrived: () => InAppNotification[]
}

// Deliberately not persisted (no `persist` middleware): identity comes from
// the device-session cookie, and the device-origin notifications persist
// themselves in localStorage (device-notifications.ts). A fresh fetch on
// mount is cheap and always correct. Shared by marchand/producteur/
// identificateur alike: whichever role is logged in on this device is the
// one /api/notifications resolves against, so one store instance covers all.
let knownIds: Set<string> | null = null // null until the first fetch lands

/** Recalcule le feed affiché et le compteur non-lus à partir des deux
 * sources + des préférences. Une notification masquée par préférences ne
 * compte pas dans le badge (le muting doit tenir sa promesse : pas de
 * red dot pour une catégorie coupée). */
function recompute(state: {
  serverNotifications: InAppNotification[]
  deviceNotifications: InAppNotification[]
  serverUnreadCount: number
}): Pick<NotificationsState, 'notifications' | 'unreadCount' | 'devicePendingCount'> {
  const prefs = getNotificationPrefs()
  const merged = mergeNotifications(state.serverNotifications, state.deviceNotifications)
  const visible = sortForDisplay(
    merged.filter((n) => !n.archivedAt && !isExpired(n) && shouldDisplayNotification(n, prefs)),
  )
  const serverKeys = new Set(state.serverNotifications.map(deduplicationKeyOf))
  const deviceOnlyUnread = state.deviceNotifications.filter(
    (n) => !n.read && !serverKeys.has(deduplicationKeyOf(n)) && !isExpired(n) && shouldDisplayNotification(n, prefs),
  ).length
  const mutedServerUnread = state.serverNotifications.filter(
    (n) => !n.read && !shouldDisplayNotification(n, prefs),
  ).length
  const devicePendingCount = state.deviceNotifications.filter((n) => !n.synced).length
  return {
    notifications: visible,
    unreadCount: Math.max(0, state.serverUnreadCount - mutedServerUnread) + deviceOnlyUnread,
    devicePendingCount,
  }
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => {
  // Les deux sources vivent hors du feed affiché — recompute() les fusionne.
  let serverNotifications: InAppNotification[] = []
  let deviceNotifications: InAppNotification[] = []
  let serverUnreadCount = 0

  const commit = (extra?: Partial<NotificationsState>) => {
    set({
      ...recompute({ serverNotifications, deviceNotifications, serverUnreadCount }),
      ...extra,
    })
  }

  return {
    notifications: [],
    unreadCount: 0,
    devicePendingCount: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    filter: 'all',

    fetchNotifications: async () => {
      set({ loading: get().notifications.length === 0, error: null })
      try {
        const feed = await fetchNotificationFeed()
        serverNotifications = feed.server
        deviceNotifications = feed.device
        serverUnreadCount = feed.unreadCount
        commit({ hasMore: feed.hasMore })
        // Seed du diff « nouveautés » : le premier fetch de la session ne
        // redécouvre jamais tout l'historique (pas de rafale de voix/toasts
        // au montage).
        if (knownIds === null) knownIds = new Set(serverNotifications.map(deduplicationKeyOf))
      } catch (err) {
        commit({ error: err instanceof Error ? err.message : 'Erreur de chargement' })
      } finally {
        set({ loading: false })
      }
    },

    loadMore: async () => {
      const { hasMore, loadingMore, notifications } = get()
      if (!hasMore || loadingMore || notifications.length === 0) return
      set({ loadingMore: true })
      try {
        const before = notifications[notifications.length - 1].createdAt
        const older = await fetchOlderNotifications(before)
        // Ajout à la source serveur (les doublons device sont éliminés par
        // mergeNotifications) ; knownIds suit pour ne jamais rejouer du vieux.
        serverNotifications = [...serverNotifications, ...older]
        for (const n of older) knownIds?.add(deduplicationKeyOf(n))
        commit({ hasMore: older.length >= PAGE_SIZE })
      } catch {
        // Best-effort — « Charger plus » reste cliquable pour retenter.
      } finally {
        set({ loadingMore: false })
      }
    },

    markRead: async (id) => {
      const target = get().notifications.find((n) => n.id === id)
      if (!target || target.read) return
      if (target.origin === 'device') {
        deviceNotifications = deviceNotifications.map((n) =>
          n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n,
        )
      } else {
        serverNotifications = serverNotifications.map((n) =>
          n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n,
        )
        serverUnreadCount = Math.max(0, serverUnreadCount - 1)
      }
      commit()
      try {
        await persistRead(target)
      } catch {
        // Best-effort — le re-fetch suivant repartira du serveur.
      }
    },

    markAllRead: async () => {
      const now = new Date().toISOString()
      serverNotifications = serverNotifications.map((n) => (n.read ? n : { ...n, read: true, readAt: now }))
      deviceNotifications = deviceNotifications.map((n) => (n.read ? n : { ...n, read: true, readAt: now }))
      serverUnreadCount = 0
      commit()
      try {
        await persistAllRead()
      } catch {
        // Best-effort — idem.
      }
    },

    deleteNotification: async (id) => {
      const target = get().notifications.find((n) => n.id === id)
      if (!target) return
      trackNotificationMetric('deleted', { category: target.category })
      if (target.origin === 'device') {
        deviceNotifications = deviceNotifications.filter((n) => n.id !== id)
      } else {
        serverNotifications = serverNotifications.filter((n) => n.id !== id)
        if (!target.read) serverUnreadCount = Math.max(0, serverUnreadCount - 1)
      }
      commit()
      try {
        await persistDelete(target)
      } catch {
        // Best-effort — la notification peut réapparaître au prochain fetch.
      }
    },

    archiveNotification: async (id) => {
      const target = get().notifications.find((n) => n.id === id)
      if (!target) return
      if (target.origin === 'device') {
        deviceNotifications = deviceNotifications.map((n) =>
          n.id === id ? { ...n, archivedAt: new Date().toISOString() } : n,
        )
      } else {
        serverNotifications = serverNotifications.map((n) =>
          n.id === id ? { ...n, archivedAt: new Date().toISOString() } : n,
        )
        if (!target.read) serverUnreadCount = Math.max(0, serverUnreadCount - 1)
      }
      commit()
      try {
        await persistArchive(target)
      } catch {
        // Best-effort.
      }
    },

    clearRead: async () => {
      serverNotifications = serverNotifications.filter((n) => !n.read)
      deviceNotifications = deviceNotifications.filter((n) => !n.read)
      commit()
      try {
        await fetch('/api/notifications?onlyRead=true', { method: 'DELETE' })
      } catch {
        // Best-effort.
      }
    },

    createLocal: async (input) => {
      const result = await createDeviceAndSync(input)
      if (!result.created) return null
      // Rafraîchit la source device (createDeviceAndSync a persisté).
      deviceNotifications = getDeviceNotifications()
      commit()
      // Toast : montré seulement si les préférences le permettent (les
      // erreurs d'action immédiate et les critiques passent toujours).
      showNotificationToast(result.notification)
      return result.notification
    },

    syncPending: async () => {
      const count = await syncPendingDeviceNotifications()
      if (count > 0) {
        deviceNotifications = getDeviceNotifications()
        commit()
      }
    },

    setFilter: (filter) => set({ filter }),

    consumeNewlyArrived: () => {
      // Seules les notifications SERVEUR sont des « arrivées » (les locales
      // sont créées par l'utilisateur lui-même, pas annoncées deux fois).
      if (knownIds === null) return []
      const fresh = serverNotifications.filter(
        (n) => !n.read && !isExpired(n) && !knownIds!.has(deduplicationKeyOf(n)),
      )
      for (const n of fresh) knownIds!.add(deduplicationKeyOf(n))
      return fresh
    },
  }
})
