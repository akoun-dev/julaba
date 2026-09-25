import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — porte Zod du PATCH. id/status ont déjà leur 400 manuel testé
// (« L'identifiant et le statut sont obligatoires ») → nullish pour que CE
// message continue de sortir (null compris) ; courier_name est une colonne
// text à fallback truthy → chaîne nullish.
const updateDeliverySchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  courierName: z.string().nullish(),
})

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'livraison', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')

    const supabase = createSupabaseAdminClient()
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase.from('legacy_bo_deliveries').select('*', { count: 'exact' })
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    const total = count ?? 0
    return NextResponse.json({ deliveries: data ?? [], total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage livraisons:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des livraisons' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'livraison', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = updateDeliverySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { id, status, courierName } = body

    if (!id || !status) {
      return NextResponse.json({ erreur: "L'identifiant et le statut sont obligatoires" }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const data: Record<string, unknown> = { status }
    if (courierName) data.courier_name = courierName
    if (status === 'ramassee') data.pickup_at = new Date().toISOString()
    if (status === 'livree') data.delivered_at = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('legacy_bo_deliveries')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Erreur mise a jour livraison:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la mise a jour de la livraison' }, { status: 500 })
  }
}
