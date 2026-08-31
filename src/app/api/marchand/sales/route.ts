import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createSaleSchema, formatZodError } from '@/lib/validation/marchand'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Prisma.SaleWhereInput = { merchantId: merchantId! }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) (where.createdAt as Prisma.DateTimeNullableFilter).gte = new Date(startDate)
      if (endDate) (where.createdAt as Prisma.DateTimeNullableFilter).lte = new Date(endDate)
    }

    const sales = await db.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })

    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0)

    return NextResponse.json({ sales, totalRevenue, count: sales.length })
  } catch (error) {
    console.error('Erreur ventes marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des ventes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createSaleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, items, amountReceived, isVoiceSale, voiceTranscript, note, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    // Idempotency: matched on the real clientId column (see Product's POST
    // for why this used to be a "cid:" prefix hack that corrupted the
    // merchant's own free-text note).
    if (clientId) {
      const existing = await db.sale.findUnique({
        where: { clientId },
        include: { items: true },
      })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const saleItemsData = items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
      productId: item.productId || null,
    }))

    // Recomputed server-side from the validated items, never trusted from
    // the client — see createSaleSchema's comment.
    const totalAmount = saleItemsData.reduce((sum, item) => sum + item.subtotal, 0)
    const changeAmount = (amountReceived || 0) - totalAmount

    const sale = await db.sale.create({
      data: {
        merchantId,
        clientId: clientId || null,
        totalAmount,
        amountReceived: amountReceived || 0,
        changeAmount: Math.max(0, changeAmount),
        isVoiceSale: isVoiceSale || false,
        voiceTranscript: voiceTranscript || null,
        note: note || null,
        items: { create: saleItemsData },
      },
      include: { items: true },
    })

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    console.error('Erreur creation vente:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la vente' }, { status: 500 })
  }
}
