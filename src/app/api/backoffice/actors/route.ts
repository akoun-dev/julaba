import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    // Zone-scoped roles only ever see their own zone, regardless of the query param.
    const zone = (auth.user.role === 'gestionnaire_zone' || auth.user.role === 'operateur_terrain') && auth.user.zone
      ? auth.user.zone
      : searchParams.get('zone')

    const where: Prisma.BoActorWhereInput = {}
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { actorId: { contains: search } },
        { phone: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (type) where.type = type
    if (zone) where.zone = zone

    const [actors, total] = await Promise.all([
      db.boActor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boActor.count({ where }),
    ])

    return NextResponse.json({ actors, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage acteurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des acteurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { firstName, lastName, type, phone, zone, identificateurName, notes } = body

    if (!firstName || !phone || !zone) {
      return NextResponse.json({ erreur: 'Le prenom, le telephone et la zone sont obligatoires' }, { status: 400 })
    }

    if (!canAccessZone(auth.user, zone)) {
      return NextResponse.json({ erreur: 'Cette zone ne relève pas de votre périmètre' }, { status: 403 })
    }

    const actor = await db.boActor.create({
      data: {
        actorId: `#${(type || 'marchand').charAt(0).toUpperCase()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        firstName,
        lastName: lastName || null,
        type: type || 'marchand',
        phone,
        zone,
        identificateurName: identificateurName || null,
        notes: notes || null,
      },
    })
    return NextResponse.json(actor, { status: 201 })
  } catch (error) {
    console.error('Erreur creation acteur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'acteur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ erreur: 'L\'identifiant et le statut sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boActor.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ erreur: 'Acteur introuvable' }, { status: 404 })
    }
    if (!canAccessZone(auth.user, existing.zone)) {
      return NextResponse.json({ erreur: 'Cet acteur ne relève pas de votre périmètre' }, { status: 403 })
    }

    const actor = await db.boActor.update({
      where: { id },
      data: { status, validatedAt: status === 'actif' ? new Date() : undefined },
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'actor_status_update', module: 'acteurs',
      details: `Acteur ${actor.actorId} (${existing.status} → ${status})`, request,
    })

    return NextResponse.json(actor)
  } catch (error) {
    console.error('Erreur mise a jour acteur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'acteur' }, { status: 500 })
  }
}
