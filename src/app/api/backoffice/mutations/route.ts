import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'mutations', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const fromZone = searchParams.get('fromZone')
    const toZone = searchParams.get('toZone')

    const supabase = createSupabaseAdminClient()
    const where: Record<string, string> = {}
    if (status) where.status = status
    if (fromZone) where.from_zone = fromZone
    if (toZone) where.to_zone = toZone

    const hasFilters = Object.keys(where).length > 0

    const [result, countResult] = await Promise.all([
      supabase
        .from('legacy_bo_mutations')
        .select('*')
        .match(where)
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
      hasFilters
        ? supabase
            .from('legacy_bo_mutations')
            .select('*', { count: 'exact', head: true })
            .match(where)
        : supabase
            .from('legacy_bo_mutations')
            .select('*', { count: 'exact', head: true }),
    ])

    if (result.error) throw result.error
    if (countResult.error) throw countResult.error

    const mutations = result.data ?? []
    const total = countResult.count ?? 0

    return NextResponse.json({ mutations, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage mutations:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des mutations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'mutations', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { actorId, actorName, actorType, fromZone, toZone, reason, requestedBy } = body

    if (!actorId || !actorName || !fromZone || !toZone) {
      return NextResponse.json({ erreur: 'L\'acteur, la zone d\'origine et la zone de destination sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: mutation, error } = await supabase
      .from('legacy_bo_mutations')
      .insert({
        actor_id: actorId,
        actor_name: actorName,
        actor_type: actorType || 'marchand',
        from_zone: fromZone,
        to_zone: toZone,
        reason: reason || null,
        requested_by: requestedBy || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(mutation, { status: 201 })
  } catch (error) {
    console.error('Erreur creation mutation:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la mutation' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'mutations', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, action, rejectReason } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const data: Record<string, unknown> = { processed_by: auth.user.name, processed_at: new Date().toISOString() }
    if (action === 'approuver') data.status = 'approuvee'
    else if (action === 'refuser') {
      data.status = 'refusee'
      data.reject_reason = rejectReason || 'Aucune raison fournie'
    }
    else return NextResponse.json({ erreur: 'Action non reconnue. Utilisez approuver ou refuser.' }, { status: 400 })

    const supabase = createSupabaseAdminClient()
    const { data: mutation, error } = await supabase
      .from('legacy_bo_mutations')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: `mutation_${action}`, module: 'mutations', details: `Mutation ${mutation.actor_name} ${mutation.from_zone} → ${mutation.to_zone}`, request,
    })

    return NextResponse.json(mutation)
  } catch (error) {
    console.error('Erreur traitement mutation:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement de la mutation' }, { status: 500 })
  }
}
