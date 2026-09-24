import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'

/**
 * GET /api/marchand/contenus — published training contents for the
 * Academy screen (device-session guarded: the Academy is reachable only
 * from an authenticated marchand home).
 *
 * Why not reuse /api/backoffice/contenus: that route is guarded by
 * requireBackofficePermission('contenus', 'read'), which a marchand device
 * can never satisfy — the Academy list has silently failed with 401 for
 * every marchand so far. This route exposes ONLY published contents, and
 * never the draft/archived ones the backoffice manages.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const type = searchParams.get('type') || 'tutoriels'

    // Filtre par public cible : un marchand ne voit que les contenus
    // universels (target_role NULL) et ceux qui lui sont dédiés
    // (target_role='marchand') — sinon les tutoriels producteur/
    // identificateur fuyaient dans l'Academy marchand. Le [id] applique la
    // même règle pour que la lecture par identifiant deviné soit cohérente.
    const { data, error } = await supabase
      .from('legacy_bo_contents')
      .select('id, title, type, category, excerpt, author, difficulty, duration, view_count, created_at')
      .eq('type', type)
      .eq('status', 'publie')
      .or('target_role.is.null,target_role.eq.marchand,target_role.eq.tous')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json(
      (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        title: row.title as string,
        type: row.type as string,
        category: row.category as string | null,
        excerpt: row.excerpt as string | null,
        author: row.author as string | null,
        difficulty: row.difficulty as string | null,
        duration: row.duration as string | null,
        viewCount: row.view_count as number,
        createdAt: row.created_at as string,
      }))
    )
  } catch (error) {
    console.error('[API marchand/contenus GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des contenus' }, { status: 500 })
  }
}
