import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications'
import { formatFCFA } from '@/lib/voice/localIntent'

// Tontines the merchant actually belongs to (TontineMember), each with this
// merchant's running total of contributions — replaces the old
// TontinesScreen's hardcoded MOCK_TONTINES, which had no server backing at
// all despite Tontine/TontineMember already existing in the schema.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const memberships = await db.tontineMember.findMany({
      where: { merchantId: merchantId! },
      include: { tontine: true },
    })

    const tontines = await Promise.all(
      memberships.map(async (m) => {
        const total = await db.tontineContribution.aggregate({
          where: { tontineId: m.tontineId, merchantId: merchantId! },
          _sum: { amount: true },
        })
        return {
          id: m.tontine.id,
          name: m.tontine.name,
          amount: m.tontine.amount,
          frequency: m.tontine.frequency,
          memberCount: m.tontine.memberCount,
          nextDueDate: m.tontine.nextDueDate,
          totalCotiseFcfa: total._sum.amount ?? 0,
        }
      })
    )

    return NextResponse.json({ tontines })
  } catch (error) {
    console.error('[API marchand/tontines GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { merchantId, tontineId, amount, clientId } = body

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    if (!tontineId || !amount || amount <= 0) {
      return NextResponse.json({ erreur: 'tontineId et montant sont obligatoires' }, { status: 400 })
    }

    if (clientId) {
      const existing = await db.tontineContribution.findUnique({ where: { clientId } })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const membership = await db.tontineMember.findFirst({ where: { tontineId, merchantId }, include: { tontine: true } })
    if (!membership) {
      return NextResponse.json({ erreur: "Vous n'êtes pas membre de cette tontine" }, { status: 403 })
    }

    const contribution = await db.tontineContribution.create({
      data: { tontineId, merchantId, amount, clientId: clientId || null },
    })

    await createNotification({
      subjectType: 'merchant', subjectId: merchantId, type: 'tontine_cotisation',
      title: 'Cotisation confirmée',
      body: `Votre cotisation de ${formatFCFA(amount)} pour "${membership.tontine.name}" a été enregistrée.`,
      data: { tontineId },
    })

    return NextResponse.json(contribution, { status: 201 })
  } catch (error) {
    console.error('[API marchand/tontines POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
