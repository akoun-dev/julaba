// Traçabilité de la chaîne de lecture réellement utilisée par la dernière
// narration Tata (remontée terrain 2026-09-20 : « le test ne fonctionne pas »
// — l'écran ne pouvait pas dire CE QUI avait parlé quand la voix MMS espérée
// laissait place au repli français).
//
// Module volontairement MINUSCULE et sans dépendance : importé à la fois par
// tata-tts.ts, mms-tts.ts (moteurs qui déclarent ce qui a réellement parlé)
// et les écrans de réglages (qui affichent la vérité) — sans cycle d'imports.
// Chaque moteur notifie AU MOMENT où il s'engage à produire du son, jamais
// avant (un échec de synthèse ne doit pas se déclarer « chaîne utilisée »).

export type SpokenChain =
  | 'mms-bci'
  | 'mms-dyu'
  | 'native'
  | 'webspeech'
  | 'piper'
  | 'kokoro'

let lastSpokenChain: SpokenChain | null = null

/** Déclare la chaîne qui s'apprête à produire (ou vient de produire) du son. */
export function notifySpokenChain(chain: SpokenChain): void {
  lastSpokenChain = chain
}

/** Chaîne de la dernière narration (null = rien n'a encore parlé). */
export function getLastSpokenChain(): SpokenChain | null {
  return lastSpokenChain
}

/** Réinitialise l'état module — isolation des tests. */
export function resetSpokenChainForTests(): void {
  lastSpokenChain = null
}
