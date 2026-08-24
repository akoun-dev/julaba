import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST - Create expense
export async function POST(req: NextRequest) {
  try {
    const { merchantId, amount, category, description, isVoice, voiceTranscript } = await req.json()

    if (!merchantId || !amount || !category) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
    }

    const expense = await db.expense.create({
      data: { merchantId, amount, category, description, isVoice: isVoice || false, voiceTranscript },
    })

    return NextResponse.json({ id: expense.id, amount: expense.amount })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET - Get expenses for a merchant
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get('merchantId')
    const date = searchParams.get('date')

    if (!merchantId) {
      return NextResponse.json({ error: 'merchantId requis' }, { status: 400 })
    }

    const where: Record<string, unknown> = { merchantId }

    if (date) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      where.createdAt = { gte: start, lte: end }
    }

    const expenses = await db.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(expenses)
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
