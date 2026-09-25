import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { logAudit, requireBackofficePermission } from '@/lib/backoffice-auth'
import { isUuid } from '@/lib/postgrest-search'

const COOP_STATUSES = ['brouillon', 'en_attente_validation', 'active', 'suspendue', 'archivee'] as const
const MEMBERSHIP_STATUSES = ['en_attente', 'actif', 'suspendu', 'exclu'] as const

type CoopStatus = typeof COOP_STATUSES[number]
const allowedTransitions: Record<CoopStatus, CoopStatus[]> = {
  brouillon: ['en_attente_validation'],
  en_attente_validation: ['active', 'brouillon'],
  active: ['suspendue', 'archivee'],
  suspendue: ['active', 'archivee'],
  archivee: [],
}

function badRequest(erreur: string) { return NextResponse.json({ erreur }, { status: 400 }) }

async function writeCoopAudit(
  cooperativeId: string, actorId: string, action: string, entityType: string, entityId?: string,
  oldValue?: unknown, newValue?: unknown,
) {
  const db = createSupabaseAdminClient()
  await db.from('cooperative_audit_logs').insert({
    cooperative_id: cooperativeId, actor_id: actorId, action, entity_type: entityType,
    entity_id: entityId ?? null, old_value: oldValue ?? null, new_value: newValue ?? null,
  })
}

