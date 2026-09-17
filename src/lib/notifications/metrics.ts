// Métriques de notifications (§9 de la spec) — compteurs agrégés locaux,
// sans donnée sensible : jamais de PIN, mot de passe, corps de texte ou
// contenu vocal. On ne retient que l'événement, la catégorie et la
// sévérité — de quoi mesurer taux de lecture, temps moyen avant lecture,
// usage des actions et catégories les plus utiles sans stocker quoi que ce
// soit de personnel.

import type { NotificationCategory, NotificationSeverity } from './types'

const METRICS_KEY = 'julaba-notif-metrics-v1'
const MAX_ENTRIES = 500

export type NotificationMetricEvent =
  | 'created'
  | 'displayed'
  | 'opened'
  | 'read'
  | 'read_all'
  | 'deleted'
  | 'action_executed'
  | 'ignored'
  | 'expired'
  | 'navigation_failed'

export interface NotificationMetricEntry {
  event: NotificationMetricEvent
  category?: NotificationCategory
  severity?: NotificationSeverity
  /** Date de création de la notification concernée — permet de calculer le
   * délai avant lecture sans stocker ni l'identifiant ni le contenu. */
  createdAt?: string
  at: string
}

export interface NotificationMetrics {
  entries: NotificationMetricEntry[]
}

function readMetrics(): NotificationMetrics {
  try {
    const raw = localStorage.getItem(METRICS_KEY)
    if (!raw) return { entries: [] }
    const parsed = JSON.parse(raw) as NotificationMetrics
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] }
  } catch {
    return { entries: [] }
  }
}

function writeMetrics(metrics: NotificationMetrics): void {
  try {
    // Cap FIFO — les compteurs agrégés servent au diagnostic, pas à l'audit.
    const trimmed = metrics.entries.slice(-MAX_ENTRIES)
    localStorage.setItem(METRICS_KEY, JSON.stringify({ entries: trimmed }))
  } catch {
    // Best-effort.
  }
}

export function trackNotificationMetric(
  event: NotificationMetricEvent,
  context?: { category?: NotificationCategory; severity?: NotificationSeverity; createdAt?: string },
): void {
  const metrics = readMetrics()
  metrics.entries.push({
    event,
    category: context?.category,
    severity: context?.severity,
    createdAt: context?.createdAt,
    at: new Date().toISOString(),
  })
  writeMetrics(metrics)
}

export function getNotificationMetrics(): NotificationMetrics {
  return readMetrics()
}

/** Agrégats prêts à l'affichage (paramétrage produit, pas data science). */
export function summarizeNotificationMetrics(): {
  created: number
  opened: number
  read: number
  actionExecuted: number
  ignored: number
  expired: number
  navigationFailed: number
  /** Délai moyen (secondes) entre création et lecture, si mesurable. */
  averageReadDelaySeconds: number | null
  /** Taux d'ouverture des notifications lues. */
  openRate: number | null
} {
  const { entries } = readMetrics()
  const count = (event: NotificationMetricEvent) => entries.filter((e) => e.event === event).length
  const readEntries = entries.filter((e) => e.event === 'read' && e.createdAt)
  const delays = readEntries
    .map((e) => (new Date(e.at).getTime() - new Date(e.createdAt!).getTime()) / 1000)
    .filter((s) => s >= 0)
  const opened = count('opened')
  const read = count('read')
  return {
    created: count('created'),
    opened,
    read,
    actionExecuted: count('action_executed'),
    ignored: count('ignored'),
    expired: count('expired'),
    navigationFailed: count('navigation_failed'),
    averageReadDelaySeconds: delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    openRate: read > 0 ? opened / read : null,
  }
}

/** Usage des catégories : laquelle génère le plus d'ouvertures — utile pour
 * réordonner les filtres du centre un jour. */
export function categoryUsageMetrics(): Array<{ category: NotificationCategory; opened: number; read: number }> {
  const { entries } = readMetrics()
  const map = new Map<NotificationCategory, { opened: number; read: number }>()
  for (const e of entries) {
    if (!e.category) continue
    const slot = map.get(e.category) ?? { opened: 0, read: 0 }
    if (e.event === 'opened') slot.opened += 1
    if (e.event === 'read') slot.read += 1
    map.set(e.category, slot)
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.opened - a.opened)
}
