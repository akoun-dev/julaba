import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST - Create caisse session
export async function POST(req: NextRequest) {
  try {
    const { merchantId, fondDeCaisse } = await req.json()

    if (!merchantId || fondDeCaisse === undefined) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
    }

    // Close any open session
    await db.caisseSession.updateMany({
      where: { merchantId, isOpen: true },
      data: { isOpen: false, closedAt: new Date() },
    })

    const session = await db.caisseSession.create({
      data: { merchantId, fondDeCaisse },
    })

    return NextResponse.json({ id: session.id, fondDeCaisse: session.fondDeCaisse })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET - Get today's session
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')

    if (!merchantId) {
      return NextResponse.json({ error: 'merchantId requis' }, { status: 400 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const session = await db.caisseSession.findFirst({
      where: { merchantId, openedAt: { gte: today } },
      orderBy: { openedAt: 'desc' },
    })

    if (!session) {
      return NextResponse.json(null)
    }

    // Calculate totals
    const sales = await db.sale.findMany({
      where: { merchantId, sessionId: session.id },
    })
    const expenses = await db.expense.findMany({
      where: {
        merchantId,
        createdAt: { gte: session.openedAt },
      },
    })

    const totalVentes = sales.reduce((sum, s) => sum + s.totalAmount, 0)
    const totalDepenses = expenses.reduce((sum, e) => sum + e.amount, 0)

    return NextResponse.json({
      ...session,
      totalVentes,
      totalDepenses,
      totalFinal: session.fondDeCaisse + totalVentes - totalDepenses,
      salesCount: sales.length,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH - Close session
export async function PATCH(req: NextRequest) {
  try {
    const { sessionId, totalVentes, totalDepenses, totalFinal } = await req.json()

    await db.caisseSession.update({
      where: { id: sessionId },
      data: {
        isOpen: false,
        closedAt: new Date(),
        totalVentes,
        totalDepenses,
        totalFinal,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}