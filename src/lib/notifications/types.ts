// Types du système de notifications in-app (Task 28).
//
// Le modèle étend la notification historique (id/type/title/body/data/read/
// createdAt — table legacy_notifications) sans rien lui retirer : les 11
// types métier existants (bienvenue, sync_conflict, dossier_valide, …)
// restent la colonne `type`, et les nouvelles dimensions (sévérité,
// catégorie, priorité, déduplication, expiration, action de navigation)
// s'y ajoutent. Tout ce qui est ici est pur : aucune dépendance à Supabase,
// au store ou au DOM, pour rester testable et réutilisable serveur + client.

/** Sévérité affichée (couleur, icône, durée de toast, comportement). */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'reminder'

/** Catégorie métier — pilote les filtres du centre et les préférences. */
export type NotificationCategory =
  | 'vente'
  | 'caisse'
  | 'stock'
  | 'depense'
  | 'commande'
  | 'tontine'
  | 'keiwa'
  | 'production'
  | 'formation'
  | 'synchronisation'
  | 'securite'
  | 'systeme'

/** Priorité — pilote l'ordre d'affichage et le comportement persistant. */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'

/** D'où vient la notification : le serveur (BO, routes métier) ou l'appareil
 * (action faite hors ligne, synchronisée vers Supabase plus tard). */
export type NotificationOrigin = 'server' | 'device'

export interface InAppNotification {
  id: string
  /** Type d'événement historique (bienvenue, sync_conflict, sale_created…). */
  type: string
  category: NotificationCategory
  severity: NotificationSeverity
  priority: NotificationPriority
  title: string
  body: string
  /** Payload libre historique (JSON en chaîne — compat legacy_notifications.data). */
  data: string | null
  read: boolean
  createdAt: string
  readAt?: string | null
  archivedAt?: string | null
  expiresAt?: string | null
  /** Clé stable anti-doublon, ex. `sale:{saleId}:created`. */
  deduplicationKey?: string | null
  /** Libellé de l'action principale (ex. « Voir le stock »). */
  actionLabel?: string | null
  /** Destination de navigation — une valeur de ScreenRoute (app-store). */
  actionRoute?: string | null
  /** Données passées à l'action (id de vente, id de produit…). */
  actionData?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  origin: NotificationOrigin
  /** origin='device' uniquement : déjà envoyé au serveur ? */
  synced?: boolean
}

/** Filtres du centre de notifications. */
export type NotificationFilter =
  | 'all'
  | 'unread'
  | NotificationCategory

/** Entrée de création — ce que les déclencheurs métier construisent. */
export interface NotificationInput {
  type: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body: string
  priority?: NotificationPriority
  deduplicationKey?: string
  actionLabel?: string
  actionRoute?: string
  actionData?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** Heure d'expiration — sinon déduite de la sévérité (rules.ts). */
  expiresAt?: string
}

/** Préférence par catégorie : tout afficher, seulement l'important, ou
 * (sauf sécurité) rien du tout. */
export type CategoryPref = 'on' | 'important' | 'off'

export interface NotificationPrefs {
  categories: Record<NotificationCategory, CategoryPref>
  /** Toasts pour les événements non critiques (les erreurs d'action
   * immédiate et la sécurité s'affichent quoi qu'il arrive). */
  toastsEnabled: boolean
  /** Conserver l'historique localement (sinon purge côté appareil à 7 j). */
  keepHistory: boolean
  /** Mode silencieux temporaire : pas de toast ni de voix jusqu'à cette
   * heure (ISO). Les critiques restent visibles dans le centre. */
  silentUntil: string | null
}
