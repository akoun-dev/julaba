import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'communication', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_communications')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const communications = data ?? []
    const mapped = communications.map(c => ({
      id: c.id,
      channel: c.type,
      destType: c.target_zone ? 'zone' as const : 'all' as const,
      destLabel: c.target_zone || c.target_group,
      subject: c.title,
      message: c.content,
      status: c.status,
      sentAt: c.sent_at || c.created_at,
      totalRecipients: c.sent_count,
      delivered: Math.round((c.sent_count ?? 0) * (c.delivery_rate ?? 0) / 100),
      failed: (c.sent_count ?? 0) - Math.round((c.sent_count ?? 0) * (c.delivery_rate ?? 0) / 100),
      pending: 0,
    }))
    return NextResponse.json(mapped)
  } catch (error) {
    console.error('Erreur listage communications:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des communications' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'communication', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { title, type, content, targetGroup, targetZone } = body

    if (!title || !type || !content || !targetGroup) {
      return NextResponse.json({ erreur: 'Le titre, le type, le contenu et le groupe cible sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_communications')
      .insert({
        title,
        type,
        content,
        target_group: targetGroup,
        target_zone: targetZone || null,
        status: 'brouillon',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Erreur creation communication:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la communication' }, { status: 500 })
  }
}
