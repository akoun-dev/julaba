import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const users = await db.boUser.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error('Erreur listage utilisateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des utilisateurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, passwordHash, name, role, zone } = body

    if (!email || !name || !role) {
      return NextResponse.json({ erreur: 'L\'email, le nom et le role sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boUser.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ erreur: 'Un utilisateur avec cet email existe deja' }, { status: 400 })
    }

    // Generate a secure temporary password if none provided
    const tempPassword = passwordHash || Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
    const user = await db.boUser.create({
      data: {
        email,
        passwordHash: tempPassword,
        name,
        role,
        zone: zone || null,
        forcePasswordChange: !passwordHash,
      },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Erreur creation utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'utilisateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, role, isActive, zone, name } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (role) data.role = role
    if (isActive !== undefined) data.isActive = isActive
    if (zone !== undefined) data.zone = zone
    if (name) data.name = name

    const user = await db.boUser.update({ where: { id }, data })
    return NextResponse.json(user)
  } catch (error) {
    console.error('Erreur mise a jour utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'utilisateur' }, { status: 500 })
  }
}
