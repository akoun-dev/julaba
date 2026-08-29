import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireDeviceOwner } from '@/lib/require-owner'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const category = searchParams.get('category')

    const where: Prisma.ProductWhereInput = { merchantId: merchantId! }
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
    const { merchantId, name, category, priceUnit, stockQty, imageUrl, clientId } = body

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    if (!name) {
      return NextResponse.json({ erreur: 'Le nom du produit est obligatoire' }, { status: 400 })
    }

    // Idempotency: if a clientId was provided, check if this exact submission
    // already landed (e.g. a retried offline-queue flush after a lost
    // response) — matched on the real clientId column, not name, so two
    // genuinely distinct restocks of the same product name are never merged.
    if (clientId) {
      const existing = await db.product.findUnique({ where: { clientId } })
      if (existing) {
        return NextResponse.json(existing, { status: 200 })
      }
    }

    const product = await db.product.create({
      data: {
        merchantId,
        clientId: clientId || null,
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

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ erreur: 'Produit introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'merchant', existing.merchantId)
    if (auth) return auth

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

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ erreur: 'Produit introuvable' }, { status: 404 })
    }
    const auth = await requireDeviceOwner(request, 'merchant', existing.merchantId)
    if (auth) return auth

    await db.product.delete({ where: { id } })
    return NextResponse.json({ succes: 'Produit supprime' })
  } catch (error) {
    console.error('Erreur suppression produit:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression du produit' }, { status: 500 })
  }
}
