import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const createProductSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80).default('autre'),
  priceUnit: z.number().int().nonnegative(),
  stockQty: z.number().nonnegative().default(0),
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

  const { data, error } = await supabase
    .from('products')
    .select('id, organization_id, merchant_user_id, client_id, name, category, price_unit, stock_qty, image_path, is_active, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) return errorResponse('Impossible de charger les produits', 500)
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
  const parsed = createProductSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Données produit invalides', 422)

  const input = parsed.data
  const { data, error } = await supabase.from('products').insert({
    organization_id: input.organizationId,
    merchant_user_id: authData.user.id,
    client_id: input.clientId ?? null,
    name: input.name,
    category: input.category,
    price_unit: input.priceUnit,
    stock_qty: input.stockQty,
  }).select().single()

  if (error?.code === '23505') return errorResponse('Ce produit a déjà été synchronisé', 409)
  if (error) return errorResponse('Impossible de créer le produit', 500)
  return NextResponse.json({ data }, { status: 201 })
}
