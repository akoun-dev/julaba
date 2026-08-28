import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')

    const where: Prisma.BoDeliveryWhereInput = {}
    if (status) where.status = status

    const [deliveries, total] = await Promise.all([
      db.boDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boDelivery.count({ where }),
    ])

    return NextResponse.json({ deliveries, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage livraisons:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des livraisons' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, courierName } = body

    if (!id || !status) {
      return NextResponse.json({ erreur: "L'identifiant et le statut sont obligatoires" }, { status: 400 })
    }

    const data: Record<string, unknown> = { status }
    if (courierName) data.courierName = courierName
    if (status === 'ramassee') data.pickupAt = new Date()
    if (status === 'livree') data.deliveredAt = new Date()

    const delivery = await db.boDelivery.update({ where: { id }, data })
    return NextResponse.json(delivery)
  } catch (error) {
    console.error('Erreur mise a jour livraison:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la livraison' }, { status: 500 })
  }
}
