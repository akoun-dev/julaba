/**
 * Helpers de l'authentification de départ multi-utilisateurs
 * (marchand + producteur partagé, redirection selon le rôle détecté).
 *
 * Un seul cache local par compte (clé `julaba-account-<téléphone>`) porte le
 * rôle détecté au premier login réussi, ce qui permet :
 *  - de router directement vers le bon écran de code (PIN / schéma / visuel)
 *    au prochain lancement, même hors ligne ;
 *  - à plusieurs comptes de coexister sur le même appareil (une clé par
 *    téléphone) ;
 *  - au logout de ne purger que le compte courant.
 *
 * Ce module est volontairement PUR (aucun import Capacitor / secure-storage)
 * pour rester testable sous vitest (environment node). Le stockage est
 * injectable ; par défaut on retombe sur `localStorage` côté navigateur.
 */

export type AccountRole = 'marchand' | 'producteur'

export type AccountAuthMethod = 'pin' | 'pattern' | 'visual'

export interface StoredAccount {
  /** Rôle détecté au premier login (détermine la redirection post-login). */
  role: AccountRole
  id: string
  firstName: string
  phone: string
  pinHash: string
  patternHash?: string
  /** Marchand uniquement. */
  visualCodeHash?: string
  authMethod: AccountAuthMethod
  sexe?: 'masculin' | 'feminin' | 'autre' | null
}

/**
 * Normalise un numéro saisi : garde les chiffres et retire l'indicatif
 * Côte d'Ivoire « 225 » quand il est suivi du numéro national à 10 chiffres
 * commençant par 0 (ex. +225 07 01 02 03 04 → 0701020304).
 *
 * ⚠️ L'ancien pattern des écrans d'auth (`replace(/^(\+225)?/)` APRES avoir
 * retiré les non-chiffres) était une branche morte : le « + » disparait
 * d'abord, donc « 225 » restait collé au numéro et la découverte du compte
 * échouait. Ici le préfixe est testé sur la forme déjà réduite aux chiffres.
 */
export const normalizeAuthPhone = (phone: string): string => {
  const digits = phone.replace(/[^\d]/g, '')
  if (
    digits.length === 13 &&
    digits.startsWith('225') &&
    digits.startsWith('0', 3)
  ) {
    return digits.slice(3)
  }
  return digits
}

export const ACCOUNT_CACHE_PREFIX = 'julaba-account-'

/** Clé de cache legacy (marchand seul, avant l'entrée multiUser). */
export const LEGACY_MERCHANT_PREFIX = 'julaba-merchant-'

export const accountCacheKey = (phone: string): string =>
  `${ACCOUNT_CACHE_PREFIX}${normalizeAuthPhone(phone)}`

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const defaultStorage = (): StorageLike | null => {
  if (typeof globalThis !== 'undefined' && (globalThis as { localStorage?: StorageLike }).localStorage) {
    return (globalThis as { localStorage: StorageLike }).localStorage
  }
  return null
}

/**
 * Lit le compte mis en cache pour ce téléphone :
 * 1. cache unifié `julaba-account-<phone>` (marchand OU producteur) ;
 * 2. repli compatibilité sur l'ancien cache marchand `julaba-merchant-<phone>`
 *    (les appareils qui ont déjà servi à un login marchand gardent leur
 *    connexion hors ligne sans re-découverte du compte).
 */
export function loadStoredAccount(
  phone: string,
  storage: StorageLike | null = defaultStorage()
): StoredAccount | null {
  if (!storage) return null
  const normalized = normalizeAuthPhone(phone)
  if (!normalized) return null
  try {
    const unified = storage.getItem(accountCacheKey(normalized))
    if (unified) {
      const parsed = JSON.parse(unified) as StoredAccount
      if (parsed && (parsed.role === 'marchand' || parsed.role === 'producteur') && parsed.id) {
        return parsed
      }
    }
    const legacy = storage.getItem(`${LEGACY_MERCHANT_PREFIX}${normalized}`)
    if (legacy) {
      const parsed = JSON.parse(legacy) as Omit<StoredAccount, 'role'>
      if (parsed && parsed.id) return { ...parsed, role: 'marchand' }
    }
  } catch {
    // JSON corrompu → aucun compte exploitable, la découverte serveur prendra
    // le relais au prochain submit.
  }
  return null
}

/** Écrit (ou remplace) le cache unifié du compte. Best-effort côté appelant. */
export function saveStoredAccount(
  data: StoredAccount,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return
  const normalized = normalizeAuthPhone(data.phone)
  if (!normalized) return
  try {
    storage.setItem(accountCacheKey(normalized), JSON.stringify({ ...data, phone: normalized }))
  } catch {
    // Quota dépassé / stockage indisponible : le login serveur reste
    // fonctionnel, seul le mode hors ligne de CE compte est perdu.
  }
}

/** Supprime le cache unifié d'un téléphone (logout ciblé par compte). */
export function clearStoredAccount(
  phone: string,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return
  try {
    storage.removeItem(accountCacheKey(phone))
  } catch {
    /* noop */
  }
}
