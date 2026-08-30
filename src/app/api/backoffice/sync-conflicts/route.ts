import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Admin visibility into permanent offline-sync failures reported by devices
// (see /api/sync-conflicts/report and src/lib/offline-db.ts) — previously
// these only ever existed in a local table on the device that hit them,
// invisible to any admin, so nobody could see when a user's data silently
// failed to reach the server for good.
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'sync-conflicts', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const reports = await db.syncConflictReport.findMany({
      orderBy: { reportedAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ reports })
  } catch (error) {
    console.error('[API backoffice/sync-conflicts GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des conflits de synchronisation' }, { status: 500 })
  }
}
