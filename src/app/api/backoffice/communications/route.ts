import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const communications = await db.boCommunication.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(communications)
  } catch (error) {
    console.error('Erreur listage communications:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des communications' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, type, content, targetGroup, targetZone } = body

    if (!title || !type || !content || !targetGroup) {
      return NextResponse.json({ erreur: 'Le titre, le type, le contenu et le groupe cible sont obligatoires' }, { status: 400 })
    }

    const communication = await db.boCommunication.create({
      data: {
        title,
        type,
        content,
        targetGroup,
        targetZone: targetZone || null,
        status: 'brouillon',
      },
    })
    return NextResponse.json(communication, { status: 201 })
  } catch (error) {
    console.error('Erreur creation communication:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la communication' }, { status: 500 })
  }
}
