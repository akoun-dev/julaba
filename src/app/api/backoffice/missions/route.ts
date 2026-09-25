import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'
import { normalizeZoneKey } from '@/lib/objectifs'

// MODE-1007 — portes Zod POST/PATCH. title/zone/startDate (POST) et id
// (PATCH) ont déjà leurs 400 manuels testés → nullish pour que CES
// messages continuent de sortir (null compris). identificateurIds a un
// repli Array.isArray gracieux (non-tableau → aucune assignation) et
// targetCount/currentCount n'ont aucune garde numérique → z.unknown() :
// les typer refuserait des payloads acceptés aujourd'hui. startDate/endDate
// passent dans new Date() (chaîne OU timestamp numérique valides) →
// z.unknown().
const createMissionSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  zone: z.string().nullish(),
  targetCount: z.unknown().optional(),
  startDate: z.unknown().optional(),
  endDate: z.unknown().optional(),
  teamId: z.string().nullish(),
  identificateurIds: z.unknown().optional(),
})

const updateMissionSchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  currentCount: z.unknown().optional(),
})

// MODE-1006 (noImplicitAny) — types de ligne minimaux : le client admin est
// volontairement non typé (DET-008). MissionRow reste Record<string, unknown>
// car la ligne entière est spread dans la réponse (précédent MarketProductRow).
type MissionRow = Record<string, unknown> & {
  id: string
  team_id: string | null
  start_date: string
  end_date: string | null
}
interface TeamRow {
  id: string
  name: string
}

// A mission's real progress is derived from actual enrolments submitted by
// its assigned identificateurs during its date range, not a manually
// incremented counter — see computeMissionProgress. current_count/target_count
// stay stored columns (current_count kept in sync by PATCH for anything that
// still writes it directly), but every read here returns the live count so
// the UI always reflects reality.
function computeMissionProgress(
  mission: { id: string; start_date: string; end_date: string | null },
  assigneeIds: Set<string>,
  enrolments: { identificateur_id: string | null; submitted_at: string }[]
): number {
  if (assigneeIds.size === 0) return 0
  const start = new Date(mission.start_date).getTime()
  const end = mission.end_date ? new Date(mission.end_date).getTime() : null
  let count = 0
  for (const e of enrolments) {
    if (!e.identificateur_id || !assigneeIds.has(e.identificateur_id)) continue
    const t = new Date(e.submitted_at).getTime()
    if (t >= start && (end === null || t <= end)) count++
  }
  return count
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('legacy_bo_missions')
      .select('*')
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)

    const { data: missions, error } = await query
    if (error) throw error

    const missionIds = ((missions || []) as MissionRow[]).map((m) => m.id as string)

    const [assigneesRes, teamsRes, enrolmentsRes] = await Promise.all([
      missionIds.length
        ? supabase
            .from('legacy_bo_mission_assignees')
            .select('mission_id, identificateur_id, legacy_bo_identificateurs(name)')
            .in('mission_id', missionIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      supabase.from('legacy_bo_teams').select('id, name'),
      supabase.from('legacy_bo_enrolments').select('identificateur_id, submitted_at'),
    ])
    if (assigneesRes.error) throw assigneesRes.error
    if (teamsRes.error) throw teamsRes.error
    if (enrolmentsRes.error) throw enrolmentsRes.error

    const teamNameById = new Map<string, string>(
      ((teamsRes.data || []) as TeamRow[]).map((t) => [t.id as string, t.name as string])
    )

    const assigneesByMission = new Map<string, { id: string; name: string }[]>()
    for (const row of assigneesRes.data || []) {
      const missionId = row.mission_id as string
      const ident = row.legacy_bo_identificateurs as { name: string } | null
      const list = assigneesByMission.get(missionId) || []
      list.push({ id: row.identificateur_id as string, name: ident?.name || (row.identificateur_id as string) })
      assigneesByMission.set(missionId, list)
    }

    const enrolments = enrolmentsRes.data || []

    const enriched = ((missions || []) as MissionRow[]).map((m) => {
      const assignees = assigneesByMission.get(m.id as string) || []
      const assigneeIds = new Set(assignees.map((a) => a.id))
      return {
        ...m,
        assignees,
        team_name: m.team_id ? teamNameById.get(m.team_id as string) || null : null,
        current_count: computeMissionProgress(
          { id: m.id as string, start_date: m.start_date as string, end_date: m.end_date as string | null },
          assigneeIds,
          enrolments as { identificateur_id: string | null; submitted_at: string }[]
        ),
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Erreur listage missions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des missions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const parsed = createMissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { title, description, zone, targetCount, startDate, endDate, teamId, identificateurIds } = body

    if (!title || !zone || !startDate) {
      return NextResponse.json({ erreur: 'Le titre, la zone et la date de debut sont obligatoires' }, { status: 400 })
    }

    // MODE-941 (AUDIT-003 S-08) — frontière de zone : un gestionnaire de
    // zone ne crée des missions QUE dans sa zone (refus 403 sinon ; pas
    // de force silencieuse : une mission est un engagement explicite).
    if (auth.user.role === 'gestionnaire_zone' && normalizeZoneKey(zone) !== normalizeZoneKey(auth.user.zone ?? '')) {
      return NextResponse.json({ erreur: 'Cette zone ne relève pas de votre périmètre' }, { status: 403 })
    }

    const assigneeIds: string[] = Array.isArray(identificateurIds)
      ? Array.from(new Set(identificateurIds.filter((v): v is string => typeof v === 'string' && v.length > 0)))
      : []

    const { data: mission, error } = await supabase
      .from('legacy_bo_missions')
      .insert({
        title,
        description: description || null,
        zone,
        team_id: teamId || null,
        target_count: targetCount || 0,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error

    if (assigneeIds.length > 0) {
      const { error: assigneesError } = await supabase
        .from('legacy_bo_mission_assignees')
        .insert(assigneeIds.map((identificateurId) => ({ mission_id: mission.id, identificateur_id: identificateurId })))
      if (assigneesError) throw assigneesError
    }

    return NextResponse.json({ ...mission, assignees: assigneeIds, current_count: 0 }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation mission:', error)
    // A11-F13 (AUDIT-011) : error.message renvoyé verbatim = fuite d'erreur
    // brute Postgres (seule occurrence des 127 routes) — message générique,
    // le détail reste en log serveur.
    return NextResponse.json(
      { erreur: 'Erreur lors de la creation de la mission' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const parsed = updateMissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, status, currentCount } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    // MODE-941 (AUDIT-003 S-08) — frontière de zone sur la mise à jour :
    // la mission modifiée doit relever du périmètre du gestionnaire.
    if (auth.user.role === 'gestionnaire_zone') {
      const { data: existante } = await supabase
        .from('legacy_bo_missions')
        .select('zone')
        .eq('id', id)
        .single()
      if (!existante || !canAccessZone(auth.user, (existante as { zone: string | null }).zone)) {
        return NextResponse.json({ erreur: 'Cette mission ne relève pas de votre périmètre' }, { status: 404 })
      }
    }

    const data: Record<string, unknown> = {}
    if (status) data.status = status
    if (currentCount !== undefined) data.current_count = currentCount
    if (status === 'terminee') data.end_date = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('legacy_bo_missions')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la mission' }, { status: 500 })
  }
}
