import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId') || 'merchant-1'
    const category = searchParams.get('category')

    const where: Prisma.ProductWhereInput = { merchantId }
    if (category) where.category = category

    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('Erreur produits marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des produits' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { merchantId, name, category, priceUnit, stockQty, imageUrl } = body

    if (!name) {
      return NextResponse.json({ erreur: 'Le nom du produit est obligatoire' }, { status: 400 })
    }

    const product = await db.product.create({
      data: {
        merchantId: merchantId || 'merchant-1',
        name,
        category: category || 'autre',
        priceUnit: priceUnit || 0,
        stockQty: stockQty || 0,
        imageUrl: imageUrl || null,
      },
    })
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Erreur creation produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation du produit' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    const product = await db.product.update({ where: { id }, data })
    return NextResponse.json(product)
  } catch (error) {
    console.error('Erreur mise a jour produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour du produit' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: "L'identifiant est obligatoire" }, { status: 400 })
    }

    await db.product.delete({ where: { id } })
    return NextResponse.json({ succes: 'Produit supprime' })
  } catch (error) {
    console.error('Erreur suppression produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression du produit' }, { status: 500 })
  }
}
