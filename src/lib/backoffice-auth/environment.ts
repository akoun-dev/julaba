/** Garde-fou pour l’exposition des comptes de démonstration. */
export function isDemoAccountsAllowed(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.BACKOFFICE_DEMO_ACCOUNTS === 'true'
}
