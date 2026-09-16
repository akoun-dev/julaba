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

    // Atomic view-count increment via SQL function (see migration
    // 20260916000500_create_legacy_bo_content_increment_views_function.sql).
    // The counter is cosmetic: if the
    // function is missing (migration not applied yet) or fails for any
    // reason, fall back to a plain UPDATE, then to loading the course with
    // the stored count — a broken view counter must NEVER 500 the reader.
    let viewCount: number | null = null
    try {
      const { data: newViewCount, error: incrementError } = await supabase.rpc(
        'legacy_bo_content_increment_views',
        { p_id: id }
      )
      if (incrementError) throw incrementError
      viewCount = newViewCount
    } catch (rpcError) {
      console.warn('[API marchand/contenus/[id]] increment RPC indisponible, fallback UPDATE:', rpcError)
      const { data: updated, error: updateError } = await supabase
        .from('legacy_bo_contents')
        .update({ view_count: (data.view_count ?? 0) + 1 })
        .eq('id', id)
        .select('view_count')
        .single()
      if (!updateError && updated) viewCount = updated.view_count as number
      // Even the fallback failed (e.g. RLS/replica): load the course with
      // the stored count instead of failing the reader.
    }

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
      viewCount: viewCount ?? data.view_count ?? 0,
      createdAt: data.created_at,
    })
  } catch (error) {
    console.error('[API marchand/contenus/[id] GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du contenu' }, { status: 500 })
  }
}
