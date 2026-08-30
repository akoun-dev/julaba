import { db } from '@/lib/db'
import { subjectFor, type DeviceSubjectType } from '@/lib/device-session'

export type NotificationType =
  | 'bienvenue'
  | 'sync_conflict'
  | 'dossier_valide'
  | 'dossier_rejete'
  | 'tontine_cotisation'
  | 'commande_recue'

/**
 * Best-effort: a notification is always a secondary effect of some real
 * action (a claim, a validation, a contribution) that must succeed on its
 * own regardless of whether the notification gets written. Never throws —
 * call sites don't (and shouldn't) wrap this.
 */
export async function createNotification(params: {
  subjectType: DeviceSubjectType
  subjectId: string
  type: NotificationType
  title: string
  body: string
  data?: unknown
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        subject: subjectFor(params.subjectType, params.subjectId),
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data !== undefined ? JSON.stringify(params.data) : null,
      },
    })
  } catch (err) {
    console.error('[notifications] failed to create', err)
  }
}

/** Same as createNotification, but subject is already the "type:id" string
 * (e.g. from getDeviceSubject) — avoids re-splitting it at call sites that
 * already have it in that shape. */
export async function createNotificationForSubject(params: {
  subject: string
  type: NotificationType
  title: string
  body: string
  data?: unknown
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        subject: params.subject,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data !== undefined ? JSON.stringify(params.data) : null,
      },
    })
  } catch (err) {
    console.error('[notifications] failed to create', err)
  }
}
