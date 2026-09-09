import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

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

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data)
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
    const { title, description, zone, assigneeId, assigneeName, targetCount, startDate, endDate } = body

    if (!title || !zone || !startDate) {
      return NextResponse.json({ erreur: 'Le titre, la zone et la date de debut sont obligatoires' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('legacy_bo_missions')
      .insert({
        title,
        description: description || null,
        zone,
        assignee_id: assigneeId || null,
        assignee_name: assigneeName || null,
        target_count: targetCount || 0,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Erreur creation mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la mission' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'missions', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { id, status, currentCount } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
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
