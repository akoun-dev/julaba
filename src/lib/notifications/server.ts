// Création de notifications côté serveur (Task 28) — extension du module
// historique : mêmes signatures pour les 10 appelants existants, avec en
// plus sévérité, catégorie, priorité, clé de déduplication, expiration,
// action de navigation et métadonnées. La déduplication est portée par la
// contrainte SQL (subject, deduplication_key) — un retry réseau ou un
// événement rejoué ne crée plus de doublon (ON CONFLICT DO NOTHING).
//
// Best-effort, comme avant : une notification est toujours un effet
// secondaire d'une vraie action qui doit réussir sans elle. Jamais de throw.
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { subjectFor, type DeviceSubjectType } from '@/lib/device-session'
import { sendNotificationSignal } from './server-signal'
import type { NotificationCategory, NotificationSeverity, NotificationPriority } from './types'

export type NotificationType =
  | 'bienvenue'
  | 'sync_conflict'
  | 'dossier_valide'
  | 'dossier_rejete'
  | 'dossier_info_demandee'
  | 'tontine_cotisation'
  | 'tontine_creation'
  | 'commande_recue'
  | 'supplier_order'
  | 'stock_reception'
  | 'keiwa_transaction'
  | 'annonce'
  // MODE-921 — module coopérative (adhésion, stock commun, besoins).
  | 'cooperative_info'

/** Sévérité par défaut des types historiques — les appelants qui ne
 * précisent pas la sévérité héritent d'un rendu correct dans le centre. */
const DEFAULT_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  bienvenue: 'info',
  sync_conflict: 'error',
  dossier_valide: 'success',
  dossier_rejete: 'error',
  dossier_info_demandee: 'reminder',
  tontine_cotisation: 'success',
  tontine_creation: 'success',
  commande_recue: 'success',
  supplier_order: 'info',
  stock_reception: 'success',
  keiwa_transaction: 'info',
  annonce: 'info',
  cooperative_info: 'info',
}

/** Catégorie métier par défaut des types historiques. */
const DEFAULT_CATEGORY: Record<NotificationType, NotificationCategory> = {
  bienvenue: 'securite',
  sync_conflict: 'synchronisation',
  dossier_valide: 'systeme',
  dossier_rejete: 'systeme',
  dossier_info_demandee: 'systeme',
  tontine_cotisation: 'tontine',
  tontine_creation: 'tontine',
  commande_recue: 'commande',
  supplier_order: 'commande',
  stock_reception: 'commande',
  keiwa_transaction: 'keiwa',
  annonce: 'systeme',
  cooperative_info: 'systeme',
}

const DEFAULT_PRIORITY: Partial<Record<NotificationType, NotificationPriority>> = {
  sync_conflict: 'high',
  dossier_rejete: 'high',
  bienvenue: 'high',
}

export interface CreateNotificationOptions {
  subjectType: DeviceSubjectType
  subjectId: string
  type: NotificationType
  title: string
  body: string
  data?: unknown
  category?: NotificationCategory
  severity?: NotificationSeverity
  priority?: NotificationPriority
  deduplicationKey?: string
  expiresAt?: string
  actionLabel?: string
  actionRoute?: string
  actionData?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/** Insère la ligne avec déduplication SQL et envoie le signal Realtime si
 * la ligne est réellement créée. */
type InsertableNotification = Omit<CreateNotificationOptions, 'subjectType' | 'subjectId'>

/** La migration Task 28 (20260917160000) ajoute les colonnes enrichies.
 * Tant qu'elle n'est pas appliquée sur la DB cible, les inserts qui les
 * mentionnent échouent avec 42703 — on replie alors sur les colonnes
 * d'origine (le titre/corps passent, la sévérité est dérivée côté client
 * par le mapping du panneau). */
function isMissingColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return e?.code === '42703' || /column .* does not exist/i.test(e?.message ?? '')
}

async function insertNotification(subject: string, params: InsertableNotification): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const severity = params.severity ?? DEFAULT_SEVERITY[params.type] ?? 'info'
  const category = params.category ?? DEFAULT_CATEGORY[params.type] ?? 'systeme'
  const priority = params.priority ?? DEFAULT_PRIORITY[params.type] ?? 'normal'
  const payload: Record<string, unknown> = {
    subject,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data !== undefined ? JSON.stringify(params.data) : null,
    category,
    severity,
    priority,
  }
  if (params.deduplicationKey) payload.deduplication_key = params.deduplicationKey
  if (params.expiresAt) payload.expires_at = params.expiresAt
  if (params.actionLabel) payload.action_label = params.actionLabel
  if (params.actionRoute) payload.action_route = params.actionRoute
  if (params.actionData) payload.action_data = params.actionData
  if (params.metadata) payload.metadata = params.metadata

  const attempt = async (): Promise<{ data: Array<{ id: string }> | null; error: unknown }> => {
    if (params.deduplicationKey) {
      // Dédup serveur : un second insert avec la même clé ne crée rien.
      const { data, error } = await supabase
        .from('legacy_notifications')
        .upsert(payload, { onConflict: 'subject,deduplication_key', ignoreDuplicates: true })
        .select('id')
      return { data, error }
    }
    const { data, error } = await supabase
      .from('legacy_notifications')
      .insert(payload)
      .select('id')
    return { data, error }
  }

  const attemptLegacy = async (): Promise<{ data: Array<{ id: string }> | null; error: unknown }> => {
    const legacyPayload = { subject, type: params.type, title: params.title, body: params.body, data: payload.data as string | null }
    if (params.deduplicationKey) {
      const { data, error } = await supabase
        .from('legacy_notifications')
        .upsert(legacyPayload, { onConflict: 'subject,deduplication_key', ignoreDuplicates: true })
        .select('id')
      return { data, error }
    }
    return supabase.from('legacy_notifications').insert(legacyPayload).select('id')
  }

  try {
    let { data, error } = await attempt()
    if (error && isMissingColumnError(error)) {
      ;({ data, error } = await attemptLegacy())
    }
    if (error) {
      console.error('[notifications] failed to create', error)
      return
    }
    if (data && data.length > 0) {
      await sendNotificationSignal(subject)
    }
  } catch (err) {
    console.error('[notifications] failed to create', err)
  }
}

/**
 * Best-effort: a notification is always a secondary effect of some real
 * action (a claim, a validation, a contribution) that must succeed on its
 * own regardless of whether the notification gets written. Never throws —
 * call sites don't (and shouldn't) wrap this.
 */
export async function createNotification(params: CreateNotificationOptions): Promise<void> {
  try {
    await insertNotification(subjectFor(params.subjectType, params.subjectId), params)
  } catch (err) {
    console.error('[notifications] failed to create', err)
  }
}

/** Same as createNotification, but subject is already the "type:id" string
 * (e.g. from getDeviceSubject) — avoids re-splitting it at call sites that
 * already have it in that shape. */
export async function createNotificationForSubject(params: Omit<CreateNotificationOptions, 'subjectType' | 'subjectId'> & { subject: string }): Promise<void> {
  try {
    const { subject, ...rest } = params
    await insertNotification(subject, rest)
  } catch (err) {
    console.error('[notifications] failed to create', err)
  }
}
