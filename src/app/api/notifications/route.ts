import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDeviceSubject } from '@/lib/device-session'

// In-app notification center for marchand/producteur/identificateur.
// Identity comes entirely from the device-session cookie (never a
// client-supplied subject) — a device only ever reads or marks-read its own
// notifications, same trust boundary as every other actor-facing route.
export async function GET(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where: { subject }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.notification.count({ where: { subject, read: false } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('[API notifications GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH { id } marks one notification read, { all: true } marks every
// unread notification for this subject read. updateMany (not update) so a
// notification id that doesn't belong to this subject silently matches
// zero rows instead of leaking whether it exists.
export async function PATCH(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ erreur: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    if (body.all) {
      await db.notification.updateMany({ where: { subject, read: false }, data: { read: true } })
    } else if (body.id) {
      await db.notification.updateMany({ where: { id: body.id, subject }, data: { read: true } })
    } else {
      return NextResponse.json({ erreur: 'id ou all requis' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API notifications PATCH]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
