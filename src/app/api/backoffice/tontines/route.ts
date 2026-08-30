import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Read-only backoffice visibility into the Tontine/TontineMember/
// TontineContribution feature — until now this had no admin-facing screen
// or API route at all, despite being a real, working money-tracking
// feature for marchands (see src/components/marchand/secondary-screens.tsx).
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'tontines', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const [tontines, contributions] = await Promise.all([
      db.tontine.findMany({
        orderBy: { createdAt: 'desc' },
        include: { members: { include: { merchant: { select: { id: true, firstName: true, phone: true } } } } },
      }),
      db.tontineContribution.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const merchantIds = [...new Set(contributions.map((c) => c.merchantId))]
    const merchants = merchantIds.length
      ? await db.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, firstName: true, phone: true } })
      : []
    const merchantById = Object.fromEntries(merchants.map((m) => [m.id, m]))

    const totalsByTontine = contributions.reduce<Record<string, number>>((acc, c) => {
      acc[c.tontineId] = (acc[c.tontineId] ?? 0) + c.amount
      return acc
    }, {})

    return NextResponse.json({
      tontines: tontines.map((t) => ({
        id: t.id,
        name: t.name,
        amount: t.amount,
        frequency: t.frequency,
        memberCount: t.memberCount,
        nextDueDate: t.nextDueDate,
        createdAt: t.createdAt,
        members: t.members.map((m) => ({ id: m.id, joinedAt: m.joinedAt, merchant: m.merchant })),
        totalCotiseFcfa: totalsByTontine[t.id] ?? 0,
      })),
      contributions: contributions.map((c) => ({ ...c, merchant: merchantById[c.merchantId] ?? null })),
    })
  } catch (error) {
    console.error('[API backoffice/tontines GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des tontines' }, { status: 500 })
  }
}
