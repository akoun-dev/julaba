import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE } from '@/lib/device-session'
import { createNotification } from '@/lib/notifications/server'

type AuthMethod = 'pin' | 'pattern'
const HASH_FIELD: Record<AuthMethod, 'pin_hash' | 'pattern_hash'> = {
  pin: 'pin_hash',
  pattern: 'pattern_hash',
}

// Verifies a login attempt against the server-stored credential, and
// performs the device's first claim on success. Mirrors /api/merchant/login
// — see that file's comment for the full design rationale.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, hash } = await req.json()

    if (!phone || !hash || !['pin', 'pattern'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: producteur } = await supabase.from('producers').select('*').eq('phone', phone).single()
    if (!producteur) {
      return NextResponse.json({ error: 'Producteur non trouvé' }, { status: 404 })
    }

    const field = HASH_FIELD[method as AuthMethod]
    if (producteur.auth_method !== method || !producteur[field] || producteur[field] !== hash) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
    }

    const claim = await claimDeviceSession(subjectFor('producteur', producteur.id), req)
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }
    if (claim.isNew) {
      await createNotification({
        subjectType: 'producteur', subjectId: producteur.id, type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba',
        body: "Bienvenue sur Jùlaba ! Déclarez vos récoltes et suivez vos commandes directement depuis l'application.",
      })
    }

    const response = NextResponse.json({ id: producteur.id, firstName: producteur.first_name, phone: producteur.phone, sexe: producteur.sexe || null })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API producteur/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
