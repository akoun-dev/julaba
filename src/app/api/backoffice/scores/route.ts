import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'scores', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const zone = searchParams.get('zone')
    const riskLevel = searchParams.get('riskLevel')

    const supabase = createSupabaseAdminClient()
    const where: Record<string, string> = {}
    if (zone) where.zone = zone
    if (riskLevel) where.risk_level = riskLevel

    const hasFilters = Object.keys(where).length > 0

    const [result, countResult] = await Promise.all([
      supabase
        .from('legacy_bo_credit_scores')
        .select('*')
        .match(where)
        .order('score', { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
      hasFilters
        ? supabase
            .from('legacy_bo_credit_scores')
            .select('*', { count: 'exact', head: true })
            .match(where)
        : supabase
            .from('legacy_bo_credit_scores')
            .select('*', { count: 'exact', head: true }),
    ])

    if (result.error) throw result.error
    if (countResult.error) throw countResult.error

    const scores = result.data ?? []
    const total = countResult.count ?? 0

    // Compute risk level distribution
    const { data: allScores, error: allScoresError } = await supabase
      .from('legacy_bo_credit_scores')
      .select('risk_level, score')
    if (allScoresError) throw allScoresError

    const riskCounts: Record<string, number> = {}
    for (const s of allScores ?? []) {
      riskCounts[s.risk_level] = (riskCounts[s.risk_level] || 0) + 1
    }

    const FILL_MAP: Record<string, string> = {
      faible: '#06B6D4',
      moyen: '#3B82F6',
      eleve: '#F59E0B',
      critique: '#EF4444',
    }

    const distribution = Object.entries(riskCounts).map(([level, count]) => ({
      range: level.charAt(0).toUpperCase() + level.slice(1),
      count,
      fill: FILL_MAP[level] || '#94A3B8',
    }))

    return NextResponse.json({ scores, total, page, limit, totalPages: Math.ceil(total / limit), distribution })
  } catch (error) {
    console.error('Erreur listage scores:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des scores de credit' }, { status: 500 })
  }
}
