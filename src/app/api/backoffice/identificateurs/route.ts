import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Le GET est la seule exposition nécessaire : le roster est alimenté
// automatiquement au premier dossier soumis (POST /api/backoffice/enrolments
// upserte l'identificateur) et aucune UI backoffice ne crée ni ne modifie
// d'identificateur directement — les routes POST/PATCH mortes ont été
// retirées pour réduire la surface mutable non testée.

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const zone = searchParams.get('zone')
    const teamId = searchParams.get('teamId')
    const activeOnly = searchParams.get('active') !== 'false'

    let query = supabase.from('legacy_bo_identificateurs').select('*').order('name', { ascending: true })
    if (zone) query = query.eq('zone', zone)
    if (teamId) query = query.eq('team_id', teamId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Erreur listage identificateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des identificateurs' }, { status: 500 })
  }
}
