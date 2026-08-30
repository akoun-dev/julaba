import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import type { DeviceSubjectType } from '@/lib/device-session'

const VALID_TARGETS: (DeviceSubjectType | 'all')[] = ['merchant', 'producteur', 'identificateur', 'all']

// Broadcasts a real in-app Notification to every actor of a given role (or
// everyone) — until now the notification system was entirely automatic
// (fired only by real domain events), with no way for an admin to send a
// one-off announcement (e.g. "rapport hebdomadaire disponible").
//
// Recipients come from DeviceSession, the real roster of accounts that have
// actually claimed a device — not from BoActor, which only self-service
// marchand/producteur registrations link to (identificateur never does, and
// even for marchand/producteur an account not yet linked would be missed).
// Single-actor targeting was considered but dropped for this pass: BoActor's
// own `identificateurId` field means something else entirely (the staff
// member who validated a dossier, not a mobile-app device subject), so
// there's no reliable way to resolve "one specific identificateur" today —
// broadcasting by role is what the current data model actually supports.
export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'notifications', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { targetType, title, message } = body as { targetType?: string; title?: string; message?: string }

    if (!targetType || !VALID_TARGETS.includes(targetType as DeviceSubjectType | 'all')) {
      return NextResponse.json({ erreur: 'Cible invalide' }, { status: 400 })
    }
    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ erreur: 'Le titre et le message sont obligatoires' }, { status: 400 })
    }

    const sessions = await db.deviceSession.findMany({
      where: targetType === 'all' ? undefined : { subject: { startsWith: `${targetType}:` } },
      select: { subject: true },
    })

    if (sessions.length === 0) {
      return NextResponse.json({ erreur: 'Aucun destinataire trouvé pour cette cible' }, { status: 404 })
    }

    await db.notification.createMany({
      data: sessions.map((s) => ({
        subject: s.subject,
        type: 'annonce',
        title: title.trim(),
        body: message.trim(),
      })),
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'notification_broadcast', module: 'notifications',
      details: `"${title.trim()}" envoyée à ${sessions.length} destinataire(s) (cible: ${targetType})`, request,
    })

    return NextResponse.json({ ok: true, recipientCount: sessions.length })
  } catch (error) {
    console.error('[API backoffice/notifications POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
