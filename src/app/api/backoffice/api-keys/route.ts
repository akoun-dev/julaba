import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

// Fields safe to hand back to the client — secretHash is a one-way digest
// (never usable to authenticate even if leaked) but is still excluded from
// every response on principle: an API response is not the place for it.
const SAFE_SELECT = {
  id: true, name: true, description: true, key: true, permissions: true, requestCount: true,
  lastUsedAt: true, expiresAt: true, isActive: true, createdBy: true,
  createdAt: true, updatedAt: true,
} as const

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const keys = await db.boApiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    })
    return NextResponse.json(keys)
  } catch (error) {
    console.error('Erreur listage cles API:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des cles API' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { name, description, permissions, expiresInDays } = body

    if (!name) {
      return NextResponse.json({ erreur: 'Le nom est obligatoire' }, { status: 400 })
    }

    // crypto.randomBytes, not Math.random() — the latter is not
    // cryptographically secure and its output is predictable enough to
    // brute-force. The secret is returned once, in this response only; the
    // database keeps just its SHA-256 hash.
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const key = `jlb_${slug}_${randomBytes(9).toString('base64url')}`
    const secret = `sec_${randomBytes(32).toString('base64url')}`
    const secretHash = createHash('sha256').update(secret).digest('hex')

    const apiKey = await db.boApiKey.create({
      data: {
        name,
        description: description || null,
        key,
        secretHash,
        permissions: permissions || 'read',
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
        createdBy: auth.user.name,
      },
      select: SAFE_SELECT,
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'api_key_create', module: 'api-keys', details: name, request,
    })

    // The only time the caller ever sees the real secret — the UI must show
    // it once and warn it won't be retrievable again.
    return NextResponse.json({ ...apiKey, secret }, { status: 201 })
  } catch (error) {
    console.error('Erreur creation cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la cle API' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, isActive } = body

    if (!id || isActive === undefined) {
      return NextResponse.json({ erreur: 'L\'identifiant et le statut sont obligatoires' }, { status: 400 })
    }

    const apiKey = await db.boApiKey.update({
      where: { id },
      data: { isActive },
      select: SAFE_SELECT,
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: isActive ? 'api_key_enable' : 'api_key_disable', module: 'api-keys', details: apiKey.name, request,
    })

    return NextResponse.json(apiKey)
  } catch (error) {
    console.error('Erreur mise a jour cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la cle API' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const deleted = await db.boApiKey.delete({ where: { id } })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'api_key_delete', module: 'api-keys', details: deleted.name, request,
    })

    return NextResponse.json({ succes: 'Cle API revoquee' })
  } catch (error) {
    console.error('Erreur suppression cle API:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la revocation de la cle API' }, { status: 500 })
  }
}
