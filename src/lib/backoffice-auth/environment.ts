/**
 * Interrupteurs sensibles du back-office.
 *
 * Ces garde-fous sont volontairement purs afin que la politique de production
 * soit testée sans dépendre de l'environnement du processus de test.
 */
export function isDemoAccountsAllowed(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.BACKOFFICE_DEMO_ACCOUNTS === 'true'
}
