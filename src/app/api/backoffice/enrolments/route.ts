import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'enrolement', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const status = searchParams.get('status')
    const zone = (auth.user.role === 'gestionnaire_zone' || auth.user.role === 'operateur_terrain') && auth.user.zone
      ? auth.user.zone
      : searchParams.get('zone')

    const supabase = createSupabaseAdminClient()

    let query = supabase.from('legacy_bo_enrolments').select('*', { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (zone) query = query.eq('zone', zone)

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: enrolments, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({ enrolments: enrolments || [], total: total || 0, page, limit, totalPages: Math.ceil((total || 0) / limit) })
  } catch (error) {
    console.error('Erreur listage inscriptions:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des inscriptions' }, { status: 500 })
  }
}

type AuthMethod = 'pin' | 'pattern' | 'visual'

const normalizePhone = (phone: string) => phone.replace(/[^\d]/g, '').replace(/^(\+225)?/, '')

async function provisionAccount(
  actorType: string, firstName: string, rawPhone: string, authMethod?: AuthMethod,
  pinHash?: string, patternHash?: string, visualCodeHash?: string
) {
  if (!authMethod || !firstName) return
  const phone = normalizePhone(rawPhone)
  if (!phone) return
  try {
    const supabase = createSupabaseAdminClient()
    if (actorType === 'marchand') {
      const hash = authMethod === 'pin' ? pinHash : authMethod === 'pattern' ? patternHash : visualCodeHash
      if (!hash) return
      const { data: existing } = await supabase.from('merchants').select('id').eq('phone', phone).single()
      if (existing) {
        await supabase.from('merchants').update({
          first_name: firstName,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
          visual_code_hash: visualCodeHash || null,
        }).eq('phone', phone)
      } else {
        await supabase.from('merchants').insert({
          first_name: firstName,
          phone,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
          visual_code_hash: visualCodeHash || null,
        })
      }
    } else if (actorType === 'producteur' && (authMethod === 'pin' || authMethod === 'pattern')) {
      const hash = authMethod === 'pin' ? pinHash : patternHash
      if (!hash) return
      const { data: existing } = await supabase.from('producers').select('id').eq('phone', phone).single()
      if (existing) {
        await supabase.from('producers').update({
          first_name: firstName,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
        }).eq('phone', phone)
      } else {
        await supabase.from('producers').insert({
          first_name: firstName,
          phone,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
        })
      }
    }
  } catch (error) {
    console.error('[API backoffice/enrolments] provisionAccount', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      dossierId, actorName, actorType, zone, identificateurId, identificateurName, phone, hasPhoto, hasGps,
      firstName, authMethod, pinHash, patternHash, visualCodeHash,
    } = body

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    if (!dossierId || !actorName || !zone || !phone) {
      return NextResponse.json({ erreur: 'Le dossier, l\'acteur, la zone et le téléphone sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_enrolments')
      .select('*')
      .eq('dossier_id', dossierId)
      .single()

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const resolvedActorType = actorType || 'marchand'
    await provisionAccount(resolvedActorType, firstName || actorName, phone, authMethod, pinHash, patternHash, visualCodeHash)

    const { data: enrolment, error } = await supabase.from('legacy_bo_enrolments').insert({
      dossier_id: dossierId,
      actor_name: actorName,
      actor_type: resolvedActorType,
      zone,
      identificateur_id: identificateurId,
      identificateur_name: identificateurName || 'Agent',
      phone,
      has_photo: !!hasPhoto,
      has_gps: !!hasGps,
      status: 'en_attente',
    }).select().single()

    if (error) throw error
    return NextResponse.json(enrolment, { status: 201 })
  } catch (error) {
    console.error('Erreur creation inscription:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de l\'inscription' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'enrolement', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { id, action, validatedBy, rejectReason } = body

    if (!id || !action) {
      return NextResponse.json({ erreur: 'L\'identifiant et l\'action sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const { data: existing } = await supabase
      .from('legacy_bo_enrolments')
      .select('*')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ erreur: 'Dossier introuvable' }, { status: 404 })
    }
    if (!canAccessZone(auth.user, existing.zone)) {
      return NextResponse.json({ erreur: 'Ce dossier ne relève pas de votre périmètre' }, { status: 403 })
    }

    if (action === 'valider') {
      const { data: enrolment, error } = await supabase
        .from('legacy_bo_enrolments')
        .update({
          status: 'valide',
          validated_by: validatedBy || null,
          validated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      const prefix = enrolment.actor_type === 'producteur' ? 'P' : 'M'
      const { data: existingActor } = await supabase
        .from('legacy_bo_actors')
        .select('*')
        .eq('phone', enrolment.phone)
        .eq('type', enrolment.actor_type)
        .maybeSingle()

      if (existingActor) {
        await supabase.from('legacy_bo_actors').update({
          first_name: enrolment.actor_name,
          zone: enrolment.zone,
          status: 'actif',
          identificateur_id: enrolment.identificateur_id || null,
          identificateur_name: enrolment.identificateur_name,
          validated_by: validatedBy || null,
          validated_at: new Date().toISOString(),
        }).eq('id', existingActor.id)
      } else {
        await supabase.from('legacy_bo_actors').insert({
          actor_id: `#${prefix}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
          first_name: enrolment.actor_name,
          type: enrolment.actor_type,
          phone: enrolment.phone,
          zone: enrolment.zone,
          status: 'actif',
          identificateur_id: enrolment.identificateur_id || null,
          identificateur_name: enrolment.identificateur_name,
          validated_by: validatedBy || null,
          validated_at: new Date().toISOString(),
          notes: `Créé depuis le dossier ${enrolment.dossier_id}`,
        })
      }

      await logAudit({
        userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
        action: 'enrolment_validate', module: 'enrolement', details: `Dossier ${enrolment.dossier_id}`, request,
      })
      if (enrolment.identificateur_id) {
        await createNotification({
          subjectType: 'identificateur', subjectId: enrolment.identificateur_id, type: 'dossier_valide',
          title: 'Dossier validé', body: `Le dossier de ${enrolment.actor_name} a été validé.`,
          data: { dossierId: enrolment.dossier_id },
        })
      }
      return NextResponse.json(enrolment)
    }

    if (action === 'rejeter') {
      if (!rejectReason) {
        return NextResponse.json({ erreur: 'La raison du rejet est obligatoire' }, { status: 400 })
      }
      const { data: enrolment, error } = await supabase
        .from('legacy_bo_enrolments')
        .update({
          status: 'rejete',
          validated_by: validatedBy || null,
          validated_at: new Date().toISOString(),
          reject_reason: rejectReason,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      await logAudit({
        userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
        action: 'enrolment_reject', module: 'enrolement', details: `Dossier ${enrolment.dossier_id}: ${rejectReason}`, request,
      })
      if (enrolment.identificateur_id) {
        await createNotification({
          subjectType: 'identificateur', subjectId: enrolment.identificateur_id, type: 'dossier_rejete',
          title: 'Dossier rejeté', body: `Le dossier de ${enrolment.actor_name} a été rejeté : ${rejectReason}`,
          data: { dossierId: enrolment.dossier_id },
        })
      }
      return NextResponse.json(enrolment)
    }

    return NextResponse.json({ erreur: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('Erreur mise a jour inscription:', error)
    return NextResponse.json({ erreur: 'Erreur lors du traitement de l\'inscription' }, { status: 500 })
  }
}
