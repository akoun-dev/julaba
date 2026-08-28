import { Capacitor } from '@capacitor/core'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'

/** True on native only — the plugin's web implementation always reports unavailable. */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { isAvailable } = await BiometricAuth.checkBiometry()
    return isAvailable
  } catch {
    return false
  }
}

/**
 * Prompts Face ID / Touch ID / Android biometric unlock. Resolves true on
 * success, false on cancel/failure/unavailable — never throws, so callers
 * can just fall back to PIN entry without a try/catch of their own.
 */
export async function unlockWithBiometrics(reason: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Utiliser le code',
      allowDeviceCredential: true,
    })
    return true
  } catch {
    return false
  }
}
