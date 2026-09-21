import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { sanitizeSearchTerm } from '@/lib/postgrest-search'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'audit', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const module_ = searchParams.get('module')
    const action = searchParams.get('action')
    // AUDIT-005 : valeur interpolée dans .or() → neutralisée (jokers LIKE
    // et séparateurs de grammaire PostgREST).
    const user = sanitizeSearchTerm(searchParams.get('user'))

    const supabase = createSupabaseAdminClient()
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase.from('legacy_audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)

    if (module_) {
      query = query.eq('module', module_)
    }
    if (action) {
      query = query.eq('action', action)
    }
    if (user) {
      query = query.or(`user_name.ilike.%${user}%,user_email.ilike.%${user}%`)
    }

    const { data: logs, count: total, error } = await query
    if (error) throw error

    return NextResponse.json({ logs, total: total || 0, page, limit, totalPages: Math.ceil((total || 0) / limit) })
  } catch (error) {
    console.error('Erreur listage audit:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du journal d\'audit' }, { status: 500 })
  }
}
