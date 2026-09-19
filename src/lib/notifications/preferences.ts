// Préférences de notifications (v2) — par catégorie (on / important / off),
// toasts, historique, mode silencieux temporaire. Stockage localStorage par
// rôle + téléphone, comme le reste de l'app ; la v2 relit les anciennes
// préférences (profil marchand, toggles simples producteur/identificateur)
// pour que le muting déjà choisi par l'utilisateur reste respecté.

import { useAppStore } from '@/lib/stores/app-store'
import type { CategoryPref, NotificationCategory, NotificationPrefs, NotificationPriority, NotificationSeverity } from './types'
import { shouldDisplayNotification } from './rules'

const PREFS_KEY_PREFIX = 'julaba-notif-prefs-v2-'

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'vente', 'caisse', 'stock', 'depense', 'commande', 'tontine',
  'keiwa', 'production', 'formation', 'synchronisation', 'securite', 'systeme',
]

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  vente: 'Ventes',
  caisse: 'Caisse',
  stock: 'Stock',
  depense: 'Dépenses',
  commande: 'Commandes',
  tontine: 'Tontines',
  keiwa: 'Portefeuille Keiwa',
  production: 'Production et récoltes',
  formation: 'Formations',
  synchronisation: 'Synchronisation',
  securite: 'Sécurité',
  systeme: 'Système',
  // MODE-906 (§21-22) — crédit clients. Hors NOTIFICATION_CATEGORIES (le
  // périmètre affiché par rôle est figé à 12) : libellé présent pour le
  // centre de notifications, préférence non réglable = « on » par défaut.
  credit: 'Crédits clients',
}

export function categoryLabel(category: NotificationCategory): string {
  return CATEGORY_LABELS[category] ?? category
}

/** Catégories proposées selon le rôle : le producteur n'a ni tontines ni
 * Keiwa, l'identificateur encore moins — les écrans de préférences n'ont
 * pas à afficher des catégories qui ne peuvent jamais se déclencher. */
export function categoriesForRole(role: string): NotificationCategory[] {
  if (role === 'producteur') {
    return NOTIFICATION_CATEGORIES.filter((c) => c !== 'tontine' && c !== 'keiwa' && c !== 'caisse')
  }
  if (role === 'identificateur') {
    return ['synchronisation', 'securite', 'systeme'] as NotificationCategory[]
  }
  return NOTIFICATION_CATEGORIES
}

function defaultsForRole(role: string): NotificationPrefs {
  const categories = {} as NotificationPrefs['categories']
  for (const c of NOTIFICATION_CATEGORIES) categories[c] = 'on'
  void role // même défaut partout — les catégories inutiles sont juste cachées à l'écran
  return { categories, toastsEnabled: true, keepHistory: true, silentUntil: null }
}

function prefsKey(role: string, phone: string): string {
  return `${PREFS_KEY_PREFIX}${role}-${phone}`
}

/** Rétro-compatibilité : le marchand avait deux toggles dans son profil
 * (tontines, systeme) et producteur/identificateur un toggle « système ».
 * Les valeurs déjà choisies par l'utilisateur deviennent la v2 au premier
 * accès ; la v2 prend le relais dès qu'elle existe. */
function migrateLegacy(role: string, defaults: NotificationPrefs): NotificationPrefs {
  try {
    const state = useAppStore.getState()
    const phone = state.merchantPhone
    if (!phone) return defaults
    if (role === 'marchand') {
      const raw = localStorage.getItem(`julaba-profile-${phone}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        const legacy = parsed?.preferences?.notifications
        if (legacy) {
          if (legacy.tontines === false) defaults.categories.tontine = 'off'
          if (legacy.systeme === false) {
            defaults.categories.synchronisation = 'off'
            defaults.categories.systeme = 'off'
          }
        }
      }
    } else if (role === 'producteur' || role === 'identificateur') {
      const raw = localStorage.getItem(`julaba-notif-prefs-${role}-${phone}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.systeme === false) {
          defaults.categories.synchronisation = 'off'
          defaults.categories.systeme = 'off'
        }
      }
    }
  } catch {
    // Best-effort : des préférences illisibles ne doivent jamais casser le feed.
  }
  return defaults
}

/** Lit les préférences de l'utilisateur connecté (défauts + migration
 * legacy si la v2 n'existe pas encore). */
export function getNotificationPrefs(): NotificationPrefs {
  const state = useAppStore.getState()
  const role = state.userRole
  const phone = state.merchantPhone
  const defaults = defaultsForRole(role)
  if (!phone) return defaults
  try {
    const raw = localStorage.getItem(prefsKey(role, phone))
    if (!raw) return migrateLegacy(role, defaults)
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    const categories = { ...defaults.categories }
    if (parsed.categories) {
      for (const c of NOTIFICATION_CATEGORIES) {
        const v = parsed.categories[c]
        if (v === 'on' || v === 'important' || v === 'off') categories[c] = v
      }
    }
    return {
      categories,
      toastsEnabled: parsed.toastsEnabled !== false,
      keepHistory: parsed.keepHistory !== false,
      silentUntil: typeof parsed.silentUntil === 'string' ? parsed.silentUntil : null,
    }
  } catch {
    return defaults
  }
}

/** Écrit les préférences (best-effort — une écriture échouée ne doit jamais
 * casser une navigation). */
export function setNotificationPrefs(prefs: NotificationPrefs): void {
  const state = useAppStore.getState()
  const role = state.userRole
  const phone = state.merchantPhone
  if (!phone) return
  try {
    localStorage.setItem(prefsKey(role, phone), JSON.stringify(prefs))
  } catch {
    // Quota ou navigation privée : les préférences resteront par défaut.
  }
}

export function updateCategoryPref(category: NotificationCategory, pref: CategoryPref): NotificationPrefs {
  const prefs = getNotificationPrefs()
  prefs.categories[category] = pref
  setNotificationPrefs(prefs)
  return prefs
}

export function setToastsEnabled(enabled: boolean): NotificationPrefs {
  const prefs = getNotificationPrefs()
  prefs.toastsEnabled = enabled
  setNotificationPrefs(prefs)
  return prefs
}

export function setKeepHistory(keep: boolean): NotificationPrefs {
  const prefs = getNotificationPrefs()
  prefs.keepHistory = keep
  setNotificationPrefs(prefs)
  return prefs
}

/** Mode silencieux temporaire : jusqu'à une heure donnée (ISO) ou null pour
 * le désactiver. Les notifications critiques restent affichées. */
export function setSilentUntil(iso: string | null): NotificationPrefs {
  const prefs = getNotificationPrefs()
  prefs.silentUntil = iso
  setNotificationPrefs(prefs)
  return prefs
}

/** Réinitialisation aux valeurs par défaut du rôle. */
export function resetNotificationPrefs(): NotificationPrefs {
  const state = useAppStore.getState()
  const defaults = defaultsForRole(state.userRole)
  setNotificationPrefs(defaults)
  return defaults
}

/** Cette notification doit-elle être masquée compte tenu des préférences ?
 * Passerelle utilisée par le store et le watcher (le centre applique
 * directement shouldDisplayNotification). */
export function isNotificationHiddenForPrefs(
  n: { category: NotificationCategory; severity: NotificationSeverity; priority: NotificationPriority },
  forToast = false,
): boolean {
  const prefs = getNotificationPrefs()
  return !shouldDisplayNotification(n, prefs, { forToast })
}
