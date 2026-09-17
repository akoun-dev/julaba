'use client'

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'
import { initNativeNotifications } from '@/lib/notifications/native'

/**
 * Native shell bootstrap — no-ops entirely on web (Capacitor.isNativePlatform()
 * is false in a regular browser tab), so this is safe to call unconditionally
 * from the root layout.
 */
export function initCapacitorNative(navigateBack: () => void, canGoBack: () => boolean): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  const cleanups: Array<() => void> = []

  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})

  // launchAutoHide is disabled in capacitor.config.ts so the splash stays
  // visible until the shell has actually mounted, instead of dropping to a
  // blank white screen while the remote page is still loading.
  SplashScreen.hide().catch(() => {})

  // Toggle a body class while the keyboard is open so bottom navigation bars
  // (marchand/identificateur) can hide themselves via CSS instead of getting
  // pushed up alongside the keyboard.
  Keyboard.addListener('keyboardWillShow', () => {
    document.body.classList.add('keyboard-open')
  }).then((h) => cleanups.push(() => h.remove()))
  Keyboard.addListener('keyboardWillHide', () => {
    document.body.classList.remove('keyboard-open')
  }).then((h) => cleanups.push(() => h.remove()))

  // Android hardware back button: mirror in-app navigation instead of the
  // OS default (which would otherwise just close the app from any screen).
  //
  // Deliberately ignoring the event's own `canGoBack` — that reflects the
  // WebView's browser history, which this app never pushes to (navigate()
  // is a plain Zustand state change, not history.pushState). Trusting it
  // meant `canGoBack` was always false, so the back button quit the app
  // from any screen instead of navigating back. `canGoBack` (the param
  // passed in here) checks the app's own navigation state instead.
  App.addListener('backButton', () => {
    if (canGoBack()) {
      navigateBack()
    } else {
      App.exitApp()
    }
  }).then((h) => cleanups.push(() => h.remove()))

  // Notifications natives (Task 29) : canaux Android, listeners de tap
  // (push + local) et enregistrement FCM. Best-effort et inerte tant que
  // google-services.json n'est pas fourni — l'app fonctionne sans push.
  const cleanupNotifications = initNativeNotifications()

  return () => {
    cleanupNotifications()
    cleanups.forEach((fn) => fn())
  }
}

export const isNativePlatform = () => Capacitor.isNativePlatform()
