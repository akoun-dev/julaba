import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  // Alerts feed the dashboard summary for every role, so read access follows
  // the (broader) dashboard module rather than the supervision module.
  const auth = await requireBackofficePermission(request, 'dashboard', 'read')
  if (auth instanceof NextResponse) return auth

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
  const auth = await requireBackofficePermission(request, 'supervision', 'update')
  if (auth instanceof NextResponse) return auth

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

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'alert_acknowledge', module: 'supervision', details: alert.title, request,
    })

    return NextResponse.json(alert)
  } catch (error) {
    console.error('Erreur mise a jour alerte:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'alerte' }, { status: 500 })
  }
}
