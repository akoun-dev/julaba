import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

// Self-serve read-back for the identificateur mobile app: lets an agent see
// their own submitted dossiers, including status changes (validé/rejeté)
// made later by a backoffice admin — distinct from
// /api/backoffice/enrolments's GET, which is the admin console's listing
// (requireBackofficePermission, no per-agent filter). Identificateur devices
// have no backoffice session, only their own device-owner claim.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identificateurId = searchParams.get('identificateurId')

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    const dossiers = await db.boEnrolment.findMany({
      where: { identificateurId: identificateurId! },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ dossiers })
  } catch (error) {
    console.error('[API identificateur/dossiers GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
