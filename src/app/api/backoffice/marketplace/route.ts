import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'marketplace', 'read')
  if (auth instanceof NextResponse) return auth

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
