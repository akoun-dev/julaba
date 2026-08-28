import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unacknowledgedOnly = searchParams.get('unacknowledged') === 'true'

    const where = unacknowledgedOnly ? { acknowledged: false } : {}
    const alerts = await db.boAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(alerts)
  } catch (error) {
    console.error('Erreur listage alertes:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des alertes' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, acknowledged } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const alert = await db.boAlert.update({
      where: { id },
      data: { acknowledged: acknowledged !== undefined ? acknowledged : true },
    })
    return NextResponse.json(alert)
  } catch (error) {
    console.error('Erreur mise a jour alerte:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'alerte' }, { status: 500 })
  }
}
