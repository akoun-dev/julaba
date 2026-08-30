import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Check whether a phone number has a producteur account, and which
// auth method it uses. Mirrors /api/merchant — see that file's comment for
// why no hash is returned and why there's no POST here anymore.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }

    const producteur = await db.producteur.findUnique({ where: { phone } })
    if (!producteur) {
      return NextResponse.json({ error: 'Producteur non trouvé' }, { status: 404 })
    }

    return NextResponse.json({
      id: producteur.id,
      firstName: producteur.firstName,
      phone: producteur.phone,
      authMethod: producteur.authMethod,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
