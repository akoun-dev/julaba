import { SecureStorage } from '@aparajita/capacitor-secure-storage'

/**
 * Encrypted storage for sensitive values (session tokens, hashed PINs) —
 * Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android.
 * Falls back to a same-API web implementation in a browser tab, so callers
 * don't need to branch on platform.
 */
export const secureStorage = {
  get: (key: string) => SecureStorage.getItem(key),
  set: (key: string, value: string) => SecureStorage.setItem(key, value),
  remove: (key: string) => SecureStorage.removeItem(key),
}
