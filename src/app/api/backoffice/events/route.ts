import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'events', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200)
    const levelParam = searchParams.get('level')

    let query = supabase
      .from('legacy_bo_system_events')
      .select('id, level, source, message, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (levelParam) {
      const levels = levelParam.split(',').map(l => l.trim()).filter(Boolean)
      if (levels.length > 0) {
        query = query.in('level', levels)
      }
    }

    let countQuery = supabase
      .from('legacy_bo_system_events')
      .select('*', { count: 'exact', head: true })

    if (levelParam) {
      const levels = levelParam.split(',').map(l => l.trim()).filter(Boolean)
      if (levels.length > 0) {
        countQuery = countQuery.in('level', levels)
      }
    }

    const [eventsResult, countResult] = await Promise.all([
      query,
      countQuery,
    ])

    if (eventsResult.error) throw eventsResult.error
    if (countResult.error) throw countResult.error

    const events = (eventsResult.data || []).map((e: any) => ({
      id: e.id,
      level: e.level,
      source: e.source,
      message: e.message,
      createdAt: e.created_at,
    }))

    return NextResponse.json({ events, count: countResult.count })
  } catch (error) {
    console.error('Erreur chargement evenements:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des evenements' }, { status: 500 })
  }
}
