import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'moderation', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const targetType = searchParams.get('targetType')
    const severity = searchParams.get('severity')

    const where: Prisma.BoModerationReportWhereInput = {}
    if (status) where.status = status
    if (targetType) where.targetType = targetType
    if (severity) where.severity = severity

    const [reports, total] = await Promise.all([
      db.boModerationReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boModerationReport.count({ where }),
    ])

    return NextResponse.json({ reports, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage moderation:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des rapports de moderation' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'moderation', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, action } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (action === 'traiter') data.status = 'traitee'
    else if (action === 'ignorer') data.status = 'ignoree'
    else return NextResponse.json({ erreur: 'Action non reconnue. Utilisez traiter ou ignorer.' }, { status: 400 })

    const report = await db.boModerationReport.update({ where: { id }, data })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: `moderation_${action}`, module: 'moderation', details: `Signalement ${id}`, request,
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error('Erreur traitement rapport:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement du rapport' }, { status: 500 })
  }
}
