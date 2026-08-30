import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'enrolement', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const zone = (auth.user.role === 'gestionnaire_zone' || auth.user.role === 'operateur_terrain') && auth.user.zone
      ? auth.user.zone
      : searchParams.get('zone')

    const where: Prisma.BoEnrolmentWhereInput = {}
    if (status) where.status = status
    if (zone) where.zone = zone

    const [enrolments, total] = await Promise.all([
      db.boEnrolment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.boEnrolment.count({ where }),
    ])

    return NextResponse.json({ enrolments, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage inscriptions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des inscriptions' }, { status: 500 })
  }
}

// Submitted by the identificateur mobile app when a field agent sends a
// dossier for validation — not a backoffice admin action, so this
// deliberately does NOT go through requireBackofficePermission: identificateur
// accounts are local-only (phone+PIN, no server session) today. It does
// still require a device-owner check on identificateurId (see
// device-session.ts) — the same device-binding used for marchand/producteur
// — so a dossier can't be submitted under someone else's name just by
// knowing their id.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dossierId, actorName, actorType, zone, identificateurId, identificateurName, phone, hasPhoto, hasGps } = body

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    if (!dossierId || !actorName || !zone || !phone) {
      return NextResponse.json({ erreur: 'Le dossier, l\'acteur, la zone et le téléphone sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boEnrolment.findUnique({ where: { dossierId } })
    if (existing) {
      // Already received (e.g. a retried offline-queue flush) — not a real
      // conflict, so the caller can treat this as success rather than retry forever.
      return NextResponse.json(existing, { status: 200 })
    }

    const enrolment = await db.boEnrolment.create({
      data: {
        dossierId,
        actorName,
        actorType: actorType || 'marchand',
        zone,
        identificateurId,
        identificateurName: identificateurName || 'Agent',
        phone,
        hasPhoto: !!hasPhoto,
        hasGps: !!hasGps,
        status: 'en_attente',
      },
    })
    return NextResponse.json(enrolment, { status: 201 })
  } catch (error) {
    console.error('Erreur creation inscription:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'inscription' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'enrolement', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, action, validatedBy, rejectReason } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boEnrolment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 })
    }
    if (!canAccessZone(auth.user, existing.zone)) {
      return NextResponse.json({ erreur: 'Ce dossier ne relève pas de votre périmètre' }, { status: 403 })
    }

    if (action === 'valider') {
      const enrolment = await db.boEnrolment.update({
        where: { id },
        data: { status: 'valide', validatedBy: validatedBy || null, validatedAt: new Date() },
      })
      await logAudit({
        userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
        action: 'enrolment_validate', module: 'enrolement', details: `Dossier ${enrolment.dossierId}`, request,
      })
      if (enrolment.identificateurId) {
        await createNotification({
          subjectType: 'identificateur', subjectId: enrolment.identificateurId, type: 'dossier_valide',
          title: 'Dossier validé', body: `Le dossier de ${enrolment.actorName} a été validé.`,
          data: { dossierId: enrolment.dossierId },
        })
      }
      return NextResponse.json(enrolment)
    }

    if (action === 'rejeter') {
      if (!rejectReason) {
        return NextResponse.json({ erreur: 'La raison du rejet est obligatoire' }, { status: 400 })
      }
      const enrolment = await db.boEnrolment.update({
        where: { id },
        data: { status: 'rejete', validatedBy: validatedBy || null, validatedAt: new Date(), rejectReason },
      })
      await logAudit({
        userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
        action: 'enrolment_reject', module: 'enrolement', details: `Dossier ${enrolment.dossierId}: ${rejectReason}`, request,
      })
      if (enrolment.identificateurId) {
        await createNotification({
          subjectType: 'identificateur', subjectId: enrolment.identificateurId, type: 'dossier_rejete',
          title: 'Dossier rejeté', body: `Le dossier de ${enrolment.actorName} a été rejeté : ${rejectReason}`,
          data: { dossierId: enrolment.dossierId },
        })
      }
      return NextResponse.json(enrolment)
    }

    return NextResponse.json({ erreur: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('Erreur mise a jour inscription:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement de l\'inscription' }, { status: 500 })
  }
}
