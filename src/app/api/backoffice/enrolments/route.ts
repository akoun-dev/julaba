import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications/server'
import { normalizeMarchandCategorie } from '@/lib/marchand-categories'

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

function comparableZoneName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

async function mirrorCanonicalEnrolment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    dossierId: string
    actorName: string
    actorType: string
    zone: string
    phone: string
    hasPhoto: boolean
    hasGps: boolean
    identificateurName: string
    categorieMarchand?: string | null
    activite?: string | null
  }
): Promise<void> {
  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (organizationError) throw organizationError
  if (!organization) throw new Error('Aucune organisation Supabase active n’est configurée')

  const { data: zones, error: zonesError } = await supabase
    .from('zones')
    .select('id, name')
    .eq('organization_id', organization.id)
  if (zonesError) throw zonesError

  let canonicalZone = (zones || []).find((candidate) => comparableZoneName(candidate.name) === comparableZoneName(input.zone))
  if (!canonicalZone) {
    const { data: createdZone, error: createZoneError } = await supabase
      .from('zones')
      .insert({ organization_id: organization.id, name: input.zone, is_active: true })
      .select('id, name')
      .single()
    if (createZoneError) throw createZoneError
    canonicalZone = createdZone
  }

  const { error } = await supabase
    .from('enrolments')
    .upsert({
      organization_id: organization.id,
      zone_id: canonicalZone.id,
      dossier_id: input.dossierId,
      actor_name: input.actorName,
      actor_type: input.actorType === 'cooperative' ? 'cooperatif' : input.actorType,
      phone: input.phone,
      has_photo: input.hasPhoto,
      has_gps: input.hasGps,
      identificateur_name: input.identificateurName,
      categorie_marchand: input.categorieMarchand || null,
      activite: input.activite || null,
      status: 'en_attente',
    }, { onConflict: 'organization_id,dossier_id' })
  if (error) throw error
}

type Sexe = 'masculin' | 'feminin' | 'autre'

