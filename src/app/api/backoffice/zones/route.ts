import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// DET-008/NORM-305 — le client admin Supabase est volontairement non typé
// (any) : type de ligne minimal, spread dans la réponse (MODE-980, cf.
// MarketProductRow).
type ZoneRow = Record<string, unknown> & { name: string | null }

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'zones', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()

    const [zonesRes, actorsRes, enrolmentsRes] = await Promise.all([
      supabase.from('legacy_bo_zones').select('*').order('name', { ascending: true }),
      supabase.from('legacy_bo_actors').select('zone'),
      supabase.from('legacy_bo_enrolments').select('zone'),
    ])

    const zones = (zonesRes.data || []) as ZoneRow[]
    const actors = actorsRes.data || []
    const enrolments = enrolmentsRes.data || []

    // Count actors by zone in JS
    const actorCountMap: Record<string, number> = {}
    for (const a of actors) {
      const z = a.zone || ''
      actorCountMap[z] = (actorCountMap[z] || 0) + 1
    }

    // Count enrolments by zone in JS
    const enrolCountMap: Record<string, number> = {}
    for (const e of enrolments) {
      const z = e.zone || ''
      enrolCountMap[z] = (enrolCountMap[z] || 0) + 1
    }

    // Garde no-op (MODE-980) : `name` est NOT NULL en base — `?? ''` ne
    // change rien au runtime, il satisfait seulement tsc.
    const enriched = zones.map((z) => ({
      ...z,
      actualActorCount: actorCountMap[z.name ?? ''] || 0,
      enrolmentCount: enrolCountMap[z.name ?? ''] || 0,
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Erreur listage zones:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des zones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'zones', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, region, target, isActive } = body

    if (!name || !region) {
      return NextResponse.json({ erreur: 'Le nom et la region sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_zones')
      .select('id')
      .eq('name', name)
      .single()

    if (existing) {
      return NextResponse.json({ erreur: 'Cette zone existe deja' }, { status: 400 })
    }

    const { data: zone, error } = await supabase
      .from('legacy_bo_zones')
      .insert({
        name,
        region,
        target: target || 0,
        is_active: isActive === undefined ? true : !!isActive,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(zone, { status: 201 })
  } catch (error) {
    console.error('Erreur creation zone:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la zone' }, { status: 500 })
  }
}
