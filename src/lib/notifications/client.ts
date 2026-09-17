// Service client du système de notifications in-app — le point d'entrée
// unique pour créer, lire, marquer, archiver, supprimer et synchroniser.
// Toutes les fonctions sont best-effort : une notification est un effet
// secondaire, elle ne doit jamais faire échouer l'action qui l'a
// déclenchée (même contrat que src/lib/notifications.ts côté serveur).
//
// Deux origines vivent côte à côte :
//  • server  : créées par les routes API (BO, dossier validé, annonce…) et
//              lues via GET /api/notifications (identité = cookie appareil).
//  • device  : créées ici pour une action locale (vente hors ligne,
//              caisse, stock faible…), persistées en localStorage, envoyées
//              au serveur à la reconnexion, dédupliquées des deux côtés.

import type { InAppNotification, NotificationInput } from './types'
import { isDuplicateNotification, mergeNotifications, isExpired } from './rules'
import {
  addDeviceNotification,
  getDeviceNotifications,
  markDeviceNotificationRead,
  markAllDeviceNotificationsRead,
  deleteDeviceNotification,
  archiveDeviceNotification,
  markDeviceNotificationsSynced,
  pruneDeviceNotifications,
  pendingDeviceNotifications,
} from './device-notifications'
import { trackNotificationMetric } from './metrics'
import { getNotificationPrefs } from './preferences'

const SERVER_PAGE_SIZE = 50

// ── Mapping DB → InAppNotification ────────────────────────────────────────
// La table porte les colonnes en snake_case ; l'app consomme du camelCase.
// Un champ inconnu ne doit jamais faire planter l'affichage : défauts prêts.

export interface ServerNotificationRow {
  id: string
  type: string
  title: string
  body: string
  data: string | null
  read: boolean
  created_at: string
  read_at?: string | null
  archived_at?: string | null
  expires_at?: string | null
  deduplication_key?: string | null
  action_label?: string | null
  action_route?: string | null
  action_data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  category?: string | null
  severity?: string | null
  priority?: string | null
  origin?: string | null
}

const SEVERITIES = ['info', 'success', 'warning', 'error', 'reminder'] as const
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const

export function mapServerRow(row: ServerNotificationRow): InAppNotification {
  return {
    id: row.id,
    type: row.type,
    category: (row.category as InAppNotification['category']) ?? 'systeme',
    severity: (SEVERITIES as readonly string[]).includes(row.severity ?? '') ? (row.severity as InAppNotification['severity']) : 'info',
    priority: (PRIORITIES as readonly string[]).includes(row.priority ?? '') ? (row.priority as InAppNotification['priority']) : 'normal',
    title: row.title,
    body: row.body,
    data: row.data,
    read: row.read,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    archivedAt: row.archived_at ?? null,
    expiresAt: row.expires_at ?? null,
    deduplicationKey: row.deduplication_key ?? null,
    actionLabel: row.action_label ?? null,
    actionRoute: row.action_route ?? null,
    actionData: row.action_data ?? null,
    metadata: row.metadata ?? null,
    origin: 'server',
  }
}

// ── Lecture du feed ───────────────────────────────────────────────────────

export interface FeedResult {
  server: InAppNotification[]
  device: InAppNotification[]
  unreadCount: number
  hasMore: boolean
}

/** Charge le feed : notifications serveur (page 1) + notifications locales
 * non expirées, fusionnées et dédupliquées. `unreadCount` est le compteur
 * serveur brut ; le store retranche ce que les préférences masquent. */
export async function fetchNotificationFeed(before?: string): Promise<FeedResult> {
  const url = before ? `/api/notifications?before=${encodeURIComponent(before)}` : '/api/notifications'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = await res.json()
  const server: InAppNotification[] = (data.notifications ?? []).map(mapServerRow)
  const prefs = getNotificationPrefs()
  pruneDeviceNotifications(prefs.keepHistory)
  const device = getDeviceNotifications().filter((n) => !n.archivedAt && !isExpired(n))
  return {
    server,
    device,
    unreadCount: data.unreadCount ?? 0,
    hasMore: (data.notifications ?? []).length >= SERVER_PAGE_SIZE,
  }
}

/** Charge les notifications plus anciennes (pagination). */
export async function fetchOlderNotifications(before: string): Promise<InAppNotification[]> {
  const res = await fetch(`/api/notifications?before=${encodeURIComponent(before)}`)
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = await res.json()
  return (data.notifications ?? []).map(mapServerRow)
}

// ── Création ──────────────────────────────────────────────────────────────

export interface CreateResult {
  notification: InAppNotification
  /** false si un doublon (même clé) existait déjà — l'appelant peut
   * ignorer silencieusement. */
  created: boolean
}

/**
 * Crée une notification d'appareil et, si le réseau le permet, la pousse
 * au serveur pour historisation. Jamais de throw : en cas d'échec réseau la
 * notification reste locale, marquée « en attente », et partira à la
 * prochaine synchronisation.
 */
