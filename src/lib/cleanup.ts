/**
 * Centralized localStorage cleanup utilities for logout and account deletion.
 * Ensures all user data is properly removed when switching accounts or deleting.
 */

const MERCHANT_KEYS = [
  'julaba-merchant-',
  'julaba-profile-',
  'julaba-last-name',
]

const IDENT_KEYS = [
  'julaba-ident-agent-',
]

const GLOBAL_KEYS = [
  'julaba-theme',
  'julaba-tts-engine',
]

const ZUSTAND_STORES = [
  'julaba-app-store',
  'julaba-caisse-store',
  'julaba-stock-store',
  'julaba-identificateur-store',
  'julaba-producteur-store',
  'julaba-backoffice-store',
]

function removeByPrefix(prefix: string): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) keys.push(key)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

function removeKeys(keys: string[]): void {
  keys.forEach((k) => localStorage.removeItem(k))
}

/**
 * Remove all merchant-specific data (auth, profile, session stores).
 * Called on logout or account deletion.
 */
export function cleanupMerchantData(phone?: string): void {
  if (phone) {
    const normalized = phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')
    localStorage.removeItem(`julaba-merchant-${normalized}`)
    localStorage.removeItem(`julaba-profile-${normalized}`)
  } else {
    removeByPrefix('julaba-merchant-')
    removeByPrefix('julaba-profile-')
  }
  localStorage.removeItem('julaba-last-name')
  localStorage.removeItem('julaba-caisse-store')
  localStorage.removeItem('julaba-stock-store')
}

/**
 * Remove all identificateur-specific data (auth, enrollment store).
 * Called on logout or account deletion.
 */
export function cleanupIdentData(phone?: string): void {
  if (phone) {
    const normalized = phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')
    localStorage.removeItem(`julaba-ident-agent-${normalized}`)
  } else {
    removeByPrefix('julaba-ident-agent-')
  }
  localStorage.removeItem('julaba-identificateur-store')
}

/**
 * Remove all producteur-specific data (auth, production store).
 * Called on logout.
 */
export function cleanupProducteurData(phone?: string): void {
  if (phone) {
    const normalized = phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')
    localStorage.removeItem(`julaba-prod-agent-${normalized}`)
  } else {
    removeByPrefix('julaba-prod-agent-')
  }
  localStorage.removeItem('julaba-producteur-store')
}

/**
 * Remove ALL app data including global preferences and Zustand stores.
 * Used for full account deletion or reset.
 */
export function cleanupAllData(): void {
  // Remove all role-specific keys
  removeByPrefix('julaba-merchant-')
  removeByPrefix('julaba-profile-')
  removeByPrefix('julaba-ident-agent-')
  removeByPrefix('julaba-prod-agent-')
  removeByPrefix('julaba-pins:')
  localStorage.removeItem('julaba-last-name')

  // Remove global keys
  removeKeys(GLOBAL_KEYS)

  // Remove all Zustand persisted stores
  removeKeys(ZUSTAND_STORES)
}

/**
 * Remove only the Zustand stores (role-specific data) but keep auth credentials.
 * Useful for "reset app data" without logging out.
 */
export function resetStoresOnly(): void {
  removeKeys(ZUSTAND_STORES)
}
