import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'

// MODE-1014 (AUDIT-013) — détection de concurrence sur la configuration :
// la colonne updated_at (trigger set_updated_at_legacy) existe déjà. Le GET
// l'expose par catégorie (configs[].updatedAt — champ additif) ; un client
// prudent renvoie expectedUpdatedAt dans le PATCH : s'il ne correspond plus
// à la ligne, la configuration a été modifiée entre-temps → 409
// CONCURRENCY_CONFLICT au lieu de l'écrasement last-write-wins. Absent →
// comportement historique (rétro-compatible).
const CONFLIT_CONFIG = 'La configuration a été modifiée par un autre agent — rechargez avant d’enregistrer'
function reponseConflit() {
  return NextResponse.json({ erreur: CONFLIT_CONFIG, code: 'CONCURRENCY_CONFLICT' }, { status: 409 })
}

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
    const configsArr: { key: string; value: unknown; updatedAt?: string }[] = []
    for (const c of configs) {
      try {
        const parsed = JSON.parse(c.config)
        result[c.category] = parsed
        configsArr.push({ key: c.category, value: parsed, updatedAt: c.updated_at })
      } catch {
        result[c.category] = c.config
        configsArr.push({ key: c.category, value: c.config, updatedAt: c.updated_at })
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
    const body = await request.json() as { category?: string; expectedUpdatedAt?: unknown } & Record<string, unknown>
    const { category, expectedUpdatedAt, ...configData } = body

    if (!category) {
      return NextResponse.json({ erreur: 'La categorie est obligatoire' }, { status: 400 })
    }
    if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(expectedUpdatedAt)))) {
      return NextResponse.json({ erreur: 'Horodatage de concurrence invalide' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const configJson = JSON.stringify(configData)

    const { data: existing } = await supabase
      .from('legacy_bo_platform_configs')
      .select('category, updated_at')
      .eq('category', category)
      .single()

    let config
    if (existing) {
      // MODE-1014 — le client croyait lire une version qui n'est plus la
      // courante : refus AVANT écriture.
      if (expectedUpdatedAt !== undefined && Date.parse(existing.updated_at) !== Date.parse(expectedUpdatedAt as string)) {
        return reponseConflit()
      }
      let updateQuery = supabase
        .from('legacy_bo_platform_configs')
        .update({ config: configJson })
        .eq('category', category)
      if (expectedUpdatedAt !== undefined) {
        // Fenêtre lecture→écriture fermée : l'UPDATE ne porte que si
        // updated_at vaut toujours la version lue (trigger la réécrit après).
        updateQuery = updateQuery.eq('updated_at', existing.updated_at)
      }
      const { data: rows, error } = await updateQuery.select()
      if (error) throw error
      if (!rows || rows.length === 0) return reponseConflit()
      config = rows[0]
    } else {
      if (expectedUpdatedAt !== undefined) {
        // Le client référence une version d'une catégorie qui n'existe plus.
        return reponseConflit()
      }
      const { data, error } = await supabase
        .from('legacy_bo_platform_configs')
        .insert({ category, config: configJson })
        .select()
        .single()
      if (error) {
        // MODE-1014 — deux back-offices créent la même catégorie en même
        // temps : le perdant de l'unique(category) obtient 23505 → 409.
        if ((error as { code?: string }).code === '23505') return reponseConflit()
        throw error
      }
      config = data
    }

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'config_update', module: 'config-institution', details: category, request,
    })

    return NextResponse.json({ succes: true, category: config.category, updatedAt: config.updated_at })
  } catch (error) {
    console.error('Erreur mise a jour configuration:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la configuration' }, { status: 500 })
  }
}
