// Pont notifications natives (Task 29) — @capacitor/push-notifications +
// @capacitor/local-notifications, les deux déjà installés mais dont le push
// n'était jamais importé dans src/.
//
// Ce que ce module fait (natif uniquement — no-op total sur web, la WebView
// distante charge le même bundle que le site) :
//   1. crée les 3 canaux Android (channels.ts) de façon idempotente ;
//   2. demande la permission Android 13+ (POST_NOTIFICATIONS), enregistre
//      l'app auprès de FCM et envoie le token au serveur
//      (POST /api/push-tokens, identité = cookie de session appareil) ;
//   3. route un push reçu app ouverte vers le feed (dédup par
//      deduplicationKey, le fetch serveur gagne ensuite) et, s'il est
//      data-only, affiche aussi le toast — un push avec bloc `notification`
//      est déjà affiché par le système (presentationOptions), on évite le
//      double bandeau ;
//   4. gère le TAP sur une notification (push ou locale) : navigation vers
//      action_route via executeNotificationAction (même chemin que le
//      centre et les toasts).
//
// Contrat du payload serveur (FCM) :
//   notification: { title, body }            ← affiché par le système quand
//   data: {                                     l'app est tuée/en fond
//     type, category, severity, priority,    ← dimensions Task 28
//     title?, body?,                         ← reprise du contenu (data-only)
//     deduplicationKey,                      ← OBLIGATOIRE pour éviter un
//     actionLabel?, actionRoute?,               doublon avec le fetch serveur
//     createdAt?, id?                        ← horodatage/id de la ligne serveur
//   }
//   android.channel_id ∈ {julaba-critical, julaba-important, julaba-info}
//
// Best-effort partout : un échec (permission refusée, FCM non configuré —
// google-services.json absent, réseau coupé) n'affiche pas d'erreur à
// l'utilisateur et ne casse rien ; le centre in-app reste la source de
// vérité. Le token est gardé en localStorage et reparti au retour réseau.

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { PushNotificationSchema } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { NOTIFICATION_CHANNELS } from './channels'
import { addDeviceNotification, buildDeviceNotification, markDeviceNotificationsSynced } from './device-notifications'
import { showNotificationToast, executeNotificationAction } from './toast'
import type {
  InAppNotification,
  NotificationCategory,
  NotificationInput,
  NotificationPriority,
  NotificationSeverity,
} from './types'

const PUSH_TOKEN_KEY = 'julaba-push-token-v1'

