import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId') || 'merchant-1'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const category = searchParams.get('category')

    const where: Prisma.ExpenseWhereInput = { merchantId }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) (where.createdAt as Prisma.DateTimeNullableFilter).gte = new Date(startDate)
      if (endDate) (where.createdAt as Prisma.DateTimeNullableFilter).lte = new Date(endDate)
    }
    if (category) where.category = category

    const expenses = await db.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

    const categoryBreakdown = await db.expense.groupBy({
      by: ['category'],
      where: { merchantId },
      _sum: { amount: true },
    })

    return NextResponse.json({ expenses, totalExpenses, count: expenses.length, categoryBreakdown })
  } catch (error) {
    console.error('Erreur depenses marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des depenses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { merchantId, amount, category, description, isVoice, voiceTranscript } = body

    if (!amount || !category) {
      return NextResponse.json({ erreur: 'Le montant et la categorie sont obligatoires' }, { status: 400 })
    }

    const expense = await db.expense.create({
      data: {
        merchantId: merchantId || 'merchant-1',
        amount,
        category,
        description: description || null,
        isVoice: isVoice || false,
        voiceTranscript: voiceTranscript || null,
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Erreur creation depense:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la depense' }, { status: 500 })
  }
}
