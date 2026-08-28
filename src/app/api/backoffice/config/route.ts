import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'config-institution', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const configs = await db.boPlatformConfig.findMany({
      orderBy: { category: 'asc' },
    })

    const result: Record<string, unknown> = {}
    const configsArr: { key: string; value: unknown }[] = []
    for (const c of configs) {
      try {
        const parsed = JSON.parse(c.config)
        result[c.category] = parsed
        configsArr.push({ key: c.category, value: parsed })
      } catch {
        result[c.category] = c.config
        configsArr.push({ key: c.category, value: c.config })
      }
    }

    return NextResponse.json({ ...result, configs: configsArr })
  } catch (error) {
    console.error('Erreur chargement configuration:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement de la configuration' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'config-institution', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { category, ...configData } = body

    if (!category) {
      return NextResponse.json({ erreur: 'La categorie est obligatoire' }, { status: 400 })
    }

    const config = await db.boPlatformConfig.upsert({
      where: { category },
      update: { config: JSON.stringify(configData) },
      create: { category, config: JSON.stringify(configData) },
    })

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'config_update', module: 'config-institution', details: category, request,
    })

    return NextResponse.json({ succes: true, category: config.category })
  } catch (error) {
    console.error('Erreur mise a jour configuration:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la configuration' }, { status: 500 })
  }
}
