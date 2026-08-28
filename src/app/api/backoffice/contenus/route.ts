import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')

    const where: Prisma.BoContentWhereInput = {}
    if (type) where.type = type
    if (status) where.status = status

    const contents = await db.boContent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(contents)
  } catch (error) {
    console.error('Erreur listage contenus:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des contenus' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { title, type, category, content, author, status } = body

    if (!title || !type || !content) {
      return NextResponse.json({ erreur: 'Le titre, le type et le contenu sont obligatoires' }, { status: 400 })
    }

    const newContent = await db.boContent.create({
      data: { title, type, category: category || null, content, author: author || null, status: status || 'brouillon' },
    })
    return NextResponse.json(newContent, { status: 201 })
  } catch (error) {
    console.error('Erreur creation contenu:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation du contenu' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const updated = await db.boContent.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour contenu:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour du contenu' }, { status: 500 })
  }
}
