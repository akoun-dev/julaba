import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'events', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200)
    const levelParam = searchParams.get('level')

    const where: { level?: { in: string[] } } = {}
    if (levelParam) {
      const levels = levelParam.split(',').map(l => l.trim()).filter(Boolean)
      if (levels.length > 0) {
        where.level = { in: levels }
      }
    }

    const [events, count] = await Promise.all([
      db.boSystemEvent.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          level: true,
          source: true,
          message: true,
          createdAt: true,
        },
      }),
      db.boSystemEvent.count({ where }),
    ])

    return NextResponse.json({ events, count })
  } catch (error) {
    console.error('Erreur chargement evenements:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des evenements' }, { status: 500 })
  }
}