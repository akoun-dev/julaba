import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, hashPassword, logAudit } from '@/lib/backoffice-auth'

// Never return passwordHash (or other credential material) to the client.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  zone: true,
  isActive: true,
  lastLogin: true,
  forcePasswordChange: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const users = await db.boUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: SAFE_USER_SELECT,
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error('Erreur listage utilisateurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des utilisateurs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { email, name, role, zone } = body

    if (!email || !name || !role) {
      return NextResponse.json({ erreur: 'L\'email, le nom et le role sont obligatoires' }, { status: 400 })
    }

    const existing = await db.boUser.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ erreur: 'Un utilisateur avec cet email existe deja' }, { status: 400 })
    }

    // Always generate a fresh, random temporary password server-side — never
    // a caller-supplied or hardcoded one — and force it to be changed on
    // first login.
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
    const user = await db.boUser.create({
      data: {
        email,
        passwordHash: hashPassword(tempPassword),
        name,
        role,
        zone: zone || null,
        forcePasswordChange: true,
      },
      select: SAFE_USER_SELECT,
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_create', module: 'utilisateurs', details: `Création de ${email} (${role})`, request,
    })

    // The temporary password is only ever returned here, once, to the admin
    // who just created the account — it is never persisted or re-exposed.
    return NextResponse.json({ ...user, tempPassword }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'utilisateur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'utilisateurs', 'update')
  if (auth instanceof NextResponse) return auth

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

    const user = await db.boUser.update({ where: { id }, data, select: SAFE_USER_SELECT })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'user_update', module: 'utilisateurs', details: `Mise à jour de ${user.email}: ${JSON.stringify(data)}`, request,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Erreur mise a jour utilisateur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'utilisateur' }, { status: 500 })
  }
}
