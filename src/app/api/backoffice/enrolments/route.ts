import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { normalizeZoneKey } from '@/lib/objectifs'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications/server'
import { normalizeMarchandCategorie } from '@/lib/marchand-categories'
import { hashCodeScrypt } from '@/lib/auth-pin'
import { issueLiaisonCode } from '@/lib/device-session'
import { LIAISON_TTL_BACKOFFICE_MS } from '@/lib/liaison-code'
import { acteurPrefixPourType } from '@/lib/actor-id'
import { createActeurAvecIdUnique } from '@/lib/actor-id-server'
import { creerAdhesionDepuisEnrolement } from '@/lib/cooperatives/adhesion-enrolement'
import { formatZodError } from '@/lib/validation/marchand'
import {
  parseEnrolmentMedia,
  televerserMediasEnrolement,
  type EnrolmentMediaKind,
  type ParsedEnrolmentMedia,
} from '@/lib/enrolments-media'

// MODE-1007 — portes Zod POST/PATCH, typées d'après l'USAGE RÉEL. Le POST est
// soumis par l'app identificateur (live ET rejeu offline verbatim, MODE-943) :
// les champs obligatoires ont déjà leur 400 manuel « Champs obligatoires
// manquants : … » et l'intention coopérative son refus propre → nullish pour
// que CES messages continuent de sortir (contrat préservé) ; les codes bruts
// (pin/pattern/visualCode) et les hashs sont des strings optionnels. Le PATCH
// dispatche sur action (valider/rejeter/demander_info) — chaque branche a son
// propre refus testé → nullish.
const createEnrolmentSchema = z.object({
  dossierId: z.string().nullish(),
  actorName: z.string().nullish(),
  actorType: z.string().nullish(),
  zone: z.string().nullish(),
  identificateurId: z.string().nullish(),
  identificateurName: z.string().nullish(),
  phone: z.string().nullish(),
  hasPhoto: z.boolean().nullish(),
  hasGps: z.boolean().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  authMethod: z.string().nullish(),
  pin: z.string().nullish(),
  pattern: z.string().nullish(),
  visualCode: z.string().nullish(),
  pinHash: z.string().nullish(),
  patternHash: z.string().nullish(),
  visualCodeHash: z.string().nullish(),
  sexe: z.string().nullish(),
  activite: z.string().nullish(),
  categorieMarchand: z.string().nullish(),
  typeCommerce: z.string().nullish(),
  nomCommerce: z.string().nullish(),
  estMembreCooperative: z.boolean().nullish(),
  cooperativeId: z.string().nullish(),
  // AUDIT-013 (MODE-1014) — pièces réelles + GPS complet : DataURLs base64
  // (validées après cette porte : cap 2 Mo/pièce, JPEG/PNG/WebP → 413/415)
  // et coordonnées { lat, lng, accuracy? } mesurées au wizard. Nullish :
  // les charges pré-AUDIT-013 (indicateurs seuls, files offline anciennes)
  // restent acceptées telles quelles.
  gps: z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().nullish(),
  }).nullish(),
  photoBase64: z.string().nullish(),
  cniRecto: z.string().nullish(),
  cniVerso: z.string().nullish(),
})

const updateEnrolmentSchema = z.object({
  id: z.string().nullish(),
  action: z.string().nullish(),
  validatedBy: z.string().nullish(),
  rejectReason: z.string().nullish(),
  infoRequestReason: z.string().nullish(),
})

