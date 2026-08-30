import { create } from 'zustand'

export interface AppNotification {
  id: string
  type: 'bienvenue' | 'sync_conflict' | 'dossier_valide' | 'dossier_rejete' | 'tontine_cotisation' | 'commande_recue'
  title: string
  body: string
  data: string | null
  read: boolean
  createdAt: string
}

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

// Deliberately not persisted (no `persist` middleware): identity comes from
// the device-session cookie, not from anything client-controlled, so there
// is nothing here worth caching across reloads — a fresh fetch on mount is
// cheap and always correct. Shared by marchand/producteur/identificateur
// alike: whichever role is logged in on this device is the one /api/
// notifications resolves against, so one store instance covers all three.
export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      set({ notifications: data.notifications ?? [], unreadCount: data.unreadCount ?? 0 })
    } catch {
      // Best-effort — a failed fetch just leaves the bell showing its last
      // known count rather than crashing the home screen.
    } finally {
      set({ loading: false })
    }
  },

  markRead: async (id) => {
    const { notifications, unreadCount } = get()
    const target = notifications.find((n) => n.id === id)
    if (!target || target.read) return
    // Optimistic: the panel is already showing this as read the instant it
    // was viewed, no need to wait on the network for that.
    set({
      notifications: notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, unreadCount - 1),
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
}))
