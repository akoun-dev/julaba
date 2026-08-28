import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const institutions = await db.boInstitution.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(institutions)
  } catch (error) {
    console.error('Erreur listage institutions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des institutions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, contactName, contactEmail, contactPhone, address } = body

    if (!name || !type) {
      return NextResponse.json({ erreur: 'Le nom et le type sont obligatoires' }, { status: 400 })
    }

    const institution = await db.boInstitution.create({
      data: { name, type, contactName, contactEmail, contactPhone, address },
    })
    return NextResponse.json(institution, { status: 201 })
  } catch (error) {
    console.error('Erreur creation institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'institution' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const institution = await db.boInstitution.update({ where: { id }, data })
    return NextResponse.json(institution)
  } catch (error) {
    console.error('Erreur mise a jour institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'institution' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    await db.boInstitution.delete({ where: { id } })
    return NextResponse.json({ succes: 'Institution supprimee' })
  } catch (error) {
    console.error('Erreur suppression institution:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression de l\'institution' }, { status: 500 })
  }
}
