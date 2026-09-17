// Notifications créées sur l'appareil (origin='device') : une action faite
// hors ligne (vente, dépense, file de synchronisation…) produit une
// notification immédiate, persistée en localStorage, marquée
// « en attente de synchronisation », puis envoyée au serveur à la
// reconnexion (voir client.ts → syncPendingDeviceNotifications). Rien
// n'est perdu à la fermeture de l'app : tout passe par localStorage, le
// même choix assumé que la file offline (offline-db.ts).

import type { InAppNotification, NotificationInput } from './types'
import { withDefaultExpiry } from './rules'

const DEVICE_KEY = 'julaba-device-notifications-v1'
const MAX_DEVICE_NOTIFICATIONS = 100

export function newNotificationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // Environnement sans randomUUID (tests) — repli ci-dessous.
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Construit une notification d'appareil complète (expiration par défaut
 * selon la sévérité, horodatage, non synchronisée). Pure : ne touche pas au
 * storage. */
export function buildDeviceNotification(input: NotificationInput, now: Date = new Date()): InAppNotification {
  const withExpiry = withDefaultExpiry(input, now)
  return {
    id: newNotificationId(),
    type: withExpiry.type,
    category: withExpiry.category,
    severity: withExpiry.severity,
    priority: withExpiry.priority ?? 'normal',
    title: withExpiry.title,
    body: withExpiry.body,
    data: null,
    read: false,
    createdAt: now.toISOString(),
    readAt: null,
    archivedAt: null,
    expiresAt: withExpiry.expiresAt ?? null,
    deduplicationKey: withExpiry.deduplicationKey ?? null,
    actionLabel: withExpiry.actionLabel ?? null,
    actionRoute: withExpiry.actionRoute ?? null,
    actionData: withExpiry.actionData ?? null,
    metadata: withExpiry.metadata ?? null,
    origin: 'device',
    synced: false,
  }
}

interface DeviceStore {
  notifications: InAppNotification[]
}

function readStore(): DeviceStore {
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    if (!raw) return { notifications: [] }
    const parsed = JSON.parse(raw) as DeviceStore
    return { notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [] }
  } catch {
    return { notifications: [] }
  }
}

function writeStore(store: DeviceStore): void {
  try {
    // Cap : les plus anciennes sont sacrifiées, mais jamais une non-lue ni
    // une critique avant les lues anciennes.
    const sorted = [...store.notifications].sort((a, b) => {
      const keepScore = (n: InAppNotification) => (n.read ? 0 : 10) + (n.priority === 'critical' ? 5 : 0)
      return keepScore(b) - keepScore(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    const trimmed = sorted.slice(0, MAX_DEVICE_NOTIFICATIONS)
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ notifications: trimmed }))
  } catch {
    // Quota plein ou storage indisponible : la notification existe au moins
    // en mémoire pour la session.
  }
}

/** Purge locale : expirees (sauf critiques/sécurité non lues) et, si
 * keepHistory=false, tout ce qui est lu et vieux de plus de 7 jours. */
export function pruneDeviceNotifications(keepHistory: boolean, now: Date = new Date()): void {
  const store = readStore()
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  store.notifications = store.notifications.filter((n) => {
    if (n.expiresAt && new Date(n.expiresAt).getTime() <= now.getTime() && n.read && n.priority !== 'critical' && n.category !== 'securite') return false
    if (!keepHistory && n.read && new Date(n.createdAt).getTime() < sevenDaysAgo) return false
    return true
  })
  writeStore(store)
}

export function getDeviceNotifications(): InAppNotification[] {
  return readStore().notifications
}

/** Ajoute une notification d'appareil. Déduplication contre l'existant
 * (clé stable) : un même événement rejoué ne crée pas de doublon local.
 * Retourne la notification créée, ou null si doublon. */
export function addDeviceNotification(input: NotificationInput, now: Date = new Date()): InAppNotification | null {
  const store = readStore()
  const candidate = buildDeviceNotification(input, now)
  const keyOf = (n: InAppNotification) => n.deduplicationKey || `${n.type}|${n.title}|${Math.floor(new Date(n.createdAt).getTime() / 1000)}`
  const key = keyOf(candidate)
  if (store.notifications.some((n) => keyOf(n) === key)) return null
  store.notifications.unshift(candidate)
  writeStore(store)
  return candidate
}

export function markDeviceNotificationRead(id: string): void {
  const store = readStore()
  store.notifications = store.notifications.map((n) =>
    n.id === id && !n.read ? { ...n, read: true, readAt: new Date().toISOString() } : n,
  )
  writeStore(store)
}

export function markAllDeviceNotificationsRead(): void {
  const store = readStore()
  const now = new Date().toISOString()
  store.notifications = store.notifications.map((n) => (n.read ? n : { ...n, read: true, readAt: now }))
  writeStore(store)
}

export function deleteDeviceNotification(id: string): void {
  const store = readStore()
  store.notifications = store.notifications.filter((n) => n.id !== id)
  writeStore(store)
}

export function archiveDeviceNotification(id: string): void {
  const store = readStore()
  store.notifications = store.notifications.map((n) =>
    n.id === id ? { ...n, archivedAt: new Date().toISOString() } : n,
  )
  writeStore(store)
}

/** Notifications créées localement et pas encore envoyées au serveur. */
export function pendingDeviceNotifications(): InAppNotification[] {
  return readStore().notifications.filter((n) => !n.synced)
}

/** Marque comme synchronisées (après POST réussi au serveur). */
export function markDeviceNotificationsSynced(ids: string[]): void {
  if (ids.length === 0) return
  const store = readStore()
  const idSet = new Set(ids)
  store.notifications = store.notifications.map((n) => (idSet.has(n.id) ? { ...n, synced: true } : n))
  writeStore(store)
}

/** Vide la boîte locale (déconnexion) — les notifications déjà servies au
 * serveur ne doivent pas fuiter vers l'utilisateur suivant de l'appareil. */
export function clearDeviceNotifications(): void {
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Rien à faire — best-effort.
  }
}
