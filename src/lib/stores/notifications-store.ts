import { create } from 'zustand'
import { isNotificationMuted } from '@/lib/notification-preferences'

export type NotificationType = 'bienvenue' | 'sync_conflict' | 'dossier_valide' | 'dossier_rejete' | 'tontine_cotisation' | 'commande_recue' | 'annonce'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  data: string | null
  read: boolean
  createdAt: string
}

const PAGE_SIZE = 50

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  fetchNotifications: () => Promise<void>
  loadMore: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  clearRead: () => Promise<void>
  /** Ids seen in a previous fetch — lets callers (voice read-aloud, local
   * notifications) tell a genuinely new arrival apart from "still here
   * since last time", without keeping their own separate poll loop. */
  consumeNewlyArrived: () => AppNotification[]
}

// Deliberately not persisted (no `persist` middleware): identity comes from
// the device-session cookie, not from anything client-controlled, so there
// is nothing here worth caching across reloads — a fresh fetch on mount is
// cheap and always correct. Shared by marchand/producteur/identificateur
// alike: whichever role is logged in on this device is the one /api/
// notifications resolves against, so one store instance covers all three.
let knownIds: Set<string> | null = null // null until the first fetch lands, so mount never "discovers" the whole history as new

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  loadingMore: false,
  hasMore: false,

  fetchNotifications: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const notifications: AppNotification[] = data.notifications ?? []
      // The server counts every unread row for this subject — it has no
      // notion of the marchand's local "mute this category" preference
      // (that preference lives in localStorage, never synced server-side).
      // Subtract muted-and-unread rows here so the bell badge reflects what
      // muting actually promised: no nagging for a muted category.
      const mutedUnread = notifications.filter((n) => !n.read && isNotificationMuted(n.type)).length
      set({
        notifications,
        unreadCount: Math.max(0, (data.unreadCount ?? 0) - mutedUnread),
        hasMore: notifications.length >= PAGE_SIZE,
      })
      // Only seed knownIds on the very first fetch this session (so the
      // whole history isn't treated as "new" on mount) — later polling
      // fetches leave it alone; consumeNewlyArrived() below is what
      // advances it, by diffing against notifications as they arrive.
      if (knownIds === null) knownIds = new Set(notifications.map((n) => n.id))
    } catch {
      // Best-effort — a failed fetch just leaves the bell showing its last
      // known count rather than crashing the home screen.
    } finally {
      set({ loading: false })
    }
  },

  loadMore: async () => {
    const { notifications, hasMore, loadingMore } = get()
    if (!hasMore || loadingMore || notifications.length === 0) return
    set({ loadingMore: true })
    try {
      const before = notifications[notifications.length - 1].createdAt
      const res = await fetch(`/api/notifications?before=${encodeURIComponent(before)}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const older: AppNotification[] = data.notifications ?? []
      set({ notifications: [...notifications, ...older], hasMore: older.length >= PAGE_SIZE })
      for (const n of older) knownIds?.add(n.id)
    } catch {
      // Best-effort — "Charger plus" just stays clickable to retry.
    } finally {
      set({ loadingMore: false })
    }
  },

  markRead: async (id) => {
    const { notifications, unreadCount } = get()
    const target = notifications.find((n) => n.id === id)
    if (!target || target.read) return
    // Optimistic: the panel is already showing this as read the instant it
    // was viewed, no need to wait on the network for that. A muted item was
    // never counted into unreadCount in the first place (see
    // fetchNotifications), so only decrement for one that was.
    set({
      notifications: notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: isNotificationMuted(target.type) ? unreadCount : Math.max(0, unreadCount - 1),
    })
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {
      // Best-effort — worst case it re-appears as unread on next fetch.
    }
  },

  markAllRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch {
      // Best-effort — same as markRead.
    }
  },

  deleteNotification: async (id) => {
    const { notifications, unreadCount } = get()
    const target = notifications.find((n) => n.id === id)
    if (!target) return
    const wasCounted = !target.read && !isNotificationMuted(target.type)
    set({
      notifications: notifications.filter((n) => n.id !== id),
      unreadCount: wasCounted ? Math.max(0, unreadCount - 1) : unreadCount,
    })
    knownIds?.delete(id)
    try {
      await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      // Best-effort — worst case it reappears on next fetch.
    }
  },

  clearRead: async () => {
    set((state) => ({ notifications: state.notifications.filter((n) => !n.read) }))
    try {
      await fetch('/api/notifications?onlyRead=true', { method: 'DELETE' })
    } catch {
      // Best-effort — same as deleteNotification.
    }
  },

  consumeNewlyArrived: () => {
    const { notifications } = get()
    if (knownIds === null) {
      // First fetch this session — nothing to compare against, so nothing
      // is "new" (avoids reading the whole history aloud on mount).
      return []
    }
    const fresh = notifications.filter((n) => !n.read && !knownIds!.has(n.id))
    for (const n of fresh) knownIds!.add(n.id)
    return fresh
  },
}))
