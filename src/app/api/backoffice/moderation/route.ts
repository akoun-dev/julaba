import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'moderation', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const targetType = searchParams.get('targetType')
    const severity = searchParams.get('severity')

    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('legacy_bo_moderation_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) query = query.eq('status', status)
    if (targetType) query = query.eq('target_type', targetType)
    if (severity) query = query.eq('severity', severity)

    const { data: reports, error, count } = await query

    if (error) throw error

    const total = count || 0

    return NextResponse.json({ reports, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage moderation:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des rapports de moderation' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'moderation', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { id, action, resolutionNote } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (action === 'traiter') data.status = 'traitee'
    else if (action === 'ignorer') data.status = 'ignoree'
    else if (action === 'resoudre') {
      data.status = 'traitee'
      data.resolved_at = new Date().toISOString()
      data.resolution_note = resolutionNote || null
    }
    else return NextResponse.json({ erreur: 'Action non reconnue. Utilisez traiter, resoudre ou ignorer.' }, { status: 400 })

    const { data: report, error } = await supabase
      .from('legacy_bo_moderation_reports')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: `moderation_${action}`, module: 'moderation', details: `Signalement ${id}`, request,
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error('Erreur traitement rapport:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement du rapport' }, { status: 500 })
  }
}
