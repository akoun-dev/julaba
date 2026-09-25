import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createActeurAvecIdUnique } from '@/lib/actor-id-server'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — payload de app-store.setAuth ({ subjectType, id, firstName,
// phone }, tous strings ; fire-and-forget, jamais rejoué offline).
// subjectType est comparé aux littéraux 'merchant'/'producteur' → 400 « Type
// de compte invalide » (validation manuelle préservée → z.unknown()) ;
// !id || !firstName || !phone → 400 « Champs requis manquants » →
// .nullable().optional() pour que null traverse aussi vers ce message.
const linkActorSchema = z.object({
  subjectType: z.unknown().optional(),
  id: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
})

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
    const parsedLink = linkActorSchema.safeParse(body)
    if (!parsedLink.success) {
      return NextResponse.json({ erreur: formatZodError(parsedLink.error) }, { status: 400 })
    }
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
    const supabase = createSupabaseAdminClient()

    if (subjectType === 'merchant') {
      const { data: existing } = await supabase
        .from('legacy_bo_actors')
        .select('*')
        .eq('merchant_id', id)
        .single()

      if (existing) {
        await supabase
          .from('legacy_bo_actors')
          .update({ first_name: firstName, phone })
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        // MODE-941 (AUDIT-003 I-09) — actor_id séquentiel avec réessai
        // (fin du 4 chiffres aléatoires sur colonne UNIQUE).
        await createActeurAvecIdUnique(
          supabase,
          {
            first_name: firstName,
            type,
            phone,
            zone: 'Non renseignée',
            status: 'actif',
            notes: 'Compte créé automatiquement à la première connexion.',
            merchant_id: id,
          },
          'M',
        )
      }
    } else {
      const { data: existing } = await supabase
        .from('legacy_bo_actors')
        .select('*')
        .eq('producteur_id', id)
        .single()

      if (existing) {
        await supabase
          .from('legacy_bo_actors')
          .update({ first_name: firstName, phone })
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        // MODE-941 (AUDIT-003 I-09) — actor_id séquentiel avec réessai.
        await createActeurAvecIdUnique(
          supabase,
          {
            first_name: firstName,
            type,
            phone,
            zone: 'Non renseignée',
            status: 'actif',
            notes: 'Compte créé automatiquement à la première connexion.',
            producteur_id: id,
          },
          'P',
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[API session/link-actor]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
