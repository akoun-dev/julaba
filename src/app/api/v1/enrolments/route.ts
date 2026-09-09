import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const submitSchema = z.object({
  organizationId: z.string().uuid(),
  dossierId: z.string().trim().min(1).max(80),
  actorName: z.string().trim().min(1).max(160),
  actorType: z.enum(['marchand', 'producteur', 'cooperatif']).default('marchand'),
  zoneId: z.string().uuid(),
  phone: z.string().trim().min(6).max(20),
  hasPhoto: z.boolean().default(false),
  hasGps: z.boolean().default(false),
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLng: z.number().min(-180).max(180).optional(),
})

const decideSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('valider'),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('rejeter'),
    id: z.string().uuid(),
    rejectReason: z.string().trim().min(1).max(500),
  }),
])

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '42501') return errorResponse(error.message ?? 'Accès refusé', 403)
  if (error.code === '22023') return errorResponse(error.message ?? 'Requête invalide', 422)
  return errorResponse('Opération impossible', 500)
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
  if (status && !['en_attente', 'valide', 'rejete'].includes(status)) {
    return errorResponse('status invalide', 400)
  }
  const mine = searchParams.get('mine') === 'true'

  let query = supabase
    .from('enrolments')
    .select('id, organization_id, zone_id, dossier_id, actor_name, actor_type, phone, has_photo, has_gps, identificateur_user_id, identificateur_name, status, validated_by_user_id, validated_at, reject_reason, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (status) query = query.eq('status', status)
  if (mine) query = query.eq('identificateur_user_id', authData.user.id)

  const { data, error } = await query
  if (error) return errorResponse('Impossible de charger les dossiers', 500)
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
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Données de dossier invalides', 422)

  const input = parsed.data
  const { data, error } = await supabase.rpc('submit_enrolment', {
    p_organization_id: input.organizationId,
    p_dossier_id: input.dossierId,
    p_actor_name: input.actorName,
    p_actor_type: input.actorType,
    p_zone_id: input.zoneId,
    p_phone: input.phone,
    p_has_photo: input.hasPhoto,
    p_has_gps: input.hasGps,
    ...(input.gpsLat !== undefined && { p_gps_lat: input.gpsLat }),
    ...(input.gpsLng !== undefined && { p_gps_lng: input.gpsLng }),
  })
  if (error) return rpcErrorResponse(error)
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
  const parsed = decideSchema.safeParse(body)
  if (!parsed.success) return errorResponse('Décision de dossier invalide', 422)

  const { data, error } = await supabase.rpc('validate_enrolment', {
    p_enrolment_id: parsed.data.id,
    ...(parsed.data.action === 'rejeter' && { p_reject_reason: parsed.data.rejectReason }),
  })
  if (error) return rpcErrorResponse(error)
  return NextResponse.json({ data })
}
