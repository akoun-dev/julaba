import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [products, totalProducts] = await Promise.all([
      db.product.findMany({
        orderBy: { createdAt: 'desc' },
        include: { merchant: { select: { firstName: true, lastName: true, phone: true } } },
      }),
      db.product.count(),
    ])

    const categories = await db.product.groupBy({
      by: ['category'],
      _count: { id: true },
      _sum: { stockQty: true },
    })

    return NextResponse.json({
      products,
      totalProducts,
      categories,
    })
  } catch (error) {
    console.error('Erreur marketplace:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du marketplace' }, { status: 500 })
  }
}
