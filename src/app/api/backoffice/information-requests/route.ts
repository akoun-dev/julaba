import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, canAccessZone, logAudit } from '@/lib/backoffice-auth'
import { createNotification } from '@/lib/notifications/server'
import { normalizeZoneKey } from '@/lib/objectifs'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — porte Zod du PATCH. id/action/response ont chacun déjà leur
// refus manuel à message spécifique (« Demande et action obligatoires »,
// « La réponse est obligatoire », action hors workflow incluse) → le schéma
// reste nullish pour que CES messages continuent de sortir (contrat préservé).
const informationRequestPatchSchema = z.object({
  id: z.string().nullish(),
  action: z.string().nullish(),
  response: z.string().nullish(),
})

const WORKFLOW = ['a_traiter', 'en_cours', 'repondue', 'traitee'] as const
type WorkflowStatus = typeof WORKFLOW[number]

function normalize(row: Record<string, unknown>) {
  return {
    id: row.id,
    dossierId: row.dossier_id,
    actorName: row.actor_name,
    actorType: row.actor_type,
    zone: row.zone,
    phone: row.phone,
    identificateurId: row.identificateur_id,
    identificateurName: row.identificateur_name,
    reason: row.info_request_reason ?? null,
    workflowStatus: row.info_workflow_status ?? 'a_traiter',
    requestedAt: row.info_requested_at ?? row.validated_at ?? row.updated_at,
    assignedTo: row.info_assigned_to ?? null,
    assignedAt: row.info_assigned_at ?? null,
    response: row.info_response ?? null,
    respondedBy: row.info_responded_by ?? null,
    respondedAt: row.info_responded_at ?? null,
    closedBy: row.info_closed_by ?? null,
    closedAt: row.info_closed_at ?? null,
    submittedAt: row.submitted_at,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'demandes-info', 'read')
  if (auth instanceof NextResponse) return auth
  try {
    const status = new URL(request.url).searchParams.get('status')
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('legacy_bo_enrolments')
      .select('*')
      .eq('status', 'info_demandee')
      .order('info_requested_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
    if (status && WORKFLOW.includes(status as WorkflowStatus)) query = query.eq('info_workflow_status', status)
    if (auth.user.role === 'gestionnaire_zone' && auth.user.zone)
      // MODE-1005 (AUDIT-012 P2) : clé normalisée zone_key — voir actors/route.ts.
      query = query.eq('zone_key', normalizeZoneKey(auth.user.zone))
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ requests: (data ?? []).map(normalize) })
  } catch (error) {
    console.error('[API information-requests GET]', error)
    return NextResponse.json({ erreur: 'Impossible de charger les demandes d’information' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'demandes-info', 'update')
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json() as { id?: string; action?: string; response?: string }
    const parsed = informationRequestPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    if (!body.id || !['prendre_en_charge', 'repondre', 'cloturer', 'reouvrir'].includes(body.action ?? '')) {
      return NextResponse.json({ erreur: 'Demande et action obligatoires' }, { status: 400 })
    }
    const supabase = createSupabaseAdminClient()
    const { data: current, error: findError } = await supabase
      .from('legacy_bo_enrolments').select('*').eq('id', body.id).eq('status', 'info_demandee').single()
    if (findError || !current) return NextResponse.json({ erreur: 'Demande introuvable' }, { status: 404 })
    if (!canAccessZone(auth.user, current.zone)) return NextResponse.json({ erreur: 'Demande hors de votre périmètre' }, { status: 403 })

    const currentStatus = (current.info_workflow_status ?? 'a_traiter') as WorkflowStatus
    const now = new Date().toISOString()
    const agent = auth.user.name || auth.user.email
    const updates: Record<string, unknown> = {}
    let auditAction = ''
    let auditDetails = ''

    if (body.action === 'prendre_en_charge') {
      if (currentStatus === 'traitee') return NextResponse.json({ erreur: 'La demande est déjà traitée' }, { status: 409 })
      updates.info_workflow_status = 'en_cours'
      updates.info_assigned_to = agent
      updates.info_assigned_at = now
      auditAction = 'information_request_claim'
      auditDetails = `Demande ${current.dossier_id} prise en charge par ${agent}`
    } else if (body.action === 'repondre') {
      if (!body.response?.trim()) return NextResponse.json({ erreur: 'La réponse est obligatoire' }, { status: 400 })
      if (currentStatus === 'traitee') return NextResponse.json({ erreur: 'La demande est déjà clôturée' }, { status: 409 })
      updates.info_workflow_status = 'repondue'
      updates.info_response = body.response.trim()
      updates.info_responded_by = agent
      updates.info_responded_at = now
      updates.info_assigned_to = current.info_assigned_to ?? agent
      updates.info_assigned_at = current.info_assigned_at ?? now
      auditAction = 'information_request_response'
      auditDetails = `Réponse apportée à la demande ${current.dossier_id}`
    } else if (body.action === 'cloturer') {
      if (currentStatus !== 'repondue' || !current.info_response?.trim()) return NextResponse.json({ erreur: 'Répondez à la demande avant de la clôturer' }, { status: 409 })
      updates.info_workflow_status = 'traitee'
      updates.info_closed_by = agent
      updates.info_closed_at = now
      auditAction = 'information_request_close'
      auditDetails = `Demande ${current.dossier_id} marquée comme traitée`
    } else {
      updates.info_workflow_status = 'a_traiter'
      updates.info_assigned_to = null
      updates.info_assigned_at = null
      auditAction = 'information_request_reopen'
      auditDetails = `Demande ${current.dossier_id} réouverte`
    }

    const { data: updated, error } = await supabase
      .from('legacy_bo_enrolments').update(updates).eq('id', body.id).select('*').single()
    if (error) throw error
    await logAudit({ userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email, action: auditAction, module: 'demandes-info', details: auditDetails, request })

    if (body.action === 'repondre' && current.identificateur_id) {
      await createNotification({
        subjectType: 'identificateur', subjectId: current.identificateur_id,
        type: 'dossier_info_demandee', title: 'Réponse à votre demande d’information',
        body: `La demande concernant le dossier de ${current.actor_name} a reçu une réponse : ${body.response!.trim()}`,
        data: { dossierId: current.dossier_id },
      })
    }
    return NextResponse.json({ request: normalize(updated) })
  } catch (error) {
    console.error('[API information-requests PATCH]', error)
    return NextResponse.json({ erreur: 'Impossible de traiter la demande' }, { status: 500 })
  }
}
