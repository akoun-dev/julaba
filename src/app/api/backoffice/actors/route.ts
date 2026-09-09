import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const zone = (auth.user.role === 'gestionnaire_zone' || auth.user.role === 'operateur_terrain') && auth.user.zone
      ? auth.user.zone
      : searchParams.get('zone')

    const supabase = createSupabaseAdminClient()

    let query = supabase.from('legacy_bo_actors').select('*', { count: 'exact' })

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,actor_id.ilike.%${search}%,phone.ilike.%${search}%`)
    }
    if (status) query = query.eq('status', status)
    if (type) query = query.eq('type', type)
    if (zone) query = query.eq('zone', zone)

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: actors, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({ actors: actors || [], total: total || 0, page, limit, totalPages: Math.ceil((total || 0) / limit) })
  } catch (error) {
    console.error('Erreur listage acteurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des acteurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { firstName, lastName, type, phone, zone, identificateurName, notes } = body

    if (!firstName || !phone || !zone) {
      return NextResponse.json({ erreur: 'Le prenom, le telephone et la zone sont obligatoires' }, { status: 400 })
    }

    if (!canAccessZone(auth.user, zone)) {
      return NextResponse.json({ erreur: 'Cette zone ne relève pas de votre périmètre' }, { status: 403 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: actor, error } = await supabase.from('legacy_bo_actors').insert({
      actor_id: `#${(type || 'marchand').charAt(0).toUpperCase()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      first_name: firstName,
      last_name: lastName || null,
      type: type || 'marchand',
      phone,
      zone,
      identificateur_name: identificateurName || null,
      notes: notes || null,
    }).select().single()

    if (error) throw error
    return NextResponse.json(actor, { status: 201 })
  } catch (error) {
    console.error('Erreur creation acteur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'acteur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ erreur: 'L\'identifiant et le statut sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_actors')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ erreur: 'Acteur introuvable' }, { status: 404 })
    }
    if (!canAccessZone(auth.user, existing.zone)) {
      return NextResponse.json({ erreur: 'Cet acteur ne relève pas de votre périmètre' }, { status: 403 })
    }

    const { data: actor, error } = await supabase
      .from('legacy_bo_actors')
      .update({
        status,
        validated_at: status === 'actif' ? new Date().toISOString() : existing.validated_at,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'actor_status_update', module: 'acteurs',
      details: `Acteur ${actor.actor_id} (${existing.status} → ${status})`, request,
    })

    return NextResponse.json(actor)
  } catch (error) {
    console.error('Erreur mise a jour acteur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'acteur' }, { status: 500 })
  }
}
