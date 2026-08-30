import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDeviceSubject } from '@/lib/device-session'

// Server-side mirror of a device's local sync_conflicts table
// (src/lib/offline-db.ts): a mutation the server definitively rejected and
// that will never succeed on retry. Previously these only ever existed on
// the originating device — invisible to any admin. recordSyncConflict()
// best-effort POSTs each one here so the backoffice can see them too.
// Identity comes from the device-session cookie (never a client-supplied
// id), so a report can't be forged as coming from another account.
export async function POST(request: NextRequest) {
  try {
    const subject = await getDeviceSubject(request)
    if (!subject) {
      return NextResponse.json({ error: 'Session appareil requise' }, { status: 401 })
    }

    const body = await request.json()
    const { entity, payload, message, clientCreatedAt } = body as {
      entity?: string
      payload?: unknown
      message?: string
      clientCreatedAt?: number
    }

    if (!entity || !message || !clientCreatedAt) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    await db.syncConflictReport.create({
      data: {
        subject,
        entity,
        payload: JSON.stringify(payload ?? null),
        message,
        clientCreatedAt: new Date(clientCreatedAt),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API sync-conflicts/report]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
