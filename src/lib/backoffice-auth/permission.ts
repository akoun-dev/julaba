import { NextResponse, type NextRequest } from 'next/server'
import { canPerformAction, type ModuleName, type BoAction } from '@/lib/backoffice-permissions'
import { getSessionUser, type BoSessionUser } from './session'

export type { BoAction }

/**
 * Server-side guard for every Backoffice API route: verifies the caller has
 * a live, server-tracked session (not just a client-side role claim) and
 * that their role is allowed to perform `action` on `module` — module-level
 * visibility (what the sidebar shows) does not by itself imply write access;
 * see canPerformAction for the module+action+role matrix that actually
 * decides this.
 *
 * Usage:
 *   const auth = await requireBackofficePermission(request, 'acteurs', 'update')
 *   if (auth instanceof NextResponse) return auth
 *   const { user } = auth
 */
export async function requireBackofficePermission(
  request: NextRequest,
  module: ModuleName,
  action: BoAction = 'read'
): Promise<{ user: BoSessionUser } | NextResponse> {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 })
  }
  if (!canPerformAction(user.role, module, action)) {
    return NextResponse.json(
      { erreur: `Votre rôle ne permet pas cette action (${module}:${action})` },
      { status: 403 }
    )
  }
  // A11-F09 (AUDIT-011) — application SERVEUR de force_password_change :
  // tant que le compte est sous mot de passe temporaire, AUCUNE route BO
  // n'est servie (la session émise avant rotation ne vaut plus rien) —
  // SAUF le changement de mot de passe lui-même, qui n'utilise PAS ce
  // garde (change-password passe par getSessionUser directement : c'est
  // la seule sortie de l'impasse). La frontière devient effective, la
  // rotation est OBLIGATOIRE avant tout accès métier.
  if (user.mustChangePassword) {
    return NextResponse.json(
      {
        erreur: 'Changement de mot de passe requis avant toute action',
        code: 'FORCE_PASSWORD_CHANGE',
      },
      { status: 403 }
    )
  }
  return { user }
}

/**
 * True when `user` may act on a resource tied to `resourceZone`.
 * Zone-scoped roles (gestionnaire_zone, operateur_terrain) are restricted to
 * their own zone.
 *
 * AUDIT-005 — FAIL-CLOSED : un rôle zoné sans zone assignée n'accède à
 * RIEN, et une ressource sans zone (périmètre national/global) est hors de
 * portée d'un rôle zoné. AVANT, les deux cas étaient fail-open (le contrôle
 * était simplement contourné) : un compte mal approvisionné — zone perdue
 * lors d'une réorganisation, rôle zoné assigné sans zone — disposait
 * de facto d'un accès national.
 */
export function canAccessZone(user: BoSessionUser, resourceZone: string | null | undefined): boolean {
  if (user.role !== 'gestionnaire_zone' && user.role !== 'operateur_terrain') return true
  if (!user.zone) return false
  if (!resourceZone) return false
  return user.zone === resourceZone
}
