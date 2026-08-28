import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'zones', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const zones = await db.boZone.findMany({
      orderBy: { name: 'asc' },
    })

    const [actorCounts, enrolmentCounts] = await Promise.all([
      db.boActor.groupBy({ by: ['zone'], _count: { id: true } }),
      db.boEnrolment.groupBy({ by: ['zone'], _count: { id: true } }),
    ])

    const actorMap = Object.fromEntries(actorCounts.map((a) => [a.zone, a._count.id]))
    const enrolMap = Object.fromEntries(enrolmentCounts.map((e) => [e.zone, e._count.id]))

    const enriched = zones.map((z) => ({
      ...z,
      actualActorCount: actorMap[z.name] || 0,
      enrolmentCount: enrolMap[z.name] || 0,
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Erreur listage zones:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des zones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'zones', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, region } = body

    if (!name || !region) {
      return NextResponse.json({ erreur: 'Le nom et la region sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boZone.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ erreur: 'Cette zone existe deja' }, { status: 400 })
    }

    const zone = await db.boZone.create({ data: { name, region } })
    return NextResponse.json(zone, { status: 201 })
  } catch (error) {
    console.error('Erreur creation zone:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la zone' }, { status: 500 })
  }
}
