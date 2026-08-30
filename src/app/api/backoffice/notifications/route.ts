import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { subjectFor, type DeviceSubjectType } from '@/lib/device-session'

const VALID_TARGETS: (DeviceSubjectType | 'all')[] = ['merchant', 'producteur', 'identificateur', 'all']

// Broadcasts a real in-app Notification to every actor of a given role (or
// everyone), or to one specific merchant/producteur — until now the
// notification system was entirely automatic (fired only by real domain
// events), with no way for an admin to send a one-off announcement (e.g.
// "rapport hebdomadaire disponible").
//
// Recipients for a role broadcast come from DeviceSession, the real roster
// of accounts that have actually claimed a device — not from BoActor, which
// only self-service marchand/producteur registrations link to.
//
// Single-actor targeting resolves through that same BoActor link
// (merchantId/producteurId, see /api/session/link-actor), so it only works
// for marchand/producteur — never identificateur: BoActor's own
// `identificateurId` field means something else entirely (the staff member
// who validated a dossier, not a mobile-app device subject), so there's no
// reliable way to resolve "one specific identificateur" today.
export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'notifications', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { targetType, actorId, title, message } = body as {
      targetType?: string; actorId?: string; title?: string; message?: string
    }

    if (!targetType || !VALID_TARGETS.includes(targetType as DeviceSubjectType | 'all')) {
      return NextResponse.json({ erreur: 'Cible invalide' }, { status: 400 })
    }
    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ erreur: 'Le titre et le message sont obligatoires' }, { status: 400 })
    }

    let subjects: string[]

    if (actorId) {
      if (targetType !== 'merchant' && targetType !== 'producteur') {
        return NextResponse.json({ erreur: 'Le ciblage individuel est réservé aux marchands et producteurs' }, { status: 400 })
      }
      const actor = await db.boActor.findUnique({ where: { id: actorId } })
      const linkedId = targetType === 'merchant' ? actor?.merchantId : actor?.producteurId
      if (!actor || !linkedId) {
        return NextResponse.json({ erreur: 'Cet acteur n\'est lié à aucun compte appareil' }, { status: 404 })
      }
      subjects = [subjectFor(targetType, linkedId)]
    } else {
      const sessions = await db.deviceSession.findMany({
        where: targetType === 'all' ? undefined : { subject: { startsWith: `${targetType}:` } },
        select: { subject: true },
      })
      if (sessions.length === 0) {
        return NextResponse.json({ erreur: 'Aucun destinataire trouvé pour cette cible' }, { status: 404 })
      }
      subjects = sessions.map((s) => s.subject)
    }

    // Same instant for every row in this broadcast (rather than each row's
    // own @default(now())) so the history view below can group them back
    // into "one broadcast" reliably, without a separate batch-id column.
    const sentAt = new Date()
    await db.notification.createMany({
      data: subjects.map((subject) => ({
        subject,
        type: 'annonce',
        title: title.trim(),
        body: message.trim(),
        createdAt: sentAt,
      })),
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'notification_broadcast', module: 'notifications',
      details: `"${title.trim()}" envoyée à ${subjects.length} destinataire(s) (cible: ${actorId ? `${targetType}:${actorId}` : targetType})`, request,
    })

    return NextResponse.json({ ok: true, recipientCount: subjects.length })
  } catch (error) {
    console.error('[API backoffice/notifications POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// History of past broadcasts — grouped back from individual per-recipient
// Notification rows (see the shared `sentAt` above) since there's no
// separate "broadcast" record, just many identical rows, one per recipient.
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'notifications', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const groups = await db.notification.groupBy({
      by: ['title', 'body', 'createdAt'],
      where: { type: 'annonce' },
      _count: { _all: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      broadcasts: groups.map((g) => ({
        title: g.title,
        message: g.body,
        recipientCount: g._count._all,
        sentAt: g.createdAt,
      })),
    })
  } catch (error) {
    console.error('[API backoffice/notifications GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
