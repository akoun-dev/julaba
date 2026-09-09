import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const contributeSchema = z.object({
  organizationId: z.string().uuid(),
  tontineId: z.string().uuid(),
  amount: z.number().int().positive(),
  clientId: z.string().uuid().optional(),
})

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '42501') return errorResponse('Accès refusé à cette organisation', 403)
  if (error.code === '23505') return errorResponse('Cotisation déjà enregistrée', 409)
  if (error.code === '22023') return errorResponse(error.message ?? 'Cotisation invalide', 422)
  return errorResponse('Cotisation impossible', 500)
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return errorResponse('Authentification requise', 401)

  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get('organizationId')
  if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
    return errorResponse('organizationId invalide', 400)
  }
  const mine = searchParams.get('mine') === 'true'

  if (mine) {
    // Tontines dont l'utilisateur est membre, avec son total cotisé.
    const { data: memberships, error: memberError } = await supabase
      .from('tontine_members')
      .select('tontine_id, tontines(id, name, amount, frequency, member_count, next_due_date)')
      .eq('organization_id', organizationId)
      .eq('member_user_id', authData.user.id)
    if (memberError) return errorResponse('Impossible de charger les tontines', 500)

    const tontineIds = (memberships ?? []).map((m) => m.tontines?.id).filter(Boolean)
    if (tontineIds.length === 0) return NextResponse.json({ data: [] })

    const { data: totals, error: totalsError } = await supabase
      .from('tontine_contributions')
      .select('tontine_id, amount')
      .eq('organization_id', organizationId)
      .eq('member_user_id', authData.user.id)
      .in('tontine_id', tontineIds)
    if (totalsError) return errorResponse('Impossible de charger les cotisations', 500)

    const sumsByTontine = new Map<string, number>()
    for (const row of totals ?? []) {
      sumsByTontine.set(row.tontine_id, (sumsByTontine.get(row.tontine_id) ?? 0) + row.amount)
    }
    return NextResponse.json({
      data: (memberships ?? []).map((m) => ({
        ...m.tontines,
        total_contributed: sumsByTontine.get(m.tontines!.id) ?? 0,
      })),
    })
  }

  const { data, error } = await supabase
    .from('tontines')
    .select('id, organization_id, client_id, name, amount, frequency, member_count, next_due_date, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) return errorResponse('Impossible de charger les tontines', 500)
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return errorResponse('Authentification requise', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('JSON invalide', 400)
  }
  const parsed = contributeSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Cotisation invalide', 422)

  const { data, error } = await supabase.rpc('record_tontine_contribution', {
    p_organization_id: parsed.data.organizationId,
    p_tontine_id: parsed.data.tontineId,
    p_amount: parsed.data.amount,
    p_client_id: parsed.data.clientId,
  })
  if (error) return rpcErrorResponse(error)
  return NextResponse.json({ data }, { status: 201 })
}
