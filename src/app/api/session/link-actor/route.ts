import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireDeviceOwner } from '@/lib/require-owner'

// Upserts a BoActor row for a marchand/producteur account the first time it
// logs into a device. bo-acteurs-screen.tsx's data model already expected
// producteur-type actors (ActorTypeFilter, marchands/producteurs counts) via
// the identificateur → BoActor enrolment pipeline, but that pipeline doesn't
// create a BoActor row at dossier-validation time — so without this call,
// real accounts (however they were created) were invisible in "Acteurs",
// and bo-producteurs-screen.tsx could only ever show an opaque producteurId.
// Called from app-store's setAuth right after the device-claim succeeds, so
// it's covered by the same ownership guarantee. Idempotent: called again on
// every later login for the same account, it just refreshes the display
// fields on the BoActor row it already created.
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
            notes: 'Compte créé automatiquement à la première connexion.',
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
            notes: 'Compte créé automatiquement à la première connexion.',
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
