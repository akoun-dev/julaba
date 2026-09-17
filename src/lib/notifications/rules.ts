// Règles pures du système de notifications in-app : expiration,
// déduplication, filtrage par préférences, regroupement, tri, durées de
// toast. Aucune dépendance externe — tout est testable sans mock.

import type {
  InAppNotification,
  NotificationFilter,
  NotificationInput,
  NotificationPrefs,
  NotificationSeverity,
} from './types'

// ── Expiration ────────────────────────────────────────────────────────────
// Durées par défaut quand un déclencheur n'a pas fixé expiresAt : les
// succès courts s'effacent vite, la sécurité se conserve longtemps, les
// erreurs restent jusqu'à ce que l'utilisateur les résolve ou les archive.
export const DEFAULT_EXPIRY_MS: Record<NotificationSeverity, number> = {
  success: 24 * 60 * 60 * 1000, // 24 h — un succès a peu de valeur passée
  info: 2 * 24 * 60 * 60 * 1000, // 48 h
  reminder: 7 * 24 * 60 * 60 * 1000, // 7 j — lié à une échéance
  warning: 14 * 24 * 60 * 60 * 1000, // 14 j
  error: 30 * 24 * 60 * 60 * 1000, // 30 j — jusqu'à résolution ou archivage
}

/** Les notifications de sécurité (et tout ce qui est critique) ne doivent
 * jamais disparaître d'elles-mêmes avant lecture. */
export const SECURITY_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000 // 90 j

/** Complète une entrée de création avec l'expiration par défaut de sa
 * sévérité (les notifications de sécurité vivent 90 jours). */
export function withDefaultExpiry(input: NotificationInput, now: Date = new Date()): NotificationInput {
  if (input.expiresAt) return input
  const ms =
    input.category === 'securite'
      ? SECURITY_EXPIRY_MS
      : DEFAULT_EXPIRY_MS[input.severity]
  return { ...input, expiresAt: new Date(now.getTime() + ms).toISOString() }
}

/** Une notification expirée ne doit plus être visible ni comptée. Les
 * critiques et la sécurité ne s'expirent PAS avant lecture (critère 10) —
 * leur expiresAt ne s'applique qu'une fois lues. */
export function isExpired(n: Pick<InAppNotification, 'expiresAt' | 'read' | 'priority' | 'category'>, now: Date = new Date()): boolean {
  if (!n.expiresAt) return false
  if (!n.read && (n.priority === 'critical' || n.category === 'securite')) return false
  return new Date(n.expiresAt).getTime() <= now.getTime()
}

// ── Déduplication ─────────────────────────────────────────────────────────
/** Deux notifications avec la même clé de déduplication (non nulle) sont le
 * même événement : retries réseau, événements Realtime reçus plusieurs
 * fois, resynchronisations offline, rechargement de l'app, plusieurs
 * onglets. Sans clé (legacy), on compare (type, title, createdAt à la
 * seconde) — assez strict pour ne pas fusionner deux ventes distinctes. */
export function deduplicationKeyOf(n: Pick<InAppNotification, 'deduplicationKey' | 'type' | 'title' | 'createdAt'>): string {
  return n.deduplicationKey || `${n.type}|${n.title}|${Math.floor(new Date(n.createdAt).getTime() / 1000)}`
}

export function isDuplicateNotification(
  candidate: Pick<InAppNotification, 'deduplicationKey' | 'type' | 'title' | 'createdAt'>,
  existing: Array<Pick<InAppNotification, 'deduplicationKey' | 'type' | 'title' | 'createdAt'>>,
): boolean {
  const key = deduplicationKeyOf(candidate)
  return existing.some((n) => deduplicationKeyOf(n) === key)
}

/** Fusionne deux listes (ex. serveur + appareil) en supprimant les doublons
 * : le serveur gagne (source de vérité d'historique), l'appareil complète
 * (notifications pas encore synchronisées). Ordre conservé : serveur puis
 * appareil. */
export function mergeNotifications<T extends InAppNotification>(server: T[], device: T[]): T[] {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const n of [...server, ...device]) {
    const key = deduplicationKeyOf(n)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(n)
  }
  return merged
}

// ── Priorités et tri ──────────────────────────────────────────────────────
const PRIORITY_WEIGHT: Record<InAppNotification['priority'], number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
}

/** Ordre d'affichage du centre : critiques d'abord (indépendamment de la
 * date), puis par priorité, puis du plus récent au plus ancien. */
export function sortForDisplay<T extends InAppNotification>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = PRIORITY_WEIGHT[a.priority] ?? 1
    const pb = PRIORITY_WEIGHT[b.priority] ?? 1
    if (pa !== pb) return pb - pa
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Une notification critique reste visible jusqu'à lecture ou action — elle
 * n'est jamais supprimée automatiquement avant expiration et signalée par
 * un badge texte (pas seulement la couleur). */
export function isCritical(n: Pick<InAppNotification, 'priority' | 'category' | 'severity'>): boolean {
  return n.priority === 'critical' || (n.category === 'securite' && (n.severity === 'error' || n.severity === 'warning'))
}

// ── Préférences ───────────────────────────────────────────────────────────
/** La sécurité ne peut jamais être complètement muette : « off » est
 * dégradé en « important » (critère 8 de la spec, avertissement clair
 * affiché dans l'écran des préférences). */
