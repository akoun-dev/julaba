import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const createHarvestSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  productName: z.string().trim().min(1).max(160),
  quantityKg: z.number().positive(),
  quality: z.enum(['premium', 'standard', 'secondaire']).default('standard'),
  harvestedAt: z.string().datetime(),
  plot: z.string().trim().min(1).max(160),
  desiredPricePerKg: z.number().int().nonnegative(),
  photoPaths: z.array(z.string().min(1)).max(10).default([]),
  notes: z.string().max(2000).optional(),
})

const updateHarvestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['brouillon', 'publiee', 'vendue']).optional(),
  buyer: z.string().trim().max(160).optional(),
  saleAmount: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
})

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
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
  if (status && !['brouillon', 'publiee', 'vendue'].includes(status)) {
    return errorResponse('status invalide', 400)
  }

  let query = supabase
    .from('harvests')
    .select('id, organization_id, producer_user_id, client_id, product_name, quantity_kg, quality, harvested_at, plot, desired_price_per_kg, status, buyer, sale_amount, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return errorResponse('Impossible de charger les récoltes', 500)
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
  const parsed = createHarvestSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Données de récolte invalides', 422)

  const input = parsed.data
  const { data, error } = await supabase.from('harvests').insert({
    organization_id: input.organizationId,
    producer_user_id: authData.user.id,
    client_id: input.clientId ?? null,
    product_name: input.productName,
    quantity_kg: input.quantityKg,
    quality: input.quality,
    harvested_at: input.harvestedAt,
    plot: input.plot,
    desired_price_per_kg: input.desiredPricePerKg,
    photo_paths: input.photoPaths,
    notes: input.notes ?? null,
  }).select().single()

  if (error?.code === '23505') return errorResponse('Cette récolte a déjà été synchronisée', 409)
  if (error) return errorResponse('Impossible de créer la récolte', 500)
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return errorResponse('Authentification requise', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('JSON invalide', 400)
  }
  const parsed = updateHarvestSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Mise à jour de récolte invalide', 422)
  if (parsed.data.status === 'vendue' && !parsed.data.buyer && !parsed.data.saleAmount) {
    return errorResponse('Une récolte vendue exige un acheteur ou un montant', 422)
  }

  const { id, status, buyer, saleAmount, notes } = parsed.data
  const { data, error } = await supabase
    .from('harvests')
    .update({
      ...(status !== undefined ? { status } : {}),
      ...(buyer !== undefined ? { buyer } : {}),
      ...(saleAmount !== undefined ? { sale_amount: saleAmount } : {}),
      ...(notes !== undefined ? { notes } : {}),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Impossible de mettre à jour la récolte', 500)
  if (!data) return errorResponse('Récolte introuvable', 404)
  return NextResponse.json({ data })
}
