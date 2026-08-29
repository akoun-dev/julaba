import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const producteurId = searchParams.get('producteurId')
    const cycleId = searchParams.get('cycleId')

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!cycleId) {
      return NextResponse.json({ error: 'cycleId requis' }, { status: 400 })
    }

    const entries = await db.producteurJournal.findMany({
      where: { producteurId: producteurId!, cycleId },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('[API producteur/journal GET]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, producteurId, cycleId, date, texte, photoUrl } = body

    const auth = await requireDeviceOwner(request, 'producteur', producteurId)
    if (auth) return auth

    if (!id || !cycleId || !date || !texte) {
      return NextResponse.json(
        { error: 'Champs requis manquants (id, cycleId, date, texte)' },
        { status: 400 },
      )
    }

    const existing = await db.producteurJournal.findUnique({ where: { id } })
    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const entry = await db.producteurJournal.create({
      data: {
        id,
        producteurId,
        cycleId,
        date: new Date(date),
        texte,
        photoUrl: photoUrl || null,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('[API producteur/journal POST]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
