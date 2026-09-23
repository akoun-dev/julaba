/**
 * Instrumentation performance du système vocal (MODE-962) —
 * DÉVELOPPEMENT UNIQUEMENT : en production cette fonction est un no-op
 * (aucun log, aucune pollution console).
 *
 * Métriques émises aux points de chargement / inférence lourds :
 *   - language_switch_ms  : durée d'un changement de langue (sélecteur) —
 *     doit rester < quelques ms (aucun modèle lourd au changement) ;
 *   - asr_load_ms         : initialisation du moteur STT natif (fr/bci/dyu) ;
 *   - nllb_load_ms        : création du pipeline de traduction NLLB ;
 *   - nllb_inference_ms   : une traduction NLLB ;
 *   - tts_load_ms         : création du pipeline TTS local MMS ;
 *   - tts_generation_ms   : une synthèse MMS ;
 *   - roundtrip_ms        : délai « parole → réponse » (T1 - T0), émis à
 *     l'ancre T1 — début de la synthèse (narrateResponse, conversation.ts)
 *     ou fin du délai artificiel des modales vente rapide.
 *
 * Objectif : prouver en dev que le changement de langue ne déclenche
 * AUCUN chargement lourd (règle absolue « changer de langue ≠ charger
 * les modèles ») et mesurer les latences réelles des premiers usages.
 */
export function voicePerfDebug(
  metric: string,
  durationMs: number,
  meta?: Record<string, string | number>,
): void {
  if (process.env.NODE_ENV === 'production') return
  const suffix = meta
    ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ')
    : ''
  console.debug(`[Voice] ${metric}${suffix} ${Math.round(durationMs)}ms`)
}

/** Source émettrice du roundtrip (la modale qui a reçu le transcript final). */
export type RoundtripSource = 'voice-modal' | 'prod-voice-modal' | 'vente-rapide-modal'

// Registre dev du roundtrip « parole → réponse » (I-05). Les trois modales
// vocales étant mutuellement exclusives (une seule interaction voix active à
// la fois), un état module unique suffit : T0 est posé à la réception du
// transcript final (onResult), T1 est posé au début de la synthèse de la
// réponse — ancré dans narrateResponse (conversation.ts) pour couvrir la
// traduction NLLB incluse, ou à la fin du délai artificiel dans
// vente-rapide-modal. En production tout ceci reste un no-op.
let pendingRoundtrip: { t0: number; source: RoundtripSource } | null = null

/**
 * Pose T0 à la réception du transcript final et enregistre la source pour
 * l'émission de `roundtrip_ms` au moment où la synthèse commencera
 * (endVoiceRoundtrip). Retourne T0 (informativement).
 */
export function beginVoiceRoundtrip(source: RoundtripSource): number {
  if (process.env.NODE_ENV === 'production') return 0
  const t0 = performance.now()
  pendingRoundtrip = { t0, source }
  return t0
}

/**
 * Pose T1, calcule T1 - T0 et émet `voicePerfDebug('roundtrip_ms', ms, { source })`.
 * Appelée au début de la synthèse de la réponse ; sans roundtrip en cours,
 * ne fait rien et retourne null.
 */
export function endVoiceRoundtrip(): number | null {
  if (process.env.NODE_ENV === 'production') return null
  if (!pendingRoundtrip) return null
  const { t0, source } = pendingRoundtrip
  pendingRoundtrip = null
  const durationMs = Math.round(performance.now() - t0)
  voicePerfDebug('roundtrip_ms', durationMs, { source })
  return durationMs
}
