import { SecureStorage } from '@aparajita/capacitor-secure-storage'

/**
 * Encrypted storage for sensitive values (session tokens, hashed PINs) —
 * Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android.
 * Falls back gracefully on web where SecureStorage may not be available.
 */

const PIN_NAMESPACE = 'julaba-pins'

export const secureStorage = {
  get: (key: string) => SecureStorage.getItem(key),
  set: (key: string, value: string) => SecureStorage.setItem(key, value),
  remove: (key: string) => SecureStorage.removeItem(key),
}

export async function savePinHash(identifier: string, pinHash: string): Promise<void> {
  const key = `${PIN_NAMESPACE}:${identifier}`
  try {
    await SecureStorage.setItem(key, pinHash)
  } catch {
    // On web or if SecureStorage is unavailable, fall back to sessionStorage
    // (better than localStorage — cleared when tab closes)
    try {
      sessionStorage.setItem(key, pinHash)
    } catch {
      // Last resort: localStorage (already what we had before)
      localStorage.setItem(key, pinHash)
    }
  }
}

export async function getPinHash(identifier: string): Promise<string | null> {
  const key = `${PIN_NAMESPACE}:${identifier}`
  try {
    const value = await SecureStorage.getItem(key)
    return value ?? null
  } catch {
    // Try fallback stores
    try {
      const sessionVal = sessionStorage.getItem(key)
      if (sessionVal) return sessionVal
    } catch {}
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
}

export async function removePinHash(identifier: string): Promise<void> {
  const key = `${PIN_NAMESPACE}:${identifier}`
  try {
    await SecureStorage.removeItem(key)
  } catch {}
  try {
    sessionStorage.removeItem(key)
  } catch {}
  try {
    localStorage.removeItem(key)
  } catch {}
}