async function provisionAccount(
  actorType: string, firstName: string, rawPhone: string, authMethod?: AuthMethod,
  pinHash?: string, patternHash?: string, visualCodeHash?: string, sexe?: Sexe,
  categorieMarchand?: string | null
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
          sexe: sexe || null,
          categorie_marchand: categorieMarchand || null,
        }).eq('phone', phone)
      } else {
        await supabase.from('merchants').insert({
          first_name: firstName,
          phone,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
          visual_code_hash: visualCodeHash || null,
          sexe: sexe || null,
          categorie_marchand: categorieMarchand || null,
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
          sexe: sexe || null,
        }).eq('phone', phone)
      } else {
        await supabase.from('producers').insert({
          first_name: firstName,
          phone,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
          sexe: sexe || null,
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
      firstName, lastName, authMethod, pinHash, patternHash, visualCodeHash, sexe,
      activite, categorieMarchand, typeCommerce, nomCommerce,
    } = body

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    // Classification marchand : normalisée (tolérante accents/casse) puis
    // gardée seulement pour les marchands — la base porte un CHECK qui
    // rejetterait toute valeur hors nomenclature.
    const resolvedCategorie = actorType === 'marchand' ? normalizeMarchandCategorie(categorieMarchand) : null

    const hasValidAuth = (authMethod === 'pin' && Boolean(pinHash))
      || (authMethod === 'pattern' && Boolean(patternHash))
      || (authMethod === 'visual' && Boolean(visualCodeHash))
    const missingFields = [
      !dossierId && 'dossier',
      (!actorName || !firstName || !lastName || !actorType) && "identité complète",
      !zone && 'zone',
      !phone && 'téléphone',
      !hasPhoto && 'photo',
      !hasValidAuth && 'authentification de l’acteur',
    ].filter((field): field is string => Boolean(field))
    if (missingFields.length > 0) {
      return NextResponse.json({
        erreur: `Champs obligatoires manquants : ${missingFields.join(', ')}`,
        champsManquants: missingFields,
      }, { status: 400 })
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
    await provisionAccount(resolvedActorType, firstName || actorName, phone, authMethod, pinHash, patternHash, visualCodeHash, sexe, resolvedCategorie)

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
      sexe: sexe || null,
      categorie_marchand: resolvedCategorie,
      activite: activite || null,
      type_commerce: resolvedActorType === 'marchand' ? (typeCommerce || null) : null,
      nom_commerce: resolvedActorType === 'marchand' ? (nomCommerce || null) : null,
    }).select().single()

    if (error) throw error

    try {
      await mirrorCanonicalEnrolment(supabase, {
        dossierId,
        actorName,
        actorType: resolvedActorType,
        zone,
        phone,
        hasPhoto: !!hasPhoto,
        hasGps: !!hasGps,
        identificateurName: identificateurName || 'Agent',
        categorieMarchand: resolvedCategorie,
        activite: activite || null,
      })
    } catch (mirrorError) {
      await supabase.from('legacy_bo_enrolments').delete().eq('id', enrolment.id)
      throw mirrorError
    }

    // Best-effort: keep the identificateur roster (used to assign missions —
    // see /api/backoffice/identificateurs) in sync with whoever is actually
    // submitting dossiers. identificateur accounts have no prior backoffice
    // provisioning, so this upsert is how a new one ever appears there; it
    // only touches id/name/zone, never an admin-set team or active flag, and
    // never blocks the enrolment itself on failure.
    if (identificateurId) {
      await supabase
        .from('legacy_bo_identificateurs')
        .upsert({ id: identificateurId, name: identificateurName || 'Agent', zone }, { onConflict: 'id' })
        .then(({ error: rosterError }) => {
          if (rosterError) console.error('[API backoffice/enrolments] roster upsert', rosterError)
        })
    }

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
          sexe: enrolment.sexe || null,
          categorie_marchand: enrolment.categorie_marchand || existingActor.categorie_marchand || null,
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
          sexe: enrolment.sexe || null,
          categorie_marchand: enrolment.categorie_marchand || null,
        })
      }

      // --- Create auth.users + profile for the new actor ---
      const phoneDigits = normalizePhone(enrolment.phone)
      const e164Phone = phoneDigits.startsWith('+') ? phoneDigits : `+225${phoneDigits}`
      const firstName = enrolment.actor_name.split(' ')[0] || enrolment.actor_name
      const lastName = enrolment.actor_name.split(' ').slice(1).join(' ') || null

      try {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          phone: e164Phone,
          phone_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            actor_type: enrolment.actor_type,
            actor_id: enrolment.phone,
          },
        })

        if (authError) {
          // "User already registered" — idempotent, safe to ignore
          if (authError.message?.includes('already') || authError.message?.includes('duplicate')) {
            console.info(`[API backoffice/enrolments] auth user already exists for ${e164Phone}`)
          } else {
            console.error('[API backoffice/enrolments] auth create user', authError.message)
          }
        } else if (authUser?.user) {
          // Profile is auto-created by the on_auth_user_created trigger,
          // but we update it with extra fields the trigger may not have.
          await supabase.from('profiles').update({
            first_name: firstName,
            last_name: lastName,
            actor_type: enrolment.actor_type,
          }).eq('id', authUser.user.id)
        }
      } catch (authErr) {
        console.error('[API backoffice/enrolments] auth user creation failed', authErr)
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

    // « Demander info » : passe le dossier en info_demandee et persiste le
    // motif (optionnel) dans info_request_reason. Distinct d'un rejet :
    // pas de reject_reason, l'identificateur est invité à compléter le
    // dossier. Persisté côté serveur — la version initiale ne faisait un
    // setState client, perdu au premier refetch.
    if (action === 'demander_info') {
      const { infoRequestReason } = body
      const { data: enrolment, error } = await supabase
        .from('legacy_bo_enrolments')
        .update({
          status: 'info_demandee',
          validated_by: validatedBy || null,
          validated_at: new Date().toISOString(),
          info_request_reason: infoRequestReason || null,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      await logAudit({
        userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
        action: 'enrolment_info_request', module: 'enrolement',
        details: `Dossier ${enrolment.dossier_id}${infoRequestReason ? `: ${infoRequestReason}` : ''}`, request,
      })
      if (enrolment.identificateur_id) {
        await createNotification({
          subjectType: 'identificateur', subjectId: enrolment.identificateur_id, type: 'dossier_info_demandee',
          title: 'Informations complémentaires demandées',
          body: infoRequestReason
            ? `Le dossier de ${enrolment.actor_name} nécessite des précisions : ${infoRequestReason}`
            : `Des informations complémentaires sont demandées pour le dossier de ${enrolment.actor_name}.`,
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
