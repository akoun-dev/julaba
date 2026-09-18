import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Natif simulé : isNativePlatform true pour couvrir les fonctions de
// synchronisation (les fonctions pures ne s'en soucient pas).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: vi.fn(async () => ({ notifications: [] })),
    cancel: vi.fn(async () => {}),
    getPending: vi.fn(async () => ({ notifications: [] })),
  },
}))

// notification-local partiel : idFor réel (ids stables attendus), permission
// forcée accordée (contrôlée test par test). Le chemin remonte de DEUX
// niveaux : le module vit à src/lib/, pas dans notifications/.
vi.mock('../../notification-local', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../notification-local')>()
  return {
    ...actual,
    ensureLocalDisplayPermission: vi.fn(async () => true),
  }
})

// Préférences : contrôlées test par test (défaut = rien de masqué).
vi.mock('../preferences', () => ({
  isNotificationHiddenForPrefs: vi.fn(() => false),
}))

import { LocalNotifications } from '@capacitor/local-notifications'
import { ensureLocalDisplayPermission } from '../../notification-local'
import { isNotificationHiddenForPrefs } from '../preferences'
import {
  CLOSING_REMINDER_ID,
  TONTINE_REMINDER_HOUR,
  buildTontineReminders,
  closingReminderInput,
  nextDailyAt,
  syncClosingReminder,
  syncTontineReminders,
  type TontineReminderSource,
} from '../schedule'

const scheduleMock = vi.mocked(LocalNotifications.schedule)
const cancelMock = vi.mocked(LocalNotifications.cancel)
const permissionMock = vi.mocked(ensureLocalDisplayPermission)
const prefsHiddenMock = vi.mocked(isNotificationHiddenForPrefs)

const store = new Map<string, string>()

function stubLocalStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
}

beforeEach(() => {
  store.clear()
  stubLocalStorage()
  scheduleMock.mockClear()
  cancelMock.mockClear()
  permissionMock.mockClear()
  permissionMock.mockResolvedValue(true)
  prefsHiddenMock.mockClear()
  prefsHiddenMock.mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nextDailyAt', () => {
  it('renvoie 19h le jour même si l\u2019heure n\u2019est pas passée', () => {
    const now = new Date(2026, 8, 18, 10, 30)
    const next = nextDailyAt(19, 0, now)
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(8)
    expect(next.getDate()).toBe(18)
    expect(next.getHours()).toBe(19)
    expect(next.getMinutes()).toBe(0)
    expect(next.getSeconds()).toBe(0)
  })

  it('renvoie 19h le lendemain si 19h est passée (ou pile maintenant)', () => {
    for (const h of [19, 20, 23]) {
      const now = new Date(2026, 8, 18, h, 0)
      const next = nextDailyAt(19, 0, now)
      expect(next.getDate()).toBe(19)
      expect(next.getHours()).toBe(19)
    }
  })
})

describe('closingReminderInput', () => {
  it('porte une dédup journalière cohérente avec la fabrique in-app', () => {
    const input = closingReminderInput(new Date(2026, 8, 18, 12, 0))
    expect(input.category).toBe('caisse')
    expect(input.severity).toBe('reminder')
    expect(input.actionRoute).toBe('caisse')
    expect(input.deduplicationKey).toBe('caisse:not-closed:2026-09-18')
  })
})

describe('buildTontineReminders', () => {
  const tontine: TontineReminderSource = { id: 't1', name: 'Solidarité', amount: 5000, nextDueDate: '2026-09-19' }

  it('planifie J-J et J-1 à 8h pour une échéance de demain (7h du matin)', () => {
    const now = new Date(2026, 8, 18, 7, 0)
    const reminders = buildTontineReminders([tontine], now)
    expect(reminders).toHaveLength(2)

    const due = reminders.find((r) => (r.extra as { deduplicationKey: string }).deduplicationKey === 'tontine:t1:due:2026-09-19')
    const dayBefore = reminders.find((r) => (r.extra as { deduplicationKey: string }).deduplicationKey === 'tontine:t1:due-1d:2026-09-18')
    expect(due).toBeDefined()
    expect(dayBefore).toBeDefined()

    expect(due!.schedule!.at!.getDate()).toBe(19)
    expect(due!.schedule!.at!.getHours()).toBe(TONTINE_REMINDER_HOUR)
    expect(dayBefore!.schedule!.at!.getDate()).toBe(18)
    expect(dayBefore!.schedule!.at!.getHours()).toBe(TONTINE_REMINDER_HOUR)
  })

  it('n\u2019expose pas le montant brut mais le montant formaté dans le corps', () => {
    const reminders = buildTontineReminders([tontine], new Date(2026, 8, 18, 7, 0))
    for (const r of reminders) {
      expect(r.body).toContain('Solidarité')
      expect(r.body).toContain(tontine.amount.toLocaleString('fr-FR'))
      expect(r.body).toContain('FCFA')
    }
  })

  it('échéance aujourd\u2019hui avant 8h → rappel J-J uniquement', () => {
    const now = new Date(2026, 8, 18, 6, 59)
    const reminders = buildTontineReminders([{ ...tontine, nextDueDate: '2026-09-18' }], now)
    expect(reminders).toHaveLength(1)
    expect(reminders[0].schedule!.at!.getDate()).toBe(18)
    expect((reminders[0].extra as { deduplicationKey: string }).deduplicationKey).toBe('tontine:t1:due:2026-09-18')
  })

  it('échéance aujourd\u2019hui après 8h → plus rien (rappel dépassé)', () => {
    const now = new Date(2026, 8, 18, 9, 0)
    expect(buildTontineReminders([{ ...tontine, nextDueDate: '2026-09-18' }], now)).toHaveLength(0)
  })

  it('échéance passée ou absente → aucun rappel', () => {
    const now = new Date(2026, 8, 18, 9, 0)
    expect(buildTontineReminders([{ ...tontine, nextDueDate: '2026-09-17' }], now)).toHaveLength(0)
    expect(buildTontineReminders([{ ...tontine, nextDueDate: null }], now)).toHaveLength(0)
    expect(buildTontineReminders([], now)).toHaveLength(0)
  })

  it('gère une échéance lointaine (J-1 futur) et des ids stables', () => {
    const now = new Date(2026, 8, 18, 10, 0)
    const far: TontineReminderSource = { id: 't2', name: 'Tontine lointaine', amount: 2000, nextDueDate: '2026-10-01' }
    const reminders = buildTontineReminders([far], now)
    expect(reminders).toHaveLength(2)
    const again = buildTontineReminders([far], now)
    expect(reminders.map((r) => r.id)).toEqual(again.map((r) => r.id))
    for (const r of reminders) {
      expect(r.isExactNotification).toBe(false)
      expect(r.channelId).toBe('julaba-important')
      expect((r.extra as { actionRoute: string }).actionRoute).toBe('tontines')
    }
  })
})

