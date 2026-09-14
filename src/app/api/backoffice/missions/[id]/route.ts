import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

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

    const [assigneesRes, teamRes, enrolmentsRes] = await Promise.all([
      supabase
        .from('legacy_bo_mission_assignees')
        .select('identificateur_id, legacy_bo_identificateurs(name, zone)')
        .eq('mission_id', id),
      mission.team_id
        ? supabase.from('legacy_bo_teams').select('id, name').eq('id', mission.team_id).single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('legacy_bo_enrolments')
        .select('*')
        .order('submitted_at', { ascending: false }),
    ])
    if (assigneesRes.error) throw assigneesRes.error
    if (enrolmentsRes.error) throw enrolmentsRes.error

    const assignees = (assigneesRes.data || []).map((row) => {
      const ident = row.legacy_bo_identificateurs as { name: string; zone: string } | null
      return {
        id: row.identificateur_id as string,
        name: ident?.name || (row.identificateur_id as string),
        zone: ident?.zone || null,
      }
    })
    const assigneeIds = new Set(assignees.map((a) => a.id))

    const start = new Date(mission.start_date as string).getTime()
    const end = mission.end_date ? new Date(mission.end_date as string).getTime() : null
    const matchingEnrolments = (enrolmentsRes.data || []).filter((e) => {
      const identId = e.identificateur_id as string | null
      if (!identId || !assigneeIds.has(identId)) return false
      const t = new Date(e.submitted_at as string).getTime()
      return t >= start && (end === null || t <= end)
    })

    const countByIdentificateur: Record<string, number> = {}
    for (const e of matchingEnrolments) {
      const identId = e.identificateur_id as string
      countByIdentificateur[identId] = (countByIdentificateur[identId] || 0) + 1
    }

    return NextResponse.json({
      ...mission,
      team: teamRes.data || null,
      assignees: assignees.map((a) => ({ ...a, enrolmentCount: countByIdentificateur[a.id] || 0 })),
      current_count: matchingEnrolments.length,
      recent_enrolments: matchingEnrolments.slice(0, 20),
    })
  } catch (error) {
    console.error('Erreur detail mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement de la mission' }, { status: 500 })
  }
}
