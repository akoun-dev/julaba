import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { sanitizeSearchTerm } from '@/lib/postgrest-search'

// Colonnes renvoyées aux écrans BO en camelCase (les écrans Académie et
// Contenus lisent targetRole/viewCount/mediaUrl/createdAt… — les colonnes
// brutes snake_case restaient invisible ou tombaient à « Invalid Date »).
const CONTENT_COLUMNS_TO_API = {
  id: 'id',
  title: 'title',
  type: 'type',
  category: 'category',
  content: 'content',
  excerpt: 'excerpt',
  author: 'author',
  status: 'status',
  difficulty: 'difficulty',
  duration: 'duration',
  target_role: 'targetRole',
  media_url: 'mediaUrl',
  sort_order: 'sortOrder',
  view_count: 'viewCount',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
} as const

function mapContentFromDb(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [dbColumn, apiKey] of Object.entries(CONTENT_COLUMNS_TO_API)) {
    if (row[dbColumn] !== undefined) mapped[apiKey] = row[dbColumn]
  }
  return mapped
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const difficulty = searchParams.get('difficulty')
    const targetRole = searchParams.get('targetRole')
    // AUDIT-005 : valeur interpolée dans .or() → neutralisée.
    const search = sanitizeSearchTerm(searchParams.get('search'))

    const supabase = createSupabaseAdminClient()
    let query = supabase.from('legacy_bo_contents').select('*')

    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)
    if (difficulty) query = query.eq('difficulty', difficulty)
    if (targetRole) query = query.eq('target_role', targetRole)
    if (search) {
      query = query.or(`title.ilike.%${search}%,category.ilike.%${search}%,excerpt.ilike.%${search}%,author.ilike.%${search}%`)
    }

    query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json((data ?? []).map(mapContentFromDb))
  } catch (error) {
    console.error('Erreur listage contenus:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des contenus' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { title, type, category, content, excerpt, author, status, difficulty, duration, targetRole, mediaUrl, sortOrder } = body

    if (!title || !type || !content) {
      return NextResponse.json({ erreur: 'Le titre, le type et le contenu sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_contents')
      .insert({
        title,
        type,
        category: category || null,
        content,
        excerpt: excerpt || null,
        author: author || auth.user.name,
        status: status || 'brouillon',
        difficulty: difficulty || 'debutant',
        duration: duration || null,
        target_role: targetRole || null,
        media_url: mediaUrl || null,
        sort_order: sortOrder ?? 0,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(mapContentFromDb(data), { status: 201 })
  } catch (error) {
    console.error('Erreur creation contenu:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation du contenu' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    // Whitelist explicite camelCase → snake_case. L'ancien spread direct du
    // body échouait avec PGRST204 dès qu'un client envoyait targetRole ou
    // mediaUrl (colonnes cibles target_role/media_url inexistantes sous
    // leur forme camelCase).
    const allowed: Record<string, unknown> = {}
    if (data.title !== undefined) allowed.title = data.title
    if (data.type !== undefined) allowed.type = data.type
    if (data.category !== undefined) allowed.category = data.category
    if (data.content !== undefined) allowed.content = data.content
    if (data.excerpt !== undefined) allowed.excerpt = data.excerpt
    if (data.author !== undefined) allowed.author = data.author
    if (data.status !== undefined) allowed.status = data.status
    if (data.difficulty !== undefined) allowed.difficulty = data.difficulty
    if (data.duration !== undefined) allowed.duration = data.duration
    if (data.targetRole !== undefined) allowed.target_role = data.targetRole || null
    if (data.mediaUrl !== undefined) allowed.media_url = data.mediaUrl || null
    if (data.sortOrder !== undefined) allowed.sort_order = data.sortOrder

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ erreur: 'Aucun champ modifiable fourni' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: updated, error } = await supabase
      .from('legacy_bo_contents')
      .update(allowed)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(mapContentFromDb(updated))
  } catch (error) {
    console.error('Erreur mise a jour contenu:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour du contenu' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'contenus', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ erreur: 'L\'identifiant est obligatoire' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { error } = await supabase
      .from('legacy_bo_contents')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erreur suppression contenu:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression du contenu' }, { status: 500 })
  }
}
