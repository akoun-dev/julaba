import { NextResponse, type NextRequest } from 'next/server'
import { getDeviceSubject, subjectFor, type DeviceSubjectType } from '@/lib/device-session'

/**
 * Server-side ownership guard for marchand/producteur/identificateur API
 * routes: verifies the request's device cookie is bound to exactly the
 * subject (`type`:`id`) it's trying to read or write, rather than trusting a
 * merchantId/producteurId/identificateurId supplied as a plain query or body
 * param. Returns a ready-to-return NextResponse on failure, or null when the
 * caller may proceed.
 */
export async function requireDeviceOwner(
  request: NextRequest,
  type: DeviceSubjectType,
  id: string | null | undefined
): Promise<NextResponse | null> {
  if (!id) {
    return NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })
  }
  const actual = await getDeviceSubject(request)
  if (!actual) {
    return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
  }
  if (actual !== subjectFor(type, id)) {
    return NextResponse.json({ erreur: 'Accès refusé à cette ressource' }, { status: 403 })
  }
  return null
}
