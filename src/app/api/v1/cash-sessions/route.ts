import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const openSchema = z.object({
  action: z.literal('open'),
  organizationId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  openingFloat: z.number().int().nonnegative().default(0),
})

const closeSchema = z.object({
  action: z.literal('close'),
  organizationId: z.string().uuid(),
  sessionId: z.string().uuid(),
})

const cashSessionSchema = z.discriminatedUnion('action', [openSchema, closeSchema])

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '42501') return errorResponse('Accès refusé à cette organisation', 403)
  if (error.code === '23505') return errorResponse('Une session de caisse est déjà ouverte', 409)
  if (error.code === '22023') return errorResponse(error.message ?? 'Requête de caisse invalide', 422)
  return errorResponse('Opération de caisse impossible', 500)
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
  const status = searchParams.get('status')
  if (status && status !== 'open' && status !== 'closed') {
    return errorResponse('status doit valoir open ou closed', 400)
  }

  let query = supabase
    .from('cash_sessions')
    .select('id, organization_id, merchant_user_id, client_id, opening_float, total_sales, total_expenses, closing_amount, is_open, opened_at, closed_at')
    .eq('organization_id', organizationId)
    .order('opened_at', { ascending: false })
    .limit(30)
  if (status === 'open') query = query.eq('is_open', true)
  if (status === 'closed') query = query.eq('is_open', false)

  const { data, error } = await query
  if (error) return errorResponse('Impossible de charger les sessions de caisse', 500)
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
  const parsed = cashSessionSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Requête de caisse invalide', 422)

  if (parsed.data.action === 'open') {
    const { data, error } = await supabase.rpc('open_cash_session', {
      p_organization_id: parsed.data.organizationId,
      p_opening_float: parsed.data.openingFloat,
      p_client_id: parsed.data.clientId,
    })
    if (error) return rpcErrorResponse(error)
    return NextResponse.json({ data }, { status: 201 })
  }

  const { data, error } = await supabase.rpc('close_cash_session', {
    p_organization_id: parsed.data.organizationId,
    p_session_id: parsed.data.sessionId,
  })
  if (error) return rpcErrorResponse(error)
  return NextResponse.json({ data })
}