export function effectiveCategoryPref(prefs: NotificationPrefs, category: InAppNotification['category']): NotificationPrefs['categories'][InAppNotification['category']] {
  const pref = prefs.categories[category] ?? 'on'
  if (category === 'securite' && pref === 'off') return 'important'
  return pref
}

function isSilent(prefs: NotificationPrefs, now: Date = new Date()): boolean {
  if (!prefs.silentUntil) return false
  return new Date(prefs.silentUntil).getTime() > now.getTime()
}

/** Cette notification doit-elle être affichée (centre, toast, voix, badge)
 * compte tenu des préférences ? Les erreurs nécessaires à la compréhension
 * d'une action (ex. « la vente n'a pas pu être enregistrée ») et tout ce
 * qui est critique passent toujours ; la sécurité est au minimum
 * « importante ». */
export function shouldDisplayNotification(
  n: Pick<InAppNotification, 'category' | 'severity' | 'priority'>,
  prefs: NotificationPrefs,
  options?: { forToast?: boolean; now?: Date },
): boolean {
  const now = options?.now ?? new Date()
  if (options?.forToast && isSilent(prefs, now)) return isCritical(n)
  if (isCritical(n)) return true

  const pref = effectiveCategoryPref(prefs, n.category)
  if (pref === 'off') return false
  if (pref === 'important') {
    return n.priority === 'high' || n.priority === 'critical' || n.severity === 'error'
  }

  // Pref « on » : en mode silencieux, seul le centre affiche (le toast et
  // la voix sont silence — la notification reste consultable).
  if (options?.forToast) return !isSilent(prefs, now)
  return true
}

// ── Durées de toast ───────────────────────────────────────────────────────
/** Durée d'affichage en ms — plus longue pour les erreurs (le temps de
 * lire le correctif), persistante pour le critique (durée Infinity →
 * l'utilisateur ferme lui-même). */
export function toastDurationFor(n: Pick<InAppNotification, 'severity' | 'priority'>): number {
  if (n.priority === 'critical') return Infinity
  switch (n.severity) {
    case 'error': return 10_000
    case 'warning': return 8_000
    case 'reminder': return 6_000
    case 'success': return 4_000
    case 'info':
    default: return 5_000
  }
}

// ── Filtrage du centre ────────────────────────────────────────────────────
export function filterNotifications<T extends InAppNotification>(
  list: T[],
  filter: NotificationFilter,
  prefs?: NotificationPrefs,
): T[] {
  return list.filter((n) => {
    if (n.archivedAt) return false
    if (isExpired(n)) return false
    if (prefs && !shouldDisplayNotification(n, prefs)) return false
    if (filter === 'unread') return !n.read
    if (filter !== 'all') return n.category === filter
    return true
  })
}

// ── Regroupement ──────────────────────────────────────────────────────────
export interface DateGroup<T> {
  label: string
  notifications: T[]
}

/** Regroupe par date pour le centre : Aujourd'hui / Hier / date lisible. */
export function groupNotificationsByDate<T extends InAppNotification>(list: T[], now: Date = new Date()): Array<DateGroup<T>> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const groups: Array<DateGroup<T>> = []
  let current: DateGroup<T> | null = null
  let currentLabel = ''

  const push = (label: string, n: T) => {
    if (label !== currentLabel || !current) {
      current = { label, notifications: [] }
      groups.push(current)
      currentLabel = label
    }
    current.notifications.push(n)
  }

  for (const n of list) {
    const t = new Date(n.createdAt).getTime()
    if (t >= startOfToday) push('Aujourd\u2019hui', n)
    else if (t >= startOfYesterday) push('Hier', n)
    else {
      const label = new Date(n.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      push(label, n)
    }
  }
  return groups
}

export interface GroupedNotification<T> {
  representative: T
  count: number
}

/** Regroupe les événements similaires (même catégorie + même préfixe de clé
 * de déduplication avant le premier « : ») quand ça améliore la lisibilité :
 * « 3 produits ont atteint le seuil de stock faible ». Les notifications
 * critiques et de sécurité ne sont JAMAIS regroupées (chacune doit être
 * lue individuellement). */
export function groupSimilarNotifications<T extends InAppNotification>(list: T[]): Array<GroupedNotification<T>> {
  const groups = new Map<string, GroupedNotification<T>>()
  const order: string[] = []
  for (const n of list) {
    if (isCritical(n)) {
      const key = `critical:${n.id}`
      groups.set(key, { representative: n, count: 1 })
      order.push(key)
      continue
    }
    const prefix = n.deduplicationKey ? n.deduplicationKey.split(':')[0] : `type:${n.type}`
    const key = `${n.category}|${n.severity}|${prefix}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      // Le plus récent représente le groupe (corps le plus à jour).
      if (new Date(n.createdAt).getTime() > new Date(existing.representative.createdAt).getTime()) {
        existing.representative = n
      }
    } else {
      groups.set(key, { representative: n, count: 1 })
      order.push(key)
    }
  }
  return order.map((key) => groups.get(key)!).filter(Boolean)
}

/** Libellé d'un groupe de notifications similaires — « 3 produits ont
 * atteint le seuil de stock faible » si le représentant fournit un
 * pluriel, sinon le titre simple. */
export function groupLabel<T extends InAppNotification>(group: GroupedNotification<T>): string {
  if (group.count <= 1) return group.representative.title
  const plural = group.representative.metadata?.groupTitlePlural
  if (typeof plural === 'string') return plural.replace('{count}', String(group.count))
  return `${group.representative.title} (×${group.count})`
}