interface StoredPushToken {
  token: string
  platform: string
  /** true = le POST au serveur n'a pas abouti (hors ligne, non
   * authentifié) — reparti par syncPendingPushToken(). */
  pending: boolean
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Canaux
// ---------------------------------------------------------------------------

/** Crée les 3 canaux Android (idempotent — createChannel écrase). No-op sur
 * iOS (les canaux y sont une convention Android 8+). */
export async function createNotificationChannels(): Promise<void> {
  for (const channel of NOTIFICATION_CHANNELS) {
    try {
      await LocalNotifications.createChannel({ ...channel })
    } catch {
      // Best-effort — un canal manquant dégrade vers le canal FCM par défaut.
    }
  }
}

// ---------------------------------------------------------------------------
// Token push → serveur
// ---------------------------------------------------------------------------

function readStoredToken(): StoredPushToken | null {
  try {
    const raw = localStorage.getItem(PUSH_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPushToken
    return parsed && typeof parsed.token === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeStoredToken(stored: StoredPushToken): void {
  try {
    localStorage.setItem(PUSH_TOKEN_KEY, JSON.stringify(stored))
  } catch {
    // Storage indisponible — le token repartira au prochain registration.
  }
}

/** Envoie (ou renvoie) un token au serveur. Marque l'état local en
 * conséquence : le POST peut échouer parce que l'appareil n'a pas encore de
 * session (401) ou est hors ligne — dans ce cas pending=true pour un retry
 * au retour réseau. Si la table n'existe pas encore (migration non
 * appliquée), la route répond { ok, stored:false } : on considère la
 * synchronisation faite (le prochain registration réessaiera). */
export async function registerPushToken(token: string): Promise<void> {
  if (!token) return
  const platform = Capacitor.getPlatform()
  writeStoredToken({ token, platform, pending: true, updatedAt: new Date().toISOString() })
  try {
    const res = await fetch('/api/push-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    })
    if (!res.ok) return // pending reste true — retry au retour réseau
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
    if (data?.ok) {
      const stored = readStoredToken()
      if (stored && stored.token === token) {
        writeStoredToken({ ...stored, pending: false, updatedAt: new Date().toISOString() })
      }
    }
  } catch {
    // Hors ligne — pending reste true.
  }
}

/** Retente l'envoi d'un token resté en attente (appelé au retour réseau par
 * capacitor-provider). */
export async function syncPendingPushToken(): Promise<void> {
  const stored = readStoredToken()
  if (stored?.pending) await registerPushToken(stored.token)
}

// ---------------------------------------------------------------------------
// Mapping d'un push → NotificationInput (pur, testé)
// ---------------------------------------------------------------------------

const SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'error', 'reminder']
const PRIORITIES: NotificationPriority[] = ['low', 'normal', 'high', 'critical']
const CATEGORIES: NotificationCategory[] = [
  'vente', 'caisse', 'stock', 'depense', 'commande', 'tontine',
  'keiwa', 'production', 'formation', 'synchronisation', 'securite', 'systeme',
]

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export interface PushPayloadMapping {
  input: NotificationInput
  createdAt?: string
  serverId?: string
}

/** Traduit un PushNotificationSchema en NotificationInput du système in-app.
 * Le contenu vient d'abord de data (contrat julaba), avec repli sur le bloc
 * notification FCM. Retourne null si le push ne porte aucun contenu lisible
 * (silencieux pur, événement serveur interne…). */
export function mapPushPayload(notification: PushNotificationSchema): PushPayloadMapping | null {
  const data = (notification.data ?? {}) as Record<string, unknown>
  const title = str(data.title) ?? notification.title ?? ''
  const body = str(data.body) ?? notification.body ?? ''
  if (!title && !body) return null

  const input: NotificationInput = {
    type: str(data.type) ?? 'push',
    category: pick(data.category, CATEGORIES, 'systeme'),
    severity: pick(data.severity, SEVERITIES, 'info'),
    priority: pick(data.priority, PRIORITIES, 'normal'),
    title: title || 'Notification',
    body,
    deduplicationKey: str(data.deduplicationKey) ?? str(data.deduplication_key),
    actionLabel: str(data.actionLabel) ?? str(data.action_label),
    actionRoute: str(data.actionRoute) ?? str(data.action_route),
    metadata: { source: 'push' },
  }
  return {
    input,
    createdAt: str(data.createdAt),
    serverId: str(data.id),
  }
}

// ---------------------------------------------------------------------------
// Push reçu app ouverte
// ---------------------------------------------------------------------------

/** Un push est arrivé pendant que l'app tourne : l'intègre au feed (boîte
 * appareil, marquée synchronisée — le serveur possède déjà la ligne) et,
 * pour un message data-only, affiche le toast. Rafraîchit ensuite le
 * badge/centre sans attendre le prochain tick. */
export function handlePushReceived(notification: PushNotificationSchema): void {
  const mapped = mapPushPayload(notification)
  if (!mapped) return

  const created = addDeviceNotification(mapped.input)
  if (created) {
    // La copie appareil ne doit pas repartir au POST serveur (le serveur a
    // déjà créé la ligne qui a déclenché ce push).
    markDeviceNotificationsSynced([created.id])
  }

  // Message notification-only : le système a affiché la bannière native —
  // un toast sonner ajouterait un double bandeau. Data-only : rien n'a été
  // affiché par le système, le toast est le seul retour visible.
  if (!notification.title) {
    showNotificationToast(created ?? buildDeviceNotification(mapped.input))
  }

  void import('@/lib/stores/notifications-store')
    .then((m) => m.useNotificationsStore.getState().fetchNotifications())
    .catch(() => {})
}

// ---------------------------------------------------------------------------
// Tap sur une notification (push ou locale)
// ---------------------------------------------------------------------------

/** Navigue vers action_route si le payload (data du push, extra de la
 * notification locale) en porte une. Réutilise executeNotificationAction —
 * le même chemin que le centre et les toasts. */
export function handleNotificationTap(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const route = (payload as Record<string, unknown>).actionRoute
  if (typeof route !== 'string' || !route) return
  const notification: InAppNotification = {
    id: 'tap',
    type: 'notification_tap',
    category: 'systeme',
    severity: 'info',
    priority: 'normal',
    title: '',
    body: '',
    data: null,
    read: true,
    createdAt: new Date().toISOString(),
    actionRoute: route,
    origin: 'device',
  }
  void executeNotificationAction(notification)
}

// ---------------------------------------------------------------------------
// Initialisation (appelée par initCapacitorNative)
// ---------------------------------------------------------------------------

/** Met en place canaux + listeners push et tap local. No-op sur web.
 * Retourne un cleanup qui retire les listeners (pattern initCapacitorNative). */
export function initNativeNotifications(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  let cancelled = false
  const cleanups: Array<() => void> = []
  // Capacitor's Android push plugin throws synchronously when Firebase has no
  // default app (the usual state before google-services.json is installed).
  // Do not call it on Android until native FCM credentials are provisioned.
  const pushEnabled = Capacitor.getPlatform() !== 'android'

  void createNotificationChannels()

  // Tap sur une notification LOCALE planifiée (rappels clôture/tontine,
  // miroir des arrivées du watcher) — extra.actionRoute → navigation.
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      if (!cancelled) handleNotificationTap(action.notification?.extra)
    }).then((h) => cleanups.push(() => h.remove()))
  } catch { /* plugin not available on this device */ }

  // Push : permission Android 13+ puis register. Les listeners sont posés
  // AVANT register pour ne pas rater l'événement 'registration'.
  if (!pushEnabled) {
    return () => {
      cancelled = true
    }
  }

  void (async () => {
    try {
      let status = await PushNotifications.checkPermissions()
      if (status.receive === 'prompt' && !cancelled) {
        status = await PushNotifications.requestPermissions()
      }
      if (status.receive !== 'granted' || cancelled) return

      const handles = await Promise.all([
        PushNotifications.addListener('registration', (token) => {
          if (!cancelled) void registerPushToken(token.value)
        }),
        PushNotifications.addListener('registrationError', (error) => {
          // Cas attendu : google-services.json absent (FCM non configuré) —
          // l'app fonctionne sans push, le centre in-app reste complet.
          // Pas de métrique dédiée (les événements métriques sont centrés
          // affichage) : un log discret suffit au diagnostic.
          if (typeof console !== 'undefined') {
            console.info('[push] registration error (FCM configuré ?)', error.error)
          }
        }),
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          if (!cancelled) handlePushReceived(notification)
        }),
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          if (!cancelled) handleNotificationTap(action.notification?.data)
        }),
      ])
      if (cancelled) {
        await Promise.all(handles.map((h) => h.remove()))
        return
      }
      handles.forEach((h) => cleanups.push(() => h.remove()))
      await PushNotifications.register()
    } catch {
      // Best-effort — push indisponible, le reste de l'app ne dépend jamais
      // de cette initialisation.
    }
  })()

  return () => {
    cancelled = true
    cleanups.forEach((fn) => fn())
  }
}
