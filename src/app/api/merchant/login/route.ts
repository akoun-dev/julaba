import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type AuthMethod = 'pin' | 'pattern' | 'visual'
const HASH_FIELD: Record<AuthMethod, 'pinHash' | 'patternHash' | 'visualCodeHash'> = {
  pin: 'pinHash',
  pattern: 'patternHash',
  visual: 'visualCodeHash',
}

// Verifies a login attempt against the server-stored credential (set by an
// identificateur at enrollment — see /api/backoffice/enrolments POST). The
// client computes the same non-cryptographic hash it always has (simpleHash
// of the PIN, or of the pattern/visual sequence) and sends only that — never
// the raw PIN/pattern — matching the shape already used for registration.
//
// On success the client caches {id, firstName, phone, authMethod, hash}
// locally (secure storage) so the device can keep logging in offline
// afterwards without hitting this route again, same as before this change.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, hash } = await req.json()

    if (!phone || !hash || !['pin', 'pattern', 'visual'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const merchant = await db.merchant.findUnique({ where: { phone } })
    if (!merchant) {
      return NextResponse.json({ error: 'Marchand non trouvé' }, { status: 404 })
    }

    const field = HASH_FIELD[method as AuthMethod]
    if (merchant.authMethod !== method || !merchant[field] || merchant[field] !== hash) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
    }

    return NextResponse.json({ id: merchant.id, firstName: merchant.firstName, phone: merchant.phone })
  } catch (error) {
    console.error('[API merchant/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
