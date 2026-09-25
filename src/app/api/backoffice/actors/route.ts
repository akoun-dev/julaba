import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { normalizeZoneKey } from '@/lib/objectifs'
import { normalizeMarchandCategorie } from '@/lib/marchand-categories'
import { sanitizeSearchTerm } from '@/lib/postgrest-search'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const zone = (auth.user.role === 'gestionnaire_zone' || auth.user.role === 'operateur_terrain') && auth.user.zone
      ? auth.user.zone
      : searchParams.get('zone')

    const supabase = createSupabaseAdminClient()

    let query = supabase.from('legacy_bo_actors').select('*', { count: 'exact' })

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,actor_id.ilike.%${search}%,phone.ilike.%${search}%`)
    }
    if (status) query = query.eq('status', status)
    if (type) query = query.eq('type', type)
    // MODE-1005 (AUDIT-012 P2) : égalité sur la clé normalisée (colonne
    // générée zone_key) — « Adjame » et « Adjamé » sont la même zone.
    if (zone) query = query.eq('zone_key', normalizeZoneKey(zone))

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: actors, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({ actors: actors || [], total: total || 0, page, limit, totalPages: Math.ceil((total || 0) / limit) })
  } catch (error) {
    console.error('Erreur listage acteurs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des acteurs' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'acteurs', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, status, categorieMarchand } = body

    // Deux mutations possibles (au moins une requise) : le statut, et —
    // pour les marchands seulement — la classification détaillant /
    // semi-grossiste / grossiste, jusque-là en lecture seule dans le
    // backoffice alors que la nomenclature est éditable à l'enrôlement.
    if (!id || (status === undefined && categorieMarchand === undefined)) {
      return NextResponse.json({ erreur: 'L\'identifiant et un champ à modifier (statut ou catégorie) sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_actors')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ erreur: 'Acteur introuvable' }, { status: 404 })
    }
    if (!canAccessZone(auth.user, existing.zone)) {
      return NextResponse.json({ erreur: 'Cet acteur ne relève pas de votre périmètre' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}
    if (status !== undefined) {
      updates.status = status
      updates.validated_at = status === 'actif' ? new Date().toISOString() : existing.validated_at
    }
    if (categorieMarchand !== undefined) {
      if (existing.type !== 'marchand') {
        return NextResponse.json({ erreur: 'La classification marchand s\'applique uniquement aux marchands' }, { status: 400 })
      }
      const normalized = normalizeMarchandCategorie(categorieMarchand)
      if (categorieMarchand && !normalized) {
        return NextResponse.json({ erreur: 'Catégorie inconnue : détaillant, semi-grossiste ou grossiste attendus' }, { status: 400 })
      }
      updates.categorie_marchand = normalized
    }

    const { data: actor, error } = await supabase
      .from('legacy_bo_actors')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // La classification canonique vit aussi sur la table merchants (les
    // écrans marchands la lisent là) : garder les deux en phase quand le
    // lien merchant_id existe.
    if (categorieMarchand !== undefined && existing.merchant_id) {
      const { error: merchantError } = await supabase
        .from('merchants')
        .update({ categorie_marchand: updates.categorie_marchand })
        .eq('id', existing.merchant_id)
      if (merchantError) console.error('[API backoffice/actors PATCH] mirror merchants', merchantError)
    }

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: categorieMarchand !== undefined && status === undefined ? 'actor_categorie_update' : 'actor_status_update',
      module: 'acteurs',
      details: categorieMarchand !== undefined && status === undefined
        ? `Acteur ${actor.actor_id} : catégorie → ${actor.categorie_marchand ?? 'non classé'}`
        : `Acteur ${actor.actor_id} (${existing.status} → ${status ?? existing.status})`,
      request,
    })

    return NextResponse.json(actor)
  } catch (error) {
    console.error('Erreur mise a jour acteur:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de l\'acteur' }, { status: 500 })
  }
}
