import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createExpenseSchema, formatZodError } from '@/lib/validation/marchand'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const category = searchParams.get('category')

    const where: Prisma.ExpenseWhereInput = { merchantId: merchantId! }
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
      where: { merchantId: merchantId! },
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
    const parsed = createExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, amount, category, description, isVoice, voiceTranscript, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    // Idempotency: matched on the real clientId column (see Product's POST
    // for why this used to be a "cid:" prefix hack that corrupted the
    // merchant's own free-text description).
    if (clientId) {
      const existing = await db.expense.findUnique({ where: { clientId } })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const expense = await db.expense.create({
      data: {
        merchantId,
        clientId: clientId || null,
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