// DET-008/NORM-305 — le client admin Supabase est volontairement non typé
// (any) : types de ligne minimaux pour la lecture agrégée (MODE-980, cf.
// MarketProductRow) — spread dans la réponse ⇒ Record<string, unknown> &
// colonnes réellement consommées.
type CoopRow = Record<string, unknown> & { id: string }
type CoopMemberRow = Record<string, unknown> & {
  id: string
  cooperative_id: string | null
  membre_id: string | null
  statut: string | null
}
type CoopMerchantRow = Record<string, unknown> & { id: string }

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cooperatives', 'read')
  if (auth instanceof NextResponse) return auth
  try {
    const db = createSupabaseAdminClient()
    const id = new URL(request.url).searchParams.get('id')
    // AUDIT-005 : `id` est interpolé dans .or(`cooperative_id.eq.${id},…`)
    // plus bas — toute valeur non UUID est rejetée (l'injection d'un filtre
    // PostgREST arbitraire via ce paramètre est sinon possible).
    if (id && !isUuid(id)) {
      return NextResponse.json({ erreur: 'Identifiant coopérative invalide' }, { status: 400 })
    }
    // Un opérateur terrain ne voit que le périmètre qui lui est attribué.
    // Le modèle coopérative historique porte ce périmètre dans `region` ;
    // conserver ce filtre côté serveur évite qu’un identifiant ajouté à une
    // requête donne accès à une autre coopérative.
    // A11-F12 (AUDIT-011) : `gestionnaire_zone` est l'AUTRE rôle zoné — le
    // filtre lui est étendu (avant : périmètre national de fait).
    let cooperativesQuery = db.from('cooperatives').select('*').order('created_at', { ascending: false })
    if (auth.user.role === 'operateur_terrain' || auth.user.role === 'gestionnaire_zone') {
      if (!auth.user.zone) return NextResponse.json({ cooperatives: [] })
      cooperativesQuery = cooperativesQuery.eq('region', auth.user.zone)
    }
    const { data: cooperatives, error } = await cooperativesQuery
    if (error) throw error
    const rows = (cooperatives ?? []) as CoopRow[]
    const ids = rows.map((c) => c.id)
    const [membersRes, stockRes, txRes, auditRes, rolesRes, docsRes] = await Promise.all([
      ids.length ? db.from('cooperative_membres').select('id, cooperative_id, membre_id, statut, role, date_adhesion, created_at').in('cooperative_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from('cooperative_stock').select('cooperative_id, quantite').in('cooperative_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from('cooperative_transactions').select('cooperative_id, montant, type, statut').eq('statut', 'validee').in('cooperative_id', ids) : Promise.resolve({ data: [] }),
      id ? db.from('cooperative_audit_logs').select('*').eq('cooperative_id', id).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
      id ? db.from('cooperative_roles').select('*, cooperative_role_permissions(permission_code)').or(`cooperative_id.eq.${id},cooperative_id.is.null`) : Promise.resolve({ data: [] }),
      id ? db.from('cooperative_documents').select('*').eq('cooperative_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ])
    const allMembers = (membersRes.data ?? []) as CoopMemberRow[]
    const memberIds = [...new Set(allMembers.map((m) => m.membre_id))]
    const merchantsRes = memberIds.length ? await db.from('merchants').select('id, first_name, last_name, phone').in('id', memberIds) : { data: [] }
    const merchantById = new Map<string, CoopMerchantRow>(
      ((merchantsRes.data ?? []) as CoopMerchantRow[]).map((m): [string, CoopMerchantRow] => [m.id, m]),
    )
    const stats = new Map<string, { total: number; actifs: number; suspendus: number; attente: number; stock: number; ventes: number }>()
    for (const coop of rows) stats.set(coop.id, { total: 0, actifs: 0, suspendus: 0, attente: 0, stock: 0, ventes: 0 })
    // Garde no-op (MODE-980) : cooperative_id est NOT NULL en base — `?? ''`
    // ne change rien au runtime, il satisfait seulement tsc.
    for (const m of allMembers) { const s = stats.get(m.cooperative_id ?? '')!; s.total++; if (m.statut === 'actif') s.actifs++; if (m.statut === 'suspendu') s.suspendus++; if (m.statut === 'en_attente') s.attente++ }
    for (const s of stockRes.data ?? []) stats.get(s.cooperative_id)!.stock += Number(s.quantite)
    for (const t of txRes.data ?? []) if (t.type === 'entree') stats.get(t.cooperative_id)!.ventes += Number(t.montant)
    const payload = rows.map((coop) => ({ ...coop, stats: stats.get(coop.id)! }))
    if (!id) return NextResponse.json({ cooperatives: payload })
    const cooperative = payload.find((c) => c.id === id)
    if (!cooperative) return NextResponse.json({ erreur: 'Coopérative introuvable' }, { status: 404 })
    return NextResponse.json({ cooperative, members: allMembers.filter((m) => m.cooperative_id === id).map((m) => ({ ...m, merchant: merchantById.get(m.membre_id ?? '') ?? null })), roles: rolesRes.data ?? [], documents: docsRes.data ?? [], audit: auditRes.data ?? [] })
  } catch (error) {
    console.error('[API backoffice/cooperatives GET]', error)
    return NextResponse.json({ erreur: 'Impossible de charger les coopératives.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cooperatives', 'create')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const nom = typeof body.nom === 'string' ? body.nom.trim() : ''
    const responsableId = typeof body.responsableId === 'string' ? body.responsableId : ''
    if (nom.length < 2 || nom.length > 120 || !responsableId) return badRequest('Le nom officiel et le responsable existant sont obligatoires.')
    const db = createSupabaseAdminClient()
    const { data: responsable } = await db.from('cooperateurs').select('id').eq('id', responsableId).maybeSingle()
    if (!responsable) return badRequest('Le responsable doit être un coopérateur Jùlaba existant.')
    const { data, error } = await db.from('cooperatives').insert({
      nom, responsable_id: responsableId, nom_usuel: body.nomUsuel || null, sigle: body.sigle || null,
      commune: body.commune || null, region: body.region || null, filieres: Array.isArray(body.filieres) ? body.filieres : [],
      statut: 'brouillon', date_adhesion_julaba: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (error) throw error
    await writeCoopAudit(data.id, auth.user.id, 'creation', 'cooperative', data.id, undefined, { nom: data.nom, statut: data.statut })
    await logAudit({ userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email, action: 'Création de coopérative', module: 'cooperatives', details: data.nom, request })
    return NextResponse.json({ cooperative: data }, { status: 201 })
  } catch (error) {
    console.error('[API backoffice/cooperatives POST]', error)
    return NextResponse.json({ erreur: 'Impossible de créer la coopérative.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'cooperatives', 'update')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const cooperativeId = typeof body.cooperativeId === 'string' ? body.cooperativeId : ''
    if (!cooperativeId) return badRequest('Coopérative requise.')
    const db = createSupabaseAdminClient()
    const { data: current, error: fetchError } = await db.from('cooperatives').select('*').eq('id', cooperativeId).maybeSingle()
    if (fetchError) throw fetchError
    if (!current) return NextResponse.json({ erreur: 'Coopérative introuvable' }, { status: 404 })

    if (body.action === 'membership') {
      const membershipId = typeof body.membershipId === 'string' ? body.membershipId : ''
      const updates: Record<string, unknown> = {}
      if (MEMBERSHIP_STATUSES.includes(body.statut)) { updates.statut = body.statut; updates.actif = body.statut === 'actif' }
      if (typeof body.role === 'string' && body.role.trim()) updates.role = body.role.trim()
      if (!membershipId || !Object.keys(updates).length) return badRequest('Modification d’adhésion invalide.')
      const { data, error } = await db.from('cooperative_membres').update(updates).eq('id', membershipId).eq('cooperative_id', cooperativeId).select().maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ erreur: 'Adhésion introuvable' }, { status: 404 })
      await writeCoopAudit(cooperativeId, auth.user.id, 'modification_adhesion', 'membership', membershipId, undefined, updates)
      return NextResponse.json({ membership: data })
    }

    const requested = body.statut as CoopStatus | undefined
    if (requested && !COOP_STATUSES.includes(requested)) return badRequest('Statut invalide.')
    if (requested && requested !== current.statut && !allowedTransitions[current.statut as CoopStatus]?.includes(requested)) return badRequest(`Transition interdite : ${current.statut} → ${requested}.`)
    const updates: Record<string, unknown> = {}
    for (const [incoming, column] of Object.entries({ nom: 'nom', nomUsuel: 'nom_usuel', sigle: 'sigle', commune: 'commune', region: 'region', telephone: 'telephone', email: 'email', description: 'description', typeCooperative: 'type_cooperative' })) if (incoming in body) updates[column] = typeof body[incoming] === 'string' ? body[incoming].trim() || null : null
    if (Array.isArray(body.filieres)) updates.filieres = body.filieres.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean)
    if (requested) { updates.statut = requested; updates.actif = requested === 'active'; if (requested === 'archivee') { updates.archived_at = new Date().toISOString(); updates.archived_by = auth.user.id } }
    if (!Object.keys(updates).length) return badRequest('Aucune modification fournie.')
    const { data, error } = await db.from('cooperatives').update(updates).eq('id', cooperativeId).select().single()
    if (error) throw error
    await writeCoopAudit(cooperativeId, auth.user.id, requested ? 'changement_statut' : 'modification', 'cooperative', cooperativeId, { statut: current.statut }, updates)
    return NextResponse.json({ cooperative: data })
  } catch (error) {
    console.error('[API backoffice/cooperatives PATCH]', error)
    return NextResponse.json({ erreur: 'Impossible de modifier la coopérative.' }, { status: 500 })
  }
}
