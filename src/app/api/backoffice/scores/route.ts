import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const zone = searchParams.get('zone')
    const riskLevel = searchParams.get('riskLevel')

    const where: Prisma.BoCreditScoreWhereInput = {}
    if (zone) where.zone = zone
    if (riskLevel) where.riskLevel = riskLevel

    const [scores, total] = await Promise.all([
      db.boCreditScore.findMany({
        where,
        orderBy: { score: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boCreditScore.count({ where }),
    ])

    // Compute risk level distribution
    const allScores = await db.boCreditScore.findMany({ select: { riskLevel: true, score: true } })
    const riskCounts: Record<string, number> = {}
    for (const s of allScores) {
      riskCounts[s.riskLevel] = (riskCounts[s.riskLevel] || 0) + 1
    }
    const distribution = Object.entries(riskCounts).map(([level, count]) => ({ level, count }))

    return NextResponse.json({ scores, total, page, limit, totalPages: Math.ceil(total / limit), distribution })
  } catch (error) {
    console.error('Erreur listage scores:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des scores de credit' }, { status: 500 })
  }
}
