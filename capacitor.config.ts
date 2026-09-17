import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// Jùlaba is a full Next.js server app (SSR + API routes + Supabase,
// next.config.ts sets output: "standalone"). It cannot be statically
// exported into Capacitor's local bundle, so the native shell loads the
// live, deployed server over the network — Capacitor's "hybrid remote"
// mode — instead of bundling static assets. `capacitor-www/` only holds a
// tiny offline-fallback page.
//
// Set CAPACITOR_SERVER_URL before running `npx cap sync` / `npx cap open` to
// override the production default:
//   - Production:        https://julaba.vercel.app/
//   - Android emulator:  http://10.0.2.2:3000        (host machine's `next dev`)
//   - Physical device:   http://<your-lan-ip>:3000
// See CAPACITOR.md for the full setup and per-plugin native permissions.
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://julaba.vercel.app/';
const isDevServer = !!serverUrl && serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'ci.julaba.app',
  appName: 'Jùlaba',
  webDir: 'capacitor-www',
  server: serverUrl
    ? {
        url: serverUrl,
        // Only allow plaintext http:// for local dev servers (emulator/LAN);
        // production must be https.
        cleartext: isDevServer,
      }
    : undefined,
  android: {
    // https:// scheme for the WebView origin — required by several plugins
    // (Geolocation, Camera) and by cookie/secure-context behavior.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#121319',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Task 30 — SystemBars (livré avec @capacitor/core) remplace le bloc
    // StatusBar du plugin @capacitor/status-bar (retiré) : conçu pour
    // l'edge-to-edge moderne, obligatoire depuis Android 15 / targetSdk 36
    // où overlaysWebView(false)/setBackgroundColor sont ignorés.
    SystemBars: {
      // 'css' : le bridge Android injecte les variables CSS
      // --safe-area-inset-* (valeurs correctes) et neutralise le bug
      // env(safe-area-inset-*) des WebView < 140 — l'app utilise
      // viewport-fit="cover" + utilitaires *-safe, elle attend des insets
      // réels (cf. globals.css et docs/CAPACITOR.md).
      insetsHandling: 'css',
      // Thème clair forcé → contenu SOMBRE des barres (SystemBarsStyle
      // .Light = icônes/texte sombres sur fond clair). Réaffirmé au runtime
      // par SystemBars.setStyle dans src/lib/capacitor.ts.
      style: 'LIGHT',
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
