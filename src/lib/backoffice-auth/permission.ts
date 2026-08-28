import { NextResponse, type NextRequest } from 'next/server'
import { hasModuleAccess, type ModuleName } from '@/lib/backoffice-permissions'
import { getSessionUser, type BoSessionUser } from './session'

export type BoAction = 'read' | 'create' | 'update' | 'delete'

/**
 * Server-side guard for every Backoffice API route: verifies the caller has
 * a live, server-tracked session (not just a client-side role claim) and
 * that their role is allowed to perform `action` on `module`, using the
 * exact same MODULE_ACCESS matrix the sidebar uses to decide what to show.
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
  if (!hasModuleAccess(user.role, module)) {
    return NextResponse.json(
      { erreur: `Votre rôle ne permet pas cette action (${module}:${action})` },
      { status: 403 }
    )
  }
  return { user }
}

/**
 * True when `user` may act on a resource tied to `resourceZone`.
 * Zone-scoped roles (gestionnaire_zone, operateur_terrain) are restricted to
 * their own zone; broader roles are unrestricted. A resource with no zone,
 * or a user with no assigned zone, is not restricted by this check.
 */
export function canAccessZone(user: BoSessionUser, resourceZone: string | null | undefined): boolean {
  if (user.role !== 'gestionnaire_zone' && user.role !== 'operateur_terrain') return true
  if (!user.zone || !resourceZone) return true
  return user.zone === resourceZone
}
