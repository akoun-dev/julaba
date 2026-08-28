import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Prisma.BoMissionWhereInput = {}
    if (status) where.status = status

    const missions = await db.boMission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(missions)
  } catch (error) {
    console.error('Erreur listage missions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des missions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, zone, assigneeId, assigneeName, targetCount, startDate, endDate } = body

    if (!title || !zone || !startDate) {
      return NextResponse.json({ erreur: 'Le titre, la zone et la date de debut sont obligatoires' }, { status: 400 })
    }

    const mission = await db.boMission.create({
      data: {
        title,
        description: description || null,
        zone,
        assigneeId: assigneeId || null,
        assigneeName: assigneeName || null,
        targetCount: targetCount || 0,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
      },
    })
    return NextResponse.json(mission, { status: 201 })
  } catch (error) {
    console.error('Erreur creation mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la mission' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, currentCount } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (status) data.status = status
    if (currentCount !== undefined) data.currentCount = currentCount
    if (status === 'terminee') data.endDate = new Date()

    const mission = await db.boMission.update({
      where: { id },
      data,
    })
    return NextResponse.json(mission)
  } catch (error) {
    console.error('Erreur mise a jour mission:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la mission' }, { status: 500 })
  }
}
