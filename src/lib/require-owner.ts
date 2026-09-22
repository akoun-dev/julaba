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

/**
 * MODE-935 (audit #003, S-13) — garde de TYPE de session, à appeler
 * AVANT toute recherche de la ressource : la session doit exister ET
 * appartenir au royaume attendu (`producteur:…`, `merchant:…`). Un
 * appelant sans session reçoit 401 et un autre royaume 403 AVANT le
 * lookup — plus jamais un 404 « introuvable » qui masque l'état de
 * l'authentification (ordre auth-avant-lookup). Le contrôle d'appartenance
 * EXACT (l'id précis) reste du ressort de requireDeviceOwner après lookup.
 */
export async function requireDeviceSubjectType(
  request: NextRequest,
  type: DeviceSubjectType
): Promise<NextResponse | null> {
  const actual = await getDeviceSubject(request)
  if (!actual) {
    return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
  }
  if (!actual.startsWith(`${type}:`)) {
    return NextResponse.json({ erreur: 'Accès refusé à cette ressource' }, { status: 403 })
  }
  return null
}

/**
 * MODE-979 (DET-COOP-008) — garde de session MULTI-ROYAUME pour les
 * ressources communes à plusieurs espaces (annuaire /api/communes :
 * le président, le producteur et le marchand choisissent tous une
 * commune). La session doit exister ET appartenir à UN des royaumes
 * listés — 401 sans session, 403 si le royaume ne fait pas partie de
 * la liste. Aucun id précis n'est vérifié ici : c'est un annuaire sans
 * donnée personnelle (id/nom/région/coords des communes seulement).
 */
export async function requireDeviceSessionAny(
  request: NextRequest,
  types: readonly DeviceSubjectType[]
): Promise<NextResponse | null> {
  const actual = await getDeviceSubject(request)
  if (!actual) {
    return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
  }
  const autorise = types.some((t) => actual.startsWith(`${t}:`))
  if (!autorise) {
    return NextResponse.json({ erreur: 'Accès refusé à cette ressource' }, { status: 403 })
  }
  return null
}

