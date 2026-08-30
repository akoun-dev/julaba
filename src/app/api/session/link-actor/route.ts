import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

// Upserts a BoActor row for a self-service marchand/producteur account.
// bo-acteurs-screen.tsx's data model already expected producteur-type
// actors (ActorTypeFilter, marchands/producteurs counts) via the
// identificateur → BoActor enrolment pipeline, but the device-claim-based
// self-registration flow (marchand and producteur both) never created one —
// those real users were invisible in "Acteurs", and bo-producteurs-screen.tsx
// could only ever show an opaque producteurId. Called from app-store's
// setAuth right after the device-claim succeeds, so it's covered by the same
// ownership guarantee.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subjectType, id, firstName, phone } = body as {
      subjectType?: 'merchant' | 'producteur'
      id?: string
      firstName?: string
      phone?: string
    }

    if (subjectType !== 'merchant' && subjectType !== 'producteur') {
      return NextResponse.json({ error: 'Type de compte invalide' }, { status: 400 })
    }
    if (!id || !firstName || !phone) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const guard = await requireDeviceOwner(request, subjectType, id)
    if (guard) return guard

    const type = subjectType === 'merchant' ? 'marchand' : 'producteur'

    if (subjectType === 'merchant') {
      const existing = await db.boActor.findUnique({ where: { merchantId: id } })
      if (existing) {
        await db.boActor.update({ where: { id: existing.id }, data: { firstName, phone } })
      } else {
        await db.boActor.create({
          data: {
            actorId: `#M-${String(Math.floor(Math.random() * 9000) + 1000)}`,
            firstName,
            type,
            phone,
            zone: 'Non renseignée',
            status: 'actif',
            notes: 'Compte créé en libre-service (inscription directe dans l\'app)',
            merchantId: id,
          },
        })
      }
    } else {
      const existing = await db.boActor.findUnique({ where: { producteurId: id } })
      if (existing) {
        await db.boActor.update({ where: { id: existing.id }, data: { firstName, phone } })
      } else {
        await db.boActor.create({
          data: {
            actorId: `#P-${String(Math.floor(Math.random() * 9000) + 1000)}`,
            firstName,
            type,
            phone,
            zone: 'Non renseignée',
            status: 'actif',
            notes: 'Compte créé en libre-service (inscription directe dans l\'app)',
            producteurId: id,
          },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API session/link-actor]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
