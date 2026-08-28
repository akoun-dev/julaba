import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'communication', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const communications = await db.boCommunication.findMany({
      orderBy: { createdAt: 'desc' },
    })
    const mapped = communications.map(c => ({
      id: c.id,
      channel: c.type,
      destType: c.targetZone ? 'zone' as const : 'all' as const,
      destLabel: c.targetZone || c.targetGroup,
      subject: c.title,
      message: c.content,
      status: c.status,
      sentAt: c.sentAt?.toISOString() || c.createdAt.toISOString(),
      totalRecipients: c.sentCount,
      delivered: Math.round(c.sentCount * (c.deliveryRate ?? 0) / 100),
      failed: c.sentCount - Math.round(c.sentCount * (c.deliveryRate ?? 0) / 100),
      pending: 0,
    }))
    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Erreur listage communications:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des communications' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'communication', 'create')
  if (auth instanceof NextResponse) return auth

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
