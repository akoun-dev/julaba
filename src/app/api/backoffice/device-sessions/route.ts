import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

// Admin visibility + recovery path for the device-claim security model
// (src/lib/device-session.ts): first device to claim a subject
// ("merchant:<id>" etc) owns it permanently, with no other way to recover a
// lost or stolen phone. Until now there was no way for an admin to even see
// which devices were claimed, let alone revoke one to unblock a user.
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'device-sessions', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const sessions = await db.deviceSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { id: true, subject: true, createdAt: true, expiresAt: true },
    })

    const merchantIds = sessions.filter((s) => s.subject.startsWith('merchant:')).map((s) => s.subject.slice('merchant:'.length))
    const producteurIds = sessions.filter((s) => s.subject.startsWith('producteur:')).map((s) => s.subject.slice('producteur:'.length))

    const [merchantActors, producteurActors] = await Promise.all([
      merchantIds.length ? db.boActor.findMany({ where: { merchantId: { in: merchantIds } }, select: { merchantId: true, firstName: true, phone: true } }) : [],
      producteurIds.length ? db.boActor.findMany({ where: { producteurId: { in: producteurIds } }, select: { producteurId: true, firstName: true, phone: true } }) : [],
    ])
    const byMerchantId = Object.fromEntries(merchantActors.map((a) => [a.merchantId as string, a]))
    const byProducteurId = Object.fromEntries(producteurActors.map((a) => [a.producteurId as string, a]))

    const enriched = sessions.map((s) => {
      const [type, id] = s.subject.split(':')
      const actor = type === 'merchant' ? byMerchantId[id] : type === 'producteur' ? byProducteurId[id] : undefined
      return { ...s, type, subjectId: id, actorName: actor ? `${actor.firstName}` : null, actorPhone: actor?.phone ?? null }
    })

    return NextResponse.json({ sessions: enriched })
  } catch (error) {
    console.error('[API backoffice/device-sessions GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des sessions appareil' }, { status: 500 })
  }
}

// DELETE - revoke a device claim so the account can be re-claimed by a new
// device (account recovery after a lost/stolen phone). ?id=<DeviceSession.id>
export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'device-sessions', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })
    }

    const existing = await db.deviceSession.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ erreur: 'Session introuvable' }, { status: 404 })
    }

    await db.deviceSession.delete({ where: { id } })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'device_session_revoke', module: 'device-sessions',
      details: `Session appareil révoquée pour ${existing.subject}`, request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API backoffice/device-sessions DELETE]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la révocation' }, { status: 500 })
  }
}
