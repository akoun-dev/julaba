import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type AuthMethod = 'pin' | 'pattern'
const HASH_FIELD: Record<AuthMethod, 'pinHash' | 'patternHash'> = {
  pin: 'pinHash',
  pattern: 'patternHash',
}

// Verifies a login attempt against the server-stored credential. Mirrors
// /api/merchant/login — see that file's comment for the design rationale.
export async function POST(req: NextRequest) {
  try {
    const { phone, method, hash } = await req.json()

    if (!phone || !hash || !['pin', 'pattern'].includes(method)) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const producteur = await db.producteur.findUnique({ where: { phone } })
    if (!producteur) {
      return NextResponse.json({ error: 'Producteur non trouvé' }, { status: 404 })
    }

    const field = HASH_FIELD[method as AuthMethod]
    if (producteur.authMethod !== method || !producteur[field] || producteur[field] !== hash) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 })
    }

    return NextResponse.json({ id: producteur.id, firstName: producteur.firstName, phone: producteur.phone })
  } catch (error) {
    console.error('[API producteur/login]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