export async function createNotification(input: NotificationInput): Promise<CreateResult> {
  trackNotificationMetric('created', { category: input.category, severity: input.severity })
  const existing = getDeviceNotifications()
  const created = addDeviceNotification(input)
  if (!created) {
    return { notification: existing[0], created: false }
  }
  // Tentative d'historisation serveur — le serveur re-déduplique via la
  // contrainte (subject, deduplication_key). L'échec est silencieux.
  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: created.type,
        category: created.category,
        severity: created.severity,
        priority: created.priority,
        title: created.title,
        body: created.body,
        deduplicationKey: created.deduplicationKey,
        actionLabel: created.actionLabel,
        actionRoute: created.actionRoute,
        actionData: created.actionData,
        metadata: created.metadata,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
        deviceId: created.id,
      }),
    })
    if (res.ok) markDeviceNotificationsSynced([created.id])
  } catch {
    // Hors ligne : la notification reste « en attente » (indicateur visuel
    // dans le centre) — syncPendingDeviceNotifications() la renverra.
  }
  return { notification: created, created: true }
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Marque une notification comme lue (locale + serveur si elle en vient). */
export async function markNotificationAsRead(notification: InAppNotification): Promise<void> {
  trackNotificationMetric('read', { category: notification.category, createdAt: notification.createdAt })
  if (notification.origin === 'device') {
    markDeviceNotificationRead(notification.id)
    return
  }
  try {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notification.id }),
    })
  } catch {
    // Hors ligne : le re-fetch suivant repartira du serveur — acceptable.
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  trackNotificationMetric('read_all')
  markAllDeviceNotificationsRead()
  try {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
  } catch {
    // Idem.
  }
}

/** Archive (historique conservé, invisible du centre). */
export async function archiveNotification(notification: InAppNotification): Promise<void> {
  if (notification.origin === 'device') {
    archiveDeviceNotification(notification.id)
    return
  }
  try {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notification.id, archive: true }),
    })
  } catch {
    // Idem.
  }
}

export async function deleteNotification(notification: InAppNotification): Promise<void> {
  trackNotificationMetric('deleted', { category: notification.category })
  if (notification.origin === 'device') {
    deleteDeviceNotification(notification.id)
    return
  }
  try {
    await fetch(`/api/notifications?id=${encodeURIComponent(notification.id)}`, { method: 'DELETE' })
  } catch {
    // Idem.
  }
}

/** Compteur non-lus utile aux écrans qui ne veulent pas s'abonner au store. */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const res = await fetch('/api/notifications')
    if (!res.ok) return 0
    const data = await res.json()
    return data.unreadCount ?? 0
  } catch {
    return 0
  }
}

// ── Synchronisation des notifications locales ────────────────────────────

/** Envoie au serveur les notifications d'appareil en attente (appelé au
 * retour du réseau). Le serveur déduplique par (subject, deduplication_key)
 * — une notification déjà historisée (retry, autre onglet) est ignorée
 * sans erreur. Retourne le nombre envoyé. */
export async function syncPendingDeviceNotifications(): Promise<number> {
  const pending = pendingDeviceNotifications()
  if (pending.length === 0) return 0
  const synced: string[] = []
  for (const n of pending) {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: n.type,
          category: n.category,
          severity: n.severity,
          priority: n.priority,
          title: n.title,
          body: n.body,
          deduplicationKey: n.deduplicationKey ?? `device:${n.id}`,
          actionLabel: n.actionLabel,
          actionRoute: n.actionRoute,
          actionData: n.actionData,
          metadata: n.metadata,
          expiresAt: n.expiresAt,
          createdAt: n.createdAt,
          deviceId: n.id,
        }),
      })
      if (res.ok) synced.push(n.id)
    } catch {
      // Reste en attente — le prochain retour réseau retentera.
    }
  }
  markDeviceNotificationsSynced(synced)
  return synced.length
}

// ── Realtime (signal-only) ────────────────────────────────────────────────
// Modèle : le serveur émet un broadcast {id} sur le canal
// `julaba-notif:<subject>` quand il crée une notification. Le client
// s'abonne et re-fetch son feed. Le payload ne contient AUCUN contenu
// (limite documentée : le subject étant prévisible, le canal ne transporte
// que « quelque chose est arrivé ») — le contenu passe exclusivement par
// GET /api/notifications protégé par cookie. Le polling 45 s reste le
// filet si le WebSocket est indisponible.

export const NOTIF_CHANNEL_PREFIX = 'julaba-notif:'

export interface RealtimeHandle {
  unsubscribe: () => Promise<void>
}

/** Souscrit au canal de signal de l'appareil. `onSignal` est appelé à
 * chaque événement (sans contenu). Retourne null si Supabase Realtime
 * n'est pas disponible (web sans config, blocage réseau) — le polling
 * prend le relais. */
export async function subscribeToNotifications(
  subject: string,
  onSignal: () => void,
): Promise<RealtimeHandle | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null
    const supabase = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 5 } } })
    const channel = supabase.channel(`${NOTIF_CHANNEL_PREFIX}${subject}`)
    channel.on('broadcast', { event: 'new' }, () => onSignal())
    const status = await new Promise<'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED'>((resolve) => {
      const timer = setTimeout(() => resolve('TIMED_OUT'), 5000)
      channel.subscribe((state) => {
        if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          clearTimeout(timer)
          resolve(state)
        }
      })
    })
    if (status !== 'SUBSCRIBED') {
      void supabase.removeChannel(channel)
      return null
    }
    return {
      unsubscribe: async () => {
        try {
          await supabase.removeChannel(channel)
        } catch {
          // Déjà parti — best-effort.
        }
      },
    }
  } catch {
    return null
  }
}

// ── Ré-exports pratiques (API demandée par la spec) ──────────────────────
export { isDuplicateNotification, mergeNotifications }
