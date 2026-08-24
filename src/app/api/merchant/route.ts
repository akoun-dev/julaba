import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST - Create merchant (register)
export async function POST(req: NextRequest) {
  try {
    const { firstName, phone, pinHash } = await req.json()

    if (!firstName || !phone || !pinHash) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const existing = await db.merchant.findUnique({ where: { phone } })
    if (existing) {
      return NextResponse.json({ error: 'Ce numéro est déjà enregistré' }, { status: 409 })
    }

    const merchant = await db.merchant.create({
      data: { firstName, phone, pinHash },
    })

    return NextResponse.json({ id: merchant.id, firstName: merchant.firstName, phone: merchant.phone })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET - Get merchant
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
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
