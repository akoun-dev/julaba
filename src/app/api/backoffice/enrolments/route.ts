import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const zone = searchParams.get('zone')

    const where: Prisma.BoEnrolmentWhereInput = {}
    if (status) where.status = status
    if (zone) where.zone = zone

    const [enrolments, total] = await Promise.all([
      db.boEnrolment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boEnrolment.count({ where }),
    ])

    return NextResponse.json({ enrolments, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage inscriptions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des inscriptions' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action, validatedBy, rejectReason } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    if (action === 'valider') {
      const enrolment = await db.boEnrolment.update({
        where: { id },
        data: { status: 'valide', validatedBy: validatedBy || null, validatedAt: new Date() },
      })
      return NextResponse.json(enrolment)
    }

    if (action === 'rejeter') {
      if (!rejectReason) {
        return NextResponse.json({ erreur: 'La raison du rejet est obligatoire' }, { status: 400 })
      }
      const enrolment = await db.boEnrolment.update({
        where: { id },
        data: { status: 'rejete', validatedBy: validatedBy || null, validatedAt: new Date(), rejectReason },
      })
      return NextResponse.json(enrolment)
    }

    return NextResponse.json({ erreur: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('Erreur mise a jour inscription:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement de l\'inscription' }, { status: 500 })
  }
}
