import { registerPlugin } from '@capacitor/core'

import type { VoiceServicePlugin } from './definitions'

export * from './definitions'

/**
 * Pont Capacitor du moteur vocal unifié (Task 31).
 *
 * - Coque native Android → plugin local Java VoiceServicePlugin
 *   (enregistré manuellement dans MainActivity, comme SherpaSttPlugin).
 * - Navigateur → VoiceServiceWeb (méthodes en échec explicite), la couche
 *   haut niveau retombe alors sur la Web Speech API.
 *
 * Point d'entrée recommandé pour les consommateurs : la couche
 * src/lib/voice/voice-service.ts (routing de langue + fallback), PAS ce
 * pont brut — sauf pour les écrans de diagnostic qui veulent l'état natif
 * exact (isReady()).
 */
export const VoiceService = registerPlugin<VoiceServicePlugin>('VoiceService', {
  web: () => import('./web').then((m) => new m.VoiceServiceWeb()),
})
