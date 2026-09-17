/**
 * Détection d'une table absente sur la base hébergée (migration pas encore
 * appliquée). Les lectures concernées se replient gracieusement sur des
 * valeurs par défaut plutôt que d'afficher une erreur bloquante — la
 * migration 20260917140000 crée legacy_bo_objectifs et legacy_bo_alert_rules.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string }
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  const message = err.message || ''
  return /does not exist|Could not find the table|schema cache/i.test(message)
}
