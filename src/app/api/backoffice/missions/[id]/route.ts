import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// MODE-1006 (noImplicitAny) — type de ligne minimal : le client admin est
// volontairement non typé (DET-008) ; mission_assignees.identificateur_id
// est NOT NULL (20260908004530), la jointure legacy_bo_identificateurs
// (name, zone) peut être null.
interface MissionAssigneeRow {
  identificateur_id: string
  legacy_bo_identificateurs: { name: string; zone: string } | null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBackofficePermission(request, 'missions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const supabase = createSupabaseAdminClient()

    const { data: mission, error } = await supabase
      .from('legacy_bo_missions')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !mission) {
      return NextResponse.json({ erreur: 'Mission introuvable' }, { status: 404 })
    }

    const [assigneesRes, teamRes] = await Promise.all([
      supabase
        .from('legacy_bo_mission_assignees')
        .select('identificateur_id, legacy_bo_identificateurs(name, zone)')
        .eq('mission_id', id),
      mission.team_id
        ? supabase.from('legacy_bo_teams').select('id, name').eq('id', mission.team_id).single()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (assigneesRes.error) throw assigneesRes.error

    const assignees = ((assigneesRes.data || []) as MissionAssigneeRow[]).map((row) => {
      const ident = row.legacy_bo_identificateurs as { name: string; zone: string } | null
      return {
        id: row.identificateur_id as string,
        name: ident?.name || (row.identificateur_id as string),
        zone: ident?.zone || null,
      }
    })

    const start = new Date(mission.start_date as string).getTime()
    const end = mission.end_date ? new Date(mission.end_date as string).getTime() : null

    // Le filtrage identificateurs + fenêtre de dates se fait EN BASE
    // (.in + .gte/.lte) : l'ancienne version chargeait legacy_bo_enrolments
    // ENTIER en mémoire puis filtrait en JS — un coût qui croît avec tout
    // l'historique d'enrôlement pour ne garder que les dossiers de la
    // mission. count:'exact' fiabilise current_count même si le plafond de
    // 500 lignes retenues est atteint (recent_enrolments est un aperçu).
    const assigneeIds = assignees.map((a) => a.id)
    let matchingEnrolments: Record<string, unknown>[] = []
    let currentCount = 0
    if (assigneeIds.length > 0) {
      let query = supabase
        .from('legacy_bo_enrolments')
        .select('*', { count: 'exact' })
        .in('identificateur_id', assigneeIds)
        .gte('submitted_at', new Date(start).toISOString())
      if (end !== null) query = query.lte('submitted_at', new Date(end).toISOString())
      const { data, count, error } = await query
        .order('submitted_at', { ascending: false })
        .limit(500)
      if (error) throw error
      matchingEnrolments = data || []
      currentCount = count ?? matchingEnrolments.length
    }

    const countByIdentificateur: Record<string, number> = {}
    for (const e of matchingEnrolments) {
      const identId = e.identificateur_id as string
      countByIdentificateur[identId] = (countByIdentificateur[identId] || 0) + 1
    }

    return NextResponse.json({
      ...mission,
      team: teamRes.data || null,
      assignees: assignees.map((a) => ({ ...a, enrolmentCount: countByIdentificateur[a.id] || 0 })),
      current_count: currentCount,
      recent_enrolments: matchingEnrolments.slice(0, 20),
    })
  } catch (error) {
    console.error('Erreur detail mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement de la mission' }, { status: 500 })
  }
}
