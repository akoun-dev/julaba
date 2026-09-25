/**
 * AUDIT-012 P1-9 — invariants de gouvernance des comptes back-office.
 *
 * L'audit externe (« Back-office, RBAC et workflows ») exige la
 * responsabilité traçable côté serveur : aucun agent ne doit créer un rôle
 * supérieur au sien, se rétrograder/se désactiver lui-même, modifier un
 * compte d'un rôle supérieur, ni désactiver/rétrograder le DERNIER
 * super_admin actif. Ces invariants sont implémentés comme fonctions PURES
 * (testables) et appliqués dans /api/backoffice/users (POST + PATCH).
 */

import { ROLE_HIERARCHY } from '@/lib/backoffice-permissions'

export type InvariantVerdict = { ok: true } | { ok: false; status: number; erreur: string }

type BoRoleKey = keyof typeof ROLE_HIERARCHY

function estRoleConnu(valeur: string): valeur is BoRoleKey {
  return valeur in ROLE_HIERARCHY
}

/**
 * POST /users — création d'un compte : le rôle cible doit être connu ET ne
 * pas dépasser hiérarchiquement le rôle de l'agent créateur.
 */
export function invariantCreationRole(roleActeur: BoRoleKey, roleCible: string): InvariantVerdict {
  if (!estRoleConnu(roleCible)) return { ok: false, status: 400, erreur: 'Role inconnu' }
  if (ROLE_HIERARCHY[roleCible] > ROLE_HIERARCHY[roleActeur]) {
    return { ok: false, status: 403, erreur: 'Impossible de créer un compte de rôle supérieur au vôtre' }
  }
  return { ok: true }
}

/**
 * PATCH /users — modification d'un compte existant :
 * @param params.roleActeur        rôle de l'agent authentifié
 * @param params.roleCible         rôle actuel du compte modifié
 * @param params.cibleEstActeur    l'agent modifie son propre compte
 * @param params.rolePropose       nouveau rôle demandé (undefined = inchangé)
 * @param params.desactiveCible    isActive === false demandé
 * @param params.autresSuperAdminsActifs nombre de super_admin ACTIFS autres
 *        que la cible (0 = la cible est le dernier)
 */
export function invariantModificationCompte(params: {
  roleActeur: BoRoleKey
  roleCible: string
  cibleEstActeur: boolean
  rolePropose?: string
  desactiveCible: boolean
  autresSuperAdminsActifs: number
}): InvariantVerdict {
  const { roleActeur, roleCible, cibleEstActeur, rolePropose, desactiveCible, autresSuperAdminsActifs } = params

  // 1. On ne modifie jamais un compte de rôle strictement supérieur.
  if (estRoleConnu(roleCible) && ROLE_HIERARCHY[roleCible] > ROLE_HIERARCHY[roleActeur]) {
    return { ok: false, status: 403, erreur: 'Impossible de modifier un compte de rôle supérieur au vôtre' }
  }

  // 2. Auto-rétrogradation / auto-désactivation interdites.
  if (cibleEstActeur && (desactiveCible || (rolePropose !== undefined && estRoleConnu(rolePropose) && ROLE_HIERARCHY[rolePropose] < ROLE_HIERARCHY[roleActeur]))) {
    return { ok: false, status: 403, erreur: 'Auto-rétrogradation et auto-désactivation interdites' }
  }

  // 3. Le DERNIER super_admin actif ne peut être ni désactivé ni rétrogradé.
  if (roleCible === 'super_admin' && autresSuperAdminsActifs === 0) {
    const retrograde = rolePropose !== undefined && rolePropose !== 'super_admin'
    if (desactiveCible || retrograde) {
      return { ok: false, status: 409, erreur: 'Le dernier super-administrateur actif ne peut pas être désactivé ou rétrogradé' }
    }
  }

  // 4. Un rôle proposé doit être connu (doublon défensif de A11-F15).
  if (rolePropose !== undefined && !estRoleConnu(rolePropose)) {
    return { ok: false, status: 400, erreur: 'Role inconnu' }
  }

  return { ok: true }
}
