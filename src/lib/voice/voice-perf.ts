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
 *   - tts_generation_ms   : une synthèse MMS.
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
