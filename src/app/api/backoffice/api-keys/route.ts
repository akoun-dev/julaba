import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'api-keys', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const keys = await db.boApiKey.findMany({
      orderBy: { createdAt: 'desc' },
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
    const { name, permissions, expiresInDays } = body

    if (!name) {
      return NextResponse.json({ erreur: 'Le nom est obligatoire' }, { status: 400 })
    }

    const randomStr = () => Math.random().toString(36).slice(2, 14)
    const key = `jlb_${name.toLowerCase().replace(/\ /g, '_')}_${randomStr()}`
    const secret = `sec_${randomStr()}_${randomStr()}`

    const apiKey = await db.boApiKey.create({
      data: {
        name,
        key,
        secret,
        permissions: permissions || 'read',
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
        createdBy: auth.user.name,
      },
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'api_key_create', module: 'api-keys', details: name, request,
    })

    return NextResponse.json(apiKey, { status: 201 })
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
