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

    return NextResponse.json({ scores, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage scores:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des scores de credit' }, { status: 500 })
  }
}
