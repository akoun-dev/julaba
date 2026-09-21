/**
 * Interrupteurs sensibles du back-office.
 *
 * Ces garde-fous sont volontairement purs afin que la politique de production
 * soit testée sans dépendre de l'environnement du processus de test.
 */
export function isDemoAccountsAllowed(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.BACKOFFICE_DEMO_ACCOUNTS === 'true'
}

/**
 * Le contournement MFA ne peut exister que dans un environnement local de
 * développement. Une variable de déploiement mal configurée ne doit jamais
 * réduire l'authentification de production à un mot de passe seul.
 */
export function isMfaBypassAllowed(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.BACKOFFICE_MFA_DISABLED === 'true'
}
