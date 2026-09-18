// Rappels planifiés en notifications LOCALES (Task 29) — la pièce qui
// manquait identifiée en Task 28 : « les déclencheurs existent, il faut un
// scheduler ». Contrairement aux notifications in-app (app ouverte) et au
// push (serveur), une notification locale est déclenchée par l'OS même quand
// l'app est fermée — le bon outil pour deux rappels à heure fixe :
//
//   1. RAPPEL DE CLÔTURE DE CAISSE (19h) — le trigger existant
//      (home-screen, hour >= 19) ne voit que l'app ouverte sur l'accueil ;
//      ici une notification quotidienne récurrente est programmée tant qu'une
//      session de caisse est ouverte, et annulée à la fermeture. Le watcher
//      s'abonne à l'état de la caisse et appelle syncClosingReminder().
//
//   2. ÉCHÉANCES DE TONTINE — J-1 et J-J à 8h, recalculés à chaque
//      chargement de la liste (TontinesScreen) : les rappels obsolètes sont
//      annulés, les nouveaux programmés (syncTontineReminders).
//
// Choix techniques assumés :
//   • isExactNotification: false — une livraison « vers 8h » / « vers 19h »
//     n'exige pas une alarme exacte ; surtout, depuis la v8.3.0 la valeur
//     par défaut (true) ouvrirait l'écran système « Alarmes & rappels » sur
//     Android 12+ au moment de programmer. Inexact = silencieux pour
//     l'utilisateur, déferral possible en Doze : acceptable pour un rappel.
//   • allowWhileIdle: true — limite la dériver en Doze (sans exiger la
//     permission d'alarmes exactes).
//   • Rien n'est planifié si l'utilisateur a masqué la catégorie dans ses
//     préférences (isNotificationHiddenForPrefs) — évalué au moment de la
//     programmation ; un changement de préférence s'applique au prochain
//     recalcul (chargement de la liste / ouverture-fermeture de caisse).
//   • Best-effort : tout échec est avalé, l'écran et le trigger in-app
//     existants restent la source de vérité.

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { LocalNotificationSchema } from '@capacitor/local-notifications'
import { ensureLocalDisplayPermission, idFor } from '../notification-local'
import { channelIdFor } from './channels'
import { isNotificationHiddenForPrefs } from './preferences'
import type { NotificationInput } from './types'

// ---------------------------------------------------------------------------
// Rappel de clôture de caisse (19h)
// ---------------------------------------------------------------------------

export const CLOSING_REMINDER_ID = idFor('julaba:caisse:closing-reminder')

/** Prochaine occurrence d'une heure fixe quotidienne (heure locale).
 * Pure — testée. */
export function nextDailyAt(hour: number, minute: number, now: Date): Date {
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

/** Contenu du rappel de clôture — même dédup journalière que la fabrique
 * caisseNotClosedInput (events.ts) pour que le trigger in-app et le rappel
 * natif racontent la même histoire. */
export function closingReminderInput(now: Date = new Date()): NotificationInput {
  return {
    type: 'caisse_not_closed',
    category: 'caisse',
    severity: 'reminder',
    priority: 'high',
    title: 'Clôture de caisse',
    body: 'Votre caisse est encore ouverte — pensez à la clôturer pour terminer la journée.',
    deduplicationKey: `caisse:not-closed:${now.toISOString().slice(0, 10)}`,
    actionLabel: 'Ouvrir la caisse',
    actionRoute: 'caisse',
  }
}

/** Programme (open) ou annule (!open) le rappel quotidien de clôture.
 * Appelé par le watcher à chaque changement d'état de la caisse. */
export async function syncClosingReminder(open: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!(await ensureLocalDisplayPermission())) return
  try {
    if (!open || isNotificationHiddenForPrefs({ category: 'caisse', severity: 'reminder', priority: 'high' })) {
      await LocalNotifications.cancel({ notifications: [{ id: CLOSING_REMINDER_ID }] })
      return
    }
    const input = closingReminderInput()
    // Re-programme proprement : annule l'occurrence précédente (l'heure de
    // référence repart de maintenant, pas d'un état programmé il y a X j).
    await LocalNotifications.cancel({ notifications: [{ id: CLOSING_REMINDER_ID }] })
    await LocalNotifications.schedule({
      notifications: [{
        id: CLOSING_REMINDER_ID,
        title: input.title,
        body: input.body,
        channelId: channelIdFor('reminder', input.priority),
        extra: {
          actionRoute: input.actionRoute,
          actionLabel: input.actionLabel,
          deduplicationKey: input.deduplicationKey,
          category: input.category,
        },
        schedule: { at: nextDailyAt(19, 0, new Date()), repeats: true, allowWhileIdle: true },
        isExactNotification: false,
      }],
    })
  } catch {
    // Best-effort — le rappel in-app (home-screen) continue d'exister.
  }
}

// ---------------------------------------------------------------------------
// Échéances de tontine (J-1 et J-J à 8h)
// ---------------------------------------------------------------------------

export const TONTINE_REMINDER_HOUR = 8

/** MinimalShape attendu — aligné sur TontineData de l'écran (nextDueDate est
 * la seule date d'échéance disponible côté client aujourd'hui). */