// MODE-1006 (noImplicitAny) — type de ligne minimal : le client admin est
// volontairement non typé (DET-008) ; zones.name est NOT NULL
// (20260908000300).
interface ZoneLiteRow {
  id: string
  name: string
}

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
    // MODE-1005 (AUDIT-012 P2) : clé normalisée zone_key — voir actors/route.ts.
    if (zone) query = query.eq('zone_key', normalizeZoneKey(zone))

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
    // AUDIT-013 (MODE-1014) — la table canonique porte DÉJÀ gps_lat/gps_lng
    // (20260908002600) : réutilisées telles quelles, jamais doublonnées.
    gpsLat?: number | null
    gpsLng?: number | null
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

  let canonicalZone = ((zones || []) as ZoneLiteRow[]).find((candidate) => comparableZoneName(candidate.name) === comparableZoneName(input.zone))
  if (!canonicalZone) {
    const { data: createdZone, error: createZoneError } = await supabase
      .from('zones')
      .insert({ organization_id: organization.id, name: input.zone, is_active: true })
      .select('id, name')
      .single()
    if (createZoneError) throw createZoneError
    // MODE-1006 — createdZone est garanti par .single() + throw ci-dessus ;
    // le cast évite que l'affectation d'un `any` ne ré-élargisse le narrowing.
    canonicalZone = createdZone as ZoneLiteRow
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
      gps_lat: input.gpsLat ?? null,
      gps_lng: input.gpsLng ?? null,
      status: 'en_attente',
    }, { onConflict: 'organization_id,dossier_id' })
  if (error) throw error
}

type Sexe = 'masculin' | 'feminin' | 'autre'

interface ProvisionedAccount {
  type: 'merchant' | 'producteur'
  id: string
}

