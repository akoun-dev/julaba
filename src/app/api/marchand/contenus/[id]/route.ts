import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

/**
 * GET /api/marchand/contenus/[id] — full published course content for the
 * Academy reader, plus an atomic view-count increment (SQL function
 * legacy_bo_content_increment_views, see the migration: read-then-write
 * from this route would let two concurrent readers overwrite each other's
 * count).
 *
 * Returns 404 for draft/archived content even if the id is known — a
 * marchand device must not be able to read unpublished material by
 * guessing ids.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const { id } = await params
    if (!id) {
      return NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase
      .from('legacy_bo_contents')
      .select('*')
      .eq('id', id)
      .eq('status', 'publie')
      .single()
    if (error || !data) {
      return NextResponse.json({ erreur: 'Contenu introuvable' }, { status: 404 })
    }

    const { data: newViewCount, error: incrementError } = await supabase.rpc(
      'legacy_bo_content_increment_views',
      { p_id: id }
    )
    if (incrementError) throw incrementError

    return NextResponse.json({
      id: data.id,
      title: data.title,
      type: data.type,
      category: data.category,
      content: data.content,
      excerpt: data.excerpt,
      author: data.author,
      difficulty: data.difficulty,
      duration: data.duration,
      viewCount: newViewCount ?? data.view_count,
      createdAt: data.created_at,
    })
  } catch (error) {
    console.error('[API marchand/contenus/[id] GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du contenu' }, { status: 500 })
  }
}
