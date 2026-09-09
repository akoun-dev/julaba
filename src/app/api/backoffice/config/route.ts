import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'config-institution', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_platform_configs')
      .select('*')
      .order('category', { ascending: true })

    if (error) throw error

    const configs = data ?? []
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

    const supabase = createSupabaseAdminClient()
    const configJson = JSON.stringify(configData)

    const { data: existing } = await supabase
      .from('legacy_bo_platform_configs')
      .select('category')
      .eq('category', category)
      .single()

    let config
    if (existing) {
      const { data, error } = await supabase
        .from('legacy_bo_platform_configs')
        .update({ config: configJson })
        .eq('category', category)
        .select()
        .single()
      if (error) throw error
      config = data
    } else {
      const { data, error } = await supabase
        .from('legacy_bo_platform_configs')
        .insert({ category, config: configJson })
        .select()
        .single()
      if (error) throw error
      config = data
    }

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
