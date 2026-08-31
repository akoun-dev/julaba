import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type AuthMethod = 'pin' | 'pattern' | 'visual'

// POST - Create merchant (register). Accepts the client-generated id so the
// same identifier works whether the account is created immediately or
// queued offline and synced later (src/lib/offline-db.ts) — no reconciling
// two different ids across the online/offline paths.
export async function POST(req: NextRequest) {
  try {
    const { id, firstName, phone, authMethod, pinHash, patternHash, visualCodeHash } = await req.json()

    if (!firstName || !phone) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const method: AuthMethod = ['pin', 'pattern', 'visual'].includes(authMethod) ? authMethod : 'pin'
    const hashByMethod: Record<AuthMethod, string | undefined> = {
      pin: pinHash,
      pattern: patternHash,
      visual: visualCodeHash,
    }
    if (!hashByMethod[method]) {
      return NextResponse.json({ error: 'Code d\'authentification manquant' }, { status: 400 })
    }

    const existing = await db.merchant.findUnique({ where: { phone } })
    if (existing) {
      // A retry of the same client's queued registration (offline sync) —
      // treat as success instead of a conflict.
      if (id && existing.id === id) {
        return NextResponse.json({ id: existing.id, firstName: existing.firstName, phone: existing.phone })
      }
      return NextResponse.json({ error: 'Ce numéro est déjà enregistré' }, { status: 409 })
    }

    const merchant = await db.merchant.create({
      data: {
        id: id || undefined,
        firstName,
        phone,
        authMethod: method,
        pinHash: pinHash || null,
        patternHash: patternHash || null,
        visualCodeHash: visualCodeHash || null,
      },
    })

    return NextResponse.json({ id: merchant.id, firstName: merchant.firstName, phone: merchant.phone })
  } catch (error) {
    console.error('Erreur inscription marchand:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH - Update merchant credentials (pinHash / patternHash / visualCodeHash).
// Used by the biometric recovery flow: after the user proves identity via
// biometrics and sets a new PIN, the new hash must be pushed to the server
// so other devices or future registrations stay in sync.
export async function PATCH(req: NextRequest) {
  try {
    const { phone, authMethod, pinHash, patternHash, visualCodeHash } = await req.json()

    if (!phone) {
      return NextResponse.json({ error: 'Phone requis' }, { status: 400 })
    }

    const existing = await db.merchant.findUnique({ where: { phone } })
    if (!existing) {
      return NextResponse.json({ error: 'Marchand non trouvé' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (authMethod) data.authMethod = authMethod
    if (pinHash !== undefined) data.pinHash = pinHash
    if (patternHash !== undefined) data.patternHash = patternHash
    if (visualCodeHash !== undefined) data.visualCodeHash = visualCodeHash

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const updated = await db.merchant.update({ where: { phone }, data })
    return NextResponse.json({ id: updated.id, phone: updated.phone })
  } catch (error) {
    console.error('Erreur mise à jour marchand:', error)
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
