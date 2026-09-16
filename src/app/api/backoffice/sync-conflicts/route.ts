import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
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
    const supabase = createSupabaseAdminClient()
    const { data: reports, error } = await supabase
      .from('legacy_sync_conflict_reports')
      .select('*')
      .order('reported_at', { ascending: false })
      .limit(200)
    if (error) throw error

    // Mapping explicite en camelCase : l'écran lit clientCreatedAt/reportedAt —
    // les colonnes brutes client_created_at/reported_at donnaient « Invalid Date ».
    const mapped = (reports ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      entity: r.entity,
      message: r.message,
      clientCreatedAt: r.client_created_at,
      reportedAt: r.reported_at,
    }))

    return NextResponse.json({ reports: mapped })
  } catch (error) {
    console.error('[API backoffice/sync-conflicts GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des conflits de synchronisation' }, { status: 500 })
  }
}
