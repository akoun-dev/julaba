import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Check whether a phone number has a merchant account, and which auth
// method it uses (so the client can route to the matching login step). No
// hash is ever returned here — verification happens through POST
// /api/merchant/login instead.
//
// Account creation is no longer done through this route: only an
// identificateur can create a merchant account now, as part of dossier
// submission (see /api/backoffice/enrolments POST).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }

    const merchant = await db.merchant.findUnique({ where: { phone } })
    if (!merchant) {
      return NextResponse.json({ error: 'Marchand non trouvé' }, { status: 404 })
    }

    return NextResponse.json({
      id: merchant.id,
      firstName: merchant.firstName,
      phone: merchant.phone,
      authMethod: merchant.authMethod,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