async function provisionAccount(
  actorType: string, firstName: string, rawPhone: string, authMethod?: AuthMethod,
  pinHash?: string, patternHash?: string, visualCodeHash?: string, sexe?: Sexe,
  categorieMarchand?: string | null
): Promise<ProvisionedAccount | null> {
  if (!authMethod || !firstName) return null
  const phone = normalizePhone(rawPhone)
  if (!phone) return null
  try {
    const supabase = createSupabaseAdminClient()
    if (actorType === 'marchand') {
      const hash = authMethod === 'pin' ? pinHash : authMethod === 'pattern' ? patternHash : visualCodeHash
      if (!hash) return null
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
        return { type: 'merchant', id: existing.id }
      }
      const { data: created } = await supabase.from('merchants').insert({
        first_name: firstName,
        phone,
        auth_method: authMethod,
        pin_hash: pinHash || null,
        pattern_hash: patternHash || null,
        visual_code_hash: visualCodeHash || null,
        sexe: sexe || null,
        categorie_marchand: categorieMarchand || null,
      }).select('id').single()
      return created ? { type: 'merchant', id: created.id } : null
    }
    if (actorType === 'producteur' && (authMethod === 'pin' || authMethod === 'pattern')) {
      const hash = authMethod === 'pin' ? pinHash : patternHash
      if (!hash) return null
      const { data: existing } = await supabase.from('producers').select('id').eq('phone', phone).single()
      if (existing) {
        await supabase.from('producers').update({
          first_name: firstName,
          auth_method: authMethod,
          pin_hash: pinHash || null,
          pattern_hash: patternHash || null,
          sexe: sexe || null,
        }).eq('phone', phone)
        return { type: 'producteur', id: existing.id }
      }
      const { data: created } = await supabase.from('producers').insert({
        first_name: firstName,
        phone,
        auth_method: authMethod,
        pin_hash: pinHash || null,
        pattern_hash: patternHash || null,
        sexe: sexe || null,
      }).select('id').single()
      return created ? { type: 'producteur', id: created.id } : null
    }
  } catch (error) {
    console.error('[API backoffice/enrolments] provisionAccount', error)
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createEnrolmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const {
      dossierId, actorName, actorType, zone, identificateurId, identificateurName, phone, hasPhoto, hasGps,
      firstName, lastName, authMethod, pin, pattern, visualCode, pinHash, patternHash, visualCodeHash, sexe,
      activite, categorieMarchand, typeCommerce, nomCommerce,
      estMembreCooperative, cooperativeId,
      gps, photoBase64, cniRecto, cniVerso,
    } = body

    // AUDIT-013 (MODE-1014) — porte médias : chaque pièce transmise est
    // validée AVANT toute écriture (même étage que la porte Zod). Raisons
    // fermées : cap dur 2 Mo décodés → 413, type hors whitelist
    // image/jpeg|png|webp (ou DataURL illisible) → 415 — contrat { erreur }
    // du dépôt. Les charges sans pièce (files offline anciennes) passent.
    const medias: { kind: EnrolmentMediaKind; media: ParsedEnrolmentMedia }[] = []
    const piecesMedia = [
      ['photo', photoBase64],
      ['cni-recto', cniRecto],
      ['cni-verso', cniVerso],
    ] as const
    for (const [kind, value] of piecesMedia) {
      if (value === undefined || value === null || value === '') continue
      const parsed = parseEnrolmentMedia(value)
      if (!parsed.ok) {
        const status = parsed.raison === 'trop_lourd' ? 413 : 415
        const erreur = parsed.raison === 'trop_lourd'
          ? `Pièce trop volumineuse : ${kind} dépasse 2 Mo`
          : `Format de pièce non supporté : ${kind} (JPEG, PNG ou WebP attendu)`
        return NextResponse.json({ erreur }, { status })
      }
      medias.push({ kind, media: parsed.media })
    }

    // AUDIT-013 (MODE-1014) — GPS réel : la position mesurée (lat/lng) remplace
    // le simple indicateur hasGps. Une valeur non finie n'est jamais écrite
    // (le payload avait le champ mais pas de mesure exploitable).
    const gpsUtilisable = gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng) ? gps : null

    // MODE-936 (AUDIT-003 S-03) : le code brut prime (hachage scrypt
    // SERVEUR — le djb2 client ne traverse plus le réseau) ; l'ancienne
    // charge hashée reste acceptée pour les files offline pré-update, le
    // login la re-hashera transparentment au premier succès.
    const resolvedPinHash = typeof pin === 'string' && pin ? hashCodeScrypt(pin) : pinHash
    const resolvedPatternHash = typeof pattern === 'string' && pattern ? hashCodeScrypt(pattern) : patternHash
    const resolvedVisualCodeHash = typeof visualCode === 'string' && visualCode ? hashCodeScrypt(visualCode) : visualCodeHash

    const auth = await requireDeviceOwner(request, 'identificateur', identificateurId)
    if (auth) return auth

    // Classification marchand : normalisée (tolérante accents/casse) puis
    // gardée seulement pour les marchands — la base porte un CHECK qui
    // rejetterait toute valeur hors nomenclature.
    const resolvedCategorie = actorType === 'marchand' ? normalizeMarchandCategorie(categorieMarchand) : null

    const hasValidAuth = (authMethod === 'pin' && Boolean(resolvedPinHash))
      || (authMethod === 'pattern' && Boolean(resolvedPatternHash))
      || (authMethod === 'visual' && Boolean(resolvedVisualCodeHash))
    // DET-COOP-007 (MODE-978) — l'intention d'adhésion ne concerne que les
    // marchands (le module coopérative adhère des marchands) ; quand elle
    // est exprimée, la coopérative ciblée est OBLIGATOIRE et doit être un
    // uuid — une intention sans cible est une erreur de charge, pas un
    // dossier (l'agent corrige et renvoie, comme pour les autres champs).
    const resolvedCooperativeId = actorType === 'marchand' && estMembreCooperative && typeof cooperativeId === 'string' ? cooperativeId : null
    const adhesionIncomplete = actorType === 'marchand' && estMembreCooperative && !resolvedCooperativeId
    const uuidValide = resolvedCooperativeId
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedCooperativeId)
      : false
    if (adhesionIncomplete || (resolvedCooperativeId && !uuidValide)) {
      return NextResponse.json({
        erreur: 'Coopérative invalide : sélectionnez la coopérative d’adhésion du marchand',
        champsManquants: ['coopérative (adhésion)'],
      }, { status: 400 })
    }

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
    const provisioned = await provisionAccount(resolvedActorType, firstName || actorName, phone, authMethod, resolvedPinHash, resolvedPatternHash, resolvedVisualCodeHash, sexe, resolvedCategorie)

    // MODE-937 (S-04) : un code de liaison one-shot (30 j) accompagne le
    // dossier — l'identificateur le communique à l'acteur pour lier son
    // appareil sans que le secret traverse l'écran de l'agent.
    let codeLiaison: string | null = null
    if (provisioned) {
      try {
        codeLiaison = (await issueLiaisonCode(provisioned.type, provisioned.id, LIAISON_TTL_BACKOFFICE_MS, 'enrolement')).code
      } catch (liaisonError) {
        console.error('[API backoffice/enrolments] liaison code', liaisonError)
      }
    }

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
      // AUDIT-013 (MODE-1014) — colonnes GPS réelles (migration additive
      // 20260925160000 : aucun doublon, la table n'en portait pas avant).
      gps_lat: gpsUtilisable ? gpsUtilisable.lat : null,
      gps_lng: gpsUtilisable ? gpsUtilisable.lng : null,
      gps_accuracy_m: gpsUtilisable?.accuracy ?? null,
      status: 'en_attente',
      sexe: sexe || null,
      categorie_marchand: resolvedCategorie,
      activite: activite || null,
      type_commerce: resolvedActorType === 'marchand' ? (typeCommerce || null) : null,
      nom_commerce: resolvedActorType === 'marchand' ? (nomCommerce || null) : null,
    }).select().single()

    if (error) throw error

    // AUDIT-013 (MODE-1014) — pièces réelles : téléversement dans le bucket
    // PRIVÉ enrolments-media puis persistance des CHEMINS seuls en DB.
    // Invariant : un dossier visible au back-office porte ses pièces — tout
    // échec (téléversement, écriture des chemins, miroir canonique) annule
    // l'insertion (rollback ci-dessous) ; l'appareil, qui voit un 5xx,
    // remet le payload COMPLET en file et rejouera (insertion + pièces).
    try {
      if (medias.length > 0) {
        const paths = await televerserMediasEnrolement(supabase, enrolment.id, medias)
        const { error: cheminError } = await supabase
          .from('legacy_bo_enrolments')
          .update(paths)
          .eq('id', enrolment.id)
        if (cheminError) throw cheminError
      }

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
        gpsLat: gpsUtilisable ? gpsUtilisable.lat : null,
        gpsLng: gpsUtilisable ? gpsUtilisable.lng : null,
      })
    } catch (mediaOrMirrorError) {
      await supabase.from('legacy_bo_enrolments').delete().eq('id', enrolment.id)
      throw mediaOrMirrorError
    }

    // DET-COOP-007 (MODE-978) — adhésion coopérative automatique : le
    // compte marchand provisionné adhère DÈS L'ENRÔLEMENT à la coopérative
    // choisie par l'agent (aligné julaba-app §7 — actif, rôle membre).
    // Best-effort NON bloquant : un verdict autre que creee/deja_membre
    // n'invalide jamais le dossier (le président garde l'ajout manuel) ;
    // le verdict honnête remonte à l'agent dans la réponse.
    let adhesionCooperative: string | null = null
    if (provisioned?.type === 'merchant' && resolvedCooperativeId) {
      try {
        const verdict = await creerAdhesionDepuisEnrolement(supabase, {
          cooperativeId: resolvedCooperativeId,
          marchandId: provisioned.id,
        })
        adhesionCooperative = verdict
        if (verdict !== 'creee' && verdict !== 'deja_membre') {
          console.error('[API backoffice/enrolments] adhésion coopérative non créée:', verdict)
        }
      } catch (adhesionError) {
        console.error('[API backoffice/enrolments] adhésion coopérative', adhesionError)
        adhesionCooperative = 'erreur'
      }
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
        .then(({ error: rosterError }: { error: unknown }) => {
          if (rosterError) console.error('[API backoffice/enrolments] roster upsert', rosterError)
        })
    }

    // Le code de liaison (MODE-937) et le verdict d'adhésion (MODE-978)
    // sont ajoutés au payload standard du dossier.
    return NextResponse.json({ ...enrolment, codeLiaison, adhesionCooperative }, { status: 201 })
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
    const parsed = updateEnrolmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
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
      // MODE-941 (AUDIT-003 I-09/F-18) — actor_id SÉQUENTIEL avec réessai
      // (fin du 4 chiffres aléatoires sur colonne UNIQUE : ~120 collisions
      // attendues à 10 000 acteurs → la validation pouvait 500) et
      // préfixe honnête par type (les coopératives ne sont plus rangées
      // sous #M-).
      await createActeurAvecIdUnique(
        supabase,
        {
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
        },
        acteurPrefixPourType(enrolment.actor_type),
      )
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
          info_workflow_status: 'a_traiter',
          info_requested_at: new Date().toISOString(),
          info_assigned_to: null,
          info_assigned_at: null,
          info_response: null,
          info_responded_by: null,
          info_responded_at: null,
          info_closed_by: null,
          info_closed_at: null,
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
