import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST - Create a sale
export async function POST(req: NextRequest) {
  try {
    const { merchantId, items, totalAmount, amountReceived, changeAmount, isVoiceSale, voiceTranscript, sessionId } = await req.json()

    if (!merchantId || !items || !totalAmount) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
    }

    const sale = await db.sale.create({
      data: {
        merchantId,
        totalAmount,
        amountReceived: amountReceived || totalAmount,
        changeAmount: changeAmount || 0,
        isVoiceSale: isVoiceSale || false,
        voiceTranscript,
        sessionId,
        items: {
          create: items.map((item: { productName: string; quantity: number; unitPrice: number; subtotal: number; productId?: string }) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            productId: item.productId,
          })),
        },
      },
      include: { items: true },
    })

    // Update product stock
    for (const item of items) {
      if (item.productId) {
        await db.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.quantity } },
        })
      }
    }

    return NextResponse.json({ id: sale.id, totalAmount: sale.totalAmount })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET - Get sales for a merchant
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

    const sales = await db.sale.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(sales)
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
