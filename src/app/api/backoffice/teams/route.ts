import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Named groups of field agents ("équipes") a mission can be assigned to as
// a shortcut for assigning every member at once.

// DET-008/NORM-305 — le client admin Supabase est volontairement non typé
// (any) : type de ligne minimal, spread dans la réponse (MODE-980, cf.
// MarketProductRow).
type TeamRow = Record<string, unknown> & { id: string | null }

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const [teamsRes, membersRes] = await Promise.all([
      supabase.from('legacy_bo_teams').select('*').order('name', { ascending: true }),
      supabase.from('legacy_bo_identificateurs').select('team_id'),
    ])

    if (teamsRes.error) throw teamsRes.error
    if (membersRes.error) throw membersRes.error

    const memberCountByTeam: Record<string, number> = {}
    for (const row of membersRes.data || []) {
      const teamId = row.team_id as string | null
      if (!teamId) continue
      memberCountByTeam[teamId] = (memberCountByTeam[teamId] || 0) + 1
    }

    const enriched = ((teamsRes.data || []) as TeamRow[]).map((t) => ({
      ...t,
      memberCount: memberCountByTeam[t.id as string] || 0,
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Erreur listage equipes:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des equipes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, zone, description } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ erreur: 'Le nom de l\'equipe est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_teams')
      .select('id')
      .eq('name', name)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ erreur: 'Cette equipe existe deja' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('legacy_bo_teams')
      .insert({ name: String(name).trim(), zone: zone || null, description: description || null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ...data, memberCount: 0 }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation equipe:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'equipe' }, { status: 500 })
  }
}
