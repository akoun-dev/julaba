/**
 * MODE-975 (AUDIT-007 G6) — Logique de la garde de session de l'espace
 * coopérative président.
 *
 * Pourquoi une fonction PURE (et pas la logique dans le composant) :
 * le projet teste en environnement node (vitest, sans DOM ni RTL) — la
 * décision d'accès est testable exhaustivement, le composant se contente
 * de la consommer.
 *
 * garde-fou #3 (AUDIT-007) : la VRAIE autorité reste le serveur
 * (requirePresident sur chaque route) — ce garde est une boussole UI :
 * il évite d'installer le président dans un écran qui n'a aucune session
 * utilisable (ex. re-claim Capacitor renvoyant null), SANS jamais bloquer
 * le hors-ligne : aucune revalidation réseau ici, une session locale
 * valide suffit (les bannières d'erreur du shell annoncent l'état des
 * chargements, c'est leur rôle — pas celui du garde).
 */

export interface AccesCoopEntrant {
  /** Rôle du compte courant (app-store.userRole). */
  userRole: string | null
  /** Identité de session (app-store.merchantId — pour le coopérateur,
   * c'est l'identifiant de session utilisé par toutes les routes
   * coopératives). null/'' = aucune session utilisable. */
  identite: string | null
}

/** Décision d'accès : le rôle coopérateur AVEC une identité de session. */
export function accesCoopAutorise(entrant: AccesCoopEntrant): boolean {
  return entrant.userRole === 'cooperateur' && !!entrant.identite
}