describe('syncClosingReminder', () => {
  it('annule le rappel quand la caisse est fermée', async () => {
    await syncClosingReminder(false)
    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: CLOSING_REMINDER_ID }] })
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  it('programme une notification quotidienne inexacte à 19h quand la caisse est ouverte', async () => {
    await syncClosingReminder(true)
    expect(scheduleMock).toHaveBeenCalledTimes(1)
    const notif = scheduleMock.mock.calls[0][0].notifications[0]
    expect(notif.id).toBe(CLOSING_REMINDER_ID)
    expect(notif.schedule!.at!.getHours()).toBe(19)
    expect(notif.schedule!.repeats).toBe(true)
    expect(notif.schedule!.allowWhileIdle).toBe(true)
    expect(notif.isExactNotification).toBe(false)
    expect(notif.channelId).toBe('julaba-important')
    expect((notif.extra as { actionRoute: string }).actionRoute).toBe('caisse')
  })

  it('respecte la préférence « caisse masquée » : cancel, pas de planification', async () => {
    prefsHiddenMock.mockReturnValue(true)
    await syncClosingReminder(true)
    expect(scheduleMock).not.toHaveBeenCalled()
    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: CLOSING_REMINDER_ID }] })
  })

  it('ne fait rien sans permission d\u2019affichage', async () => {
    permissionMock.mockResolvedValue(false)
    await syncClosingReminder(true)
    expect(scheduleMock).not.toHaveBeenCalled()
    expect(cancelMock).not.toHaveBeenCalled()
  })
})

// `now` injecté : les rappels dépendent de la date du jour (J-1/J-J) — sans
// injection, ces tests dériveraient dès que le calendrier réel dépasse
// l'échéance codée en dur.
const NOW = new Date(2026, 8, 18, 7, 0)

describe('syncTontineReminders', () => {
  it('programme les rappels désirés et écrit l\u2019index local', async () => {
    await syncTontineReminders([{ id: 't1', name: 'Solidarité', amount: 5000, nextDueDate: '2026-09-19' }], NOW)
    expect(scheduleMock).toHaveBeenCalledTimes(1)
    expect(scheduleMock.mock.calls[0][0].notifications).toHaveLength(2)
    const index = JSON.parse(store.get('julaba-tontine-reminders-v1')!) as number[]
    expect(index).toHaveLength(2)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('annule les rappels obsolètes au recalcul suivant', async () => {
    await syncTontineReminders([{ id: 't1', name: 'Solidarité', amount: 5000, nextDueDate: '2026-09-19' }], NOW)
    scheduleMock.mockClear()

    // La tontine n'a plus d'échéance : tout doit être annulé, index vidé.
    await syncTontineReminders([{ id: 't1', name: 'Solidarité', amount: 5000, nextDueDate: null }], NOW)
    expect(scheduleMock).not.toHaveBeenCalled()
    expect(cancelMock).toHaveBeenCalledTimes(1)
    const cancelled = cancelMock.mock.calls[0][0].notifications.map((n) => n.id)
    expect(cancelled).toHaveLength(2)
    expect(JSON.parse(store.get('julaba-tontine-reminders-v1')!)).toEqual([])
  })

  it('ne fait rien sans permission d\u2019affichage', async () => {
    permissionMock.mockResolvedValue(false)
    await syncTontineReminders([{ id: 't1', name: 'Solidarité', amount: 5000, nextDueDate: '2026-09-19' }], NOW)
    expect(scheduleMock).not.toHaveBeenCalled()
    expect(store.get('julaba-tontine-reminders-v1')).toBeUndefined()
  })
})
