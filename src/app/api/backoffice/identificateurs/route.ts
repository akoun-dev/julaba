import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// The identificateur roster missions assign against. identificateur
// accounts authenticate purely on-device (local PIN — see
// device-session.ts) with no prior backoffice provisioning, so most rows
// here are upserted automatically the first time that agent submits a
// dossier (see POST /api/backoffice/enrolments); an admin can also add one
// directly from here ahead of time.

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

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, phone, zone, teamId } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ erreur: 'Le nom est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_identificateurs')
      .insert({
        id: crypto.randomUUID(),
        name: String(name).trim(),
        phone: phone || null,
        zone: zone || null,
        team_id: teamId || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Erreur creation identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'identificateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, name, phone, zone, teamId, isActive } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (phone !== undefined) updates.phone = phone || null
    if (zone !== undefined) updates.zone = zone || null
    if (teamId !== undefined) updates.team_id = teamId || null
    if (isActive !== undefined) updates.is_active = isActive

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_identificateurs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur mise a jour identificateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'identificateur' }, { status: 500 })
  }
}