export interface TontineReminderSource {
  id: string
  name: string
  amount: number
  nextDueDate: string | null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Parse « YYYY-MM-DD[THH:mm…] » en DATE LOCALE (new Date('2026-09-20') seul
 * serait UTC — minuit UTC peut tomber la veille en Côte d'Ivoire n'est pas
 * concernée (UTC+0) mais le code doit rester correct partout). */
function parseLocalDay(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (m) return startOfDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : startOfDay(d)
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function tontineReminder(t: TontineReminderSource, at: Date, kind: 'due' | 'due-1d'): LocalNotificationSchema {
  const amountLabel = `${t.amount.toLocaleString('fr-FR')} FCFA`
  const dueLabel = at.toLocaleDateString('fr-FR')
  return {
    id: idFor(`tontine:${t.id}:${kind}`),
    title: kind === 'due' ? 'Échéance de tontine' : 'Cotisation attendue demain',
    body: kind === 'due'
      ? `« ${t.name} » : cotisation de ${amountLabel} attendue aujourd'hui.`
      : `« ${t.name} » : cotisation de ${amountLabel} attendue demain (${dueLabel}).`,
    channelId: channelIdFor('reminder', 'normal'),
    extra: {
      kind: 'tontine-reminder',
      tontineId: t.id,
      tontineName: t.name,
      deduplicationKey: `tontine:${t.id}:${kind}:${ymd(at)}`,
      actionRoute: 'tontines',
      actionLabel: 'Voir la tontine',
      category: 'tontine',
    },
    schedule: { at, allowWhileIdle: true },
    isExactNotification: false,
  }
}

/** Calcule les rappels à programmer pour les échéances connues. Pur —
 * testée. Règles :
 *   • échéance passée → aucun rappel ;
 *   • échéance aujourd'hui → rappel J-J seulement si 8h pas encore passées ;
 *   • sinon → rappel J-J (à 8h le jour même) + rappel J-1 (à 8h la veille,
 *     seulement si cette veille est encore à venir). */
export function buildTontineReminders(tontines: TontineReminderSource[], now: Date = new Date()): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = []
  const todayStart = startOfDay(now)
  for (const t of tontines) {
    const dueDay = parseLocalDay(t.nextDueDate)
    if (!dueDay) continue
    const diffDays = Math.round((dueDay.getTime() - todayStart.getTime()) / 86_400_000)
    if (diffDays < 0) continue
    if (diffDays === 0) {
      if (now.getHours() >= TONTINE_REMINDER_HOUR) continue
      out.push(tontineReminder(t, new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate(), TONTINE_REMINDER_HOUR), 'due'))
      continue
    }
    out.push(tontineReminder(t, new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate(), TONTINE_REMINDER_HOUR), 'due'))
    const dayBefore = new Date(dueDay)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dayBeforeIsUpcoming =
      dayBefore.getTime() > todayStart.getTime() ||
      (dayBefore.getTime() === todayStart.getTime() && now.getHours() < TONTINE_REMINDER_HOUR)
    if (dayBeforeIsUpcoming) {
      out.push(tontineReminder(t, new Date(dayBefore.getFullYear(), dayBefore.getMonth(), dayBefore.getDate(), TONTINE_REMINDER_HOUR), 'due-1d'))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Synchronisation des rappels de tontine
// ---------------------------------------------------------------------------

const TONTINE_INDEX_KEY = 'julaba-tontine-reminders-v1'

/** Ids des rappels de tontine actuellement programmés (index local — les ids
 * sont des entiers hachés, impossible de les reconnaître via getPending). */
function readTontineIndex(): number[] {
  try {
    const raw = localStorage.getItem(TONTINE_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

function writeTontineIndex(ids: number[]): void {
  try {
    localStorage.setItem(TONTINE_INDEX_KEY, JSON.stringify(ids))
  } catch {
    // Storage indisponible — la prochaine sync replanifiera tout.
  }
}

/** Recalcule l'ensemble des rappels de tontine : annule ceux qui ne sont
 * plus désirés (échéance passée, tontine supprimée, date modifiée), programme
 * les nouveaux. Appelé à chaque chargement de TontinesScreen. `now` est
 * injectable pour des tests déterministes (la version réelle utilise
 * l'heure courante). */
export async function syncTontineReminders(tontines: TontineReminderSource[], now: Date = new Date()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!(await ensureLocalDisplayPermission())) return
  try {
    const desired = buildTontineReminders(tontines, now).filter((n) => {
      const extra = n.extra as { category?: string } | undefined
      if (extra?.category === 'tontine' && isNotificationHiddenForPrefs({ category: 'tontine', severity: 'reminder', priority: 'normal' })) {
        return false
      }
      return true
    })

    const previousIds = readTontineIndex()
    const keepIds = new Set(desired.map((n) => n.id))
    const stale = previousIds.filter((id) => !keepIds.has(id))
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) })
    }
    // Schedule avec un id déjà programmé remplace la précédente : re-schedule
    // systématique pour rafraîchir contenu et horaire.
    if (desired.length > 0) {
      await LocalNotifications.schedule({ notifications: desired })
    }
    writeTontineIndex(desired.map((n) => n.id))
  } catch {
    // Best-effort — l'écran tontines reste le point d'entrée de vérité.
  }
}
