import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimDeviceSession, deviceSessionCookieOptions, subjectFor, DEVICE_SESSION_COOKIE } from '@/lib/device-session'
import { createNotification } from '@/lib/notifications'

type AuthMethod = 'pin' | 'pattern' | 'visual'
const HASH_FIELD: Record<AuthMethod, 'pin_hash' | 'pattern_hash' | 'visual_code_hash'> = {
  pin: 'pin_hash',
  pattern: 'pattern_hash',
  visual: 'visual_code_hash',
}

// Verifies a login attempt against the server-stored credential (set by an
// identificateur at enrollment — see /api/backoffice/enrolments POST). The
// client computes the same non-cryptographic hash it always has (simpleHash
// of the PIN, or of the pattern/visual sequence) and sends only that — never
// the raw PIN/pattern — matching the shape already used for registration.
//
// On success this also performs the device's *first* claim on this account
// (see claimDeviceSession's requireExisting doc) — binding the device here,
// right after the hash is actually verified, is what stops someone from
// claiming an account they never proved they could log into by calling
// /api/session/claim directly with a guessed id. The client still calls that
// route afterward (from setAuth), which by then only ever renews the
// session this route just created.
//
// On success the client also caches {id, firstName, phone, authMethod, hash}
// locally (secure storage) so the device can keep logging in offline
// afterwards without hitting this route again, same as before this change.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, hash } = await req.json()

    if (!phone || !hash || !['pin', 'pattern', 'visual'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: merchant } = await supabase.from('merchants').select('*').eq('phone', phone).single()
    if (!merchant) {
      return NextResponse.json({ error: 'Marchand non trouvé' }, { status: 404 })
    }

    const field = HASH_FIELD[method as AuthMethod]
    if (merchant.auth_method !== method || !merchant[field] || merchant[field] !== hash) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
    }

    const claim = await claimDeviceSession(subjectFor('merchant', merchant.id), req)
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status })
    }
    if (claim.isNew) {
      await createNotification({
        subjectType: 'merchant', subjectId: merchant.id, type: 'bienvenue',
        title: 'Bienvenue sur Jùlaba',
        body: "Bienvenue sur Jùlaba ! Enregistrez vos ventes, suivez votre stock et vos dépenses au quotidien.",
      })
    }

    const response = NextResponse.json({ id: merchant.id, firstName: merchant.first_name, phone: merchant.phone })
    response.cookies.set(DEVICE_SESSION_COOKIE, claim.token, deviceSessionCookieOptions(claim.expiresAt))
    return response
  } catch (error) {
    console.error('[API merchant/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
