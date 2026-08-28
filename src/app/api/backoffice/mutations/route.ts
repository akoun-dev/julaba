import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const fromZone = searchParams.get('fromZone')
    const toZone = searchParams.get('toZone')

    const where: Prisma.BoMutationWhereInput = {}
    if (status) where.status = status
    if (fromZone) where.fromZone = fromZone
    if (toZone) where.toZone = toZone

    const [mutations, total] = await Promise.all([
      db.boMutation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boMutation.count({ where }),
    ])

    return NextResponse.json({ mutations, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage mutations:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des mutations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { actorId, actorName, fromZone, toZone, reason, requestedBy } = body

    if (!actorId || !actorName || !fromZone || !toZone) {
      return NextResponse.json({ erreur: 'L\'acteur, la zone d\'origine et la zone de destination sont obligatoires' }, { status: 400 })
    }

    const mutation = await db.boMutation.create({
      data: { actorId, actorName, fromZone, toZone, reason: reason || null, requestedBy: requestedBy || null },
    })
    return NextResponse.json(mutation, { status: 201 })
  } catch (error) {
    console.error('Erreur creation mutation:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la mutation' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action, processedBy } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const data: Record<string, unknown> = { processedBy: processedBy || null, processedAt: new Date() }
    if (action === 'approuver') data.status = 'approuvee'
    else if (action === 'refuser') data.status = 'refusee'
    else return NextResponse.json({ erreur: 'Action non reconnue. Utilisez approuver ou refuser.' }, { status: 400 })

    const mutation = await db.boMutation.update({ where: { id }, data })
    return NextResponse.json(mutation)
  } catch (error) {
    console.error('Erreur traitement mutation:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement de la mutation' }, { status: 500 })
  }
}
