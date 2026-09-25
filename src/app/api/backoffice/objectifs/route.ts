import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit, canAccessZone } from '@/lib/backoffice-auth'
import { isMissingTableError } from '@/lib/backoffice/table-guard'
import { normalizeZoneKey } from '@/lib/objectifs'
import { formatZodError } from '@/lib/validation/marchand'

// MODE-1007 — porte Zod du POST. scope/cibleId/cibleLabel ont déjà leur 400
// manuel « Cible invalide (scope + identifiant + libellé requis) » et
// month/year/target leurs messages propres (« Période invalide », « La cible
// doit être un entier entre 1 et 100 000 ») → le schéma reste permissif
// (nullish ; Number() via lequel passent month/year/target accepte les
// chaînes numériques → z.unknown()) pour que CES messages continuent de
// sortir (contrat préservé).
const createObjectifSchema = z.object({
  scope: z.string().nullish(),
  cibleId: z.string().nullish(),
  cibleLabel: z.string().nullish(),
  month: z.unknown().optional(),
  year: z.unknown().optional(),
  target: z.unknown().optional(),
})

// Objectifs mensuels de dossiers, définis depuis le back-office par
// identificateur ou par zone entière — source de vérité de la « mission
// mensuelle » affichée sur l'app identificateur (GET
// /api/identificateur/mission). La progression renvoyée ici est calculée
// en direct depuis legacy_bo_enrolments (comme la progression des missions).

interface ObjectifRow {
  id: string
  scope: 'identificateur' | 'zone'
  cible_id: string
  cible_label: string
  month: number
  year: number
  target: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'objectifs', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = Number(searchParams.get('month') ?? now.getMonth())
    const year = Number(searchParams.get('year') ?? now.getFullYear())
    if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) {
      return NextResponse.json({ erreur: 'Période invalide' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: objectifs, error } = await supabase
      .from('legacy_bo_objectifs')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .order('updated_at', { ascending: false })

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ objectifs: [], periode: { month, year }, migration_en_attente: true })
      }
      throw error
    }

    // Progression en direct : enrôlements soumis dans la fenêtre du mois.
    const start = new Date(Date.UTC(year, month, 1)).toISOString()
    const end = new Date(Date.UTC(year, month + 1, 1)).toISOString()
    const { data: enrolments, error: eErr } = await supabase
      .from('legacy_bo_enrolments')
      .select('identificateur_id, zone, submitted_at')
      .gte('submitted_at', start)
      .lt('submitted_at', end)
    if (eErr) throw eErr

    const rows = (enrolments || []) as { identificateur_id: string | null; zone: string; submitted_at: string }[]

    const withProgress = ((objectifs || []) as ObjectifRow[])
      .filter((o) => canAccessZone(auth.user, o.scope === 'zone' ? o.cible_label : null))
      .map((o) => {
        let current = 0
        for (const e of rows) {
          if (o.scope === 'identificateur') {
            if (e.identificateur_id === o.cible_id) current++
          } else if (normalizeZoneKey(e.zone) === normalizeZoneKey(o.cible_id)) {
            current++
          }
        }
        return { ...o, current }
      })

    return NextResponse.json({ objectifs: withProgress, periode: { month, year } })
  } catch (error) {
    console.error('Erreur listage objectifs:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des objectifs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'objectifs', 'create')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const parsed = createObjectifSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const scope = body.scope as 'identificateur' | 'zone'
    const cibleId = String(body.cibleId || '').trim()
    const cibleLabel = String(body.cibleLabel || '').trim()
    const month = Number(body.month)
    const year = Number(body.year)
    const target = Number(body.target)

    if ((scope !== 'identificateur' && scope !== 'zone') || !cibleId || !cibleLabel) {
      return NextResponse.json({ erreur: 'Cible invalide (scope + identifiant + libellé requis)' }, { status: 400 })
    }
    if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) {
      return NextResponse.json({ erreur: 'Période invalide' }, { status: 400 })
    }
    if (!Number.isInteger(target) || target <= 0 || target > 100000) {
      return NextResponse.json({ erreur: 'La cible doit être un entier entre 1 et 100 000' }, { status: 400 })
    }

    // MODE-941 (AUDIT-003 S-08) — frontière de zone : un gestionnaire de
    // zone ne fixe des objectifs QUE dans sa zone (cible zone = la sienne,
    // cible identificateur = un agent de sa zone — vérifié en base).
    if (auth.user.role === 'gestionnaire_zone') {
      if (scope === 'zone' && normalizeZoneKey(cibleId) !== normalizeZoneKey(auth.user.zone ?? '')) {
        return NextResponse.json({ erreur: 'Cette zone ne relève pas de votre périmètre' }, { status: 403 })
      }
      if (scope === 'identificateur') {
        const supabaseZone = createSupabaseAdminClient()
        const { data: agent } = await supabaseZone
          .from('legacy_bo_identificateurs')
          .select('zone')
          .eq('id', cibleId)
          .single()
        if (!agent || !canAccessZone(auth.user, (agent as { zone: string | null }).zone)) {
          return NextResponse.json({ erreur: 'Cet identificateur ne relève pas de votre périmètre' }, { status: 403 })
        }
      }
    }

    const supabase = createSupabaseAdminClient()
    const payload = {
      scope,
      cible_id: scope === 'zone' ? normalizeZoneKey(cibleId) : cibleId,
      cible_label: cibleLabel,
      month,
      year,
      target,
      created_by: auth.user.email,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('legacy_bo_objectifs')
      .upsert(payload, { onConflict: 'scope,cible_id,month,year' })
      .select()
      .single()
    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'objectif_upsert', module: 'objectifs',
      details: `${scope === 'zone' ? 'Zone' : 'Identificateur'} ${cibleLabel} : ${target} dossiers pour ${month + 1}/${year}`,
      request,
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erreur création objectif:', error)
    return NextResponse.json({ erreur: 'Erreur lors de l’enregistrement de l’objectif' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'objectifs', 'delete')
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ erreur: 'Identifiant requis' }, { status: 400 })

    const supabase = createSupabaseAdminClient()
    // MODE-941 (AUDIT-003 S-08) — frontière de zone AVANT la suppression :
    // l'objectif doit relever du périmètre du gestionnaire.
    if (auth.user.role === 'gestionnaire_zone') {
      const { data: existant } = await supabase
        .from('legacy_bo_objectifs')
        .select('scope, cible_id')
        .eq('id', id)
        .single()
      const o = (existant ?? {}) as { scope?: string; cible_id?: string | null }
      if (o.scope === 'zone' && (!o.cible_id || normalizeZoneKey(o.cible_id) !== normalizeZoneKey(auth.user.zone ?? ''))) {
        return NextResponse.json({ erreur: 'Cet objectif ne relève pas de votre périmètre' }, { status: 403 })
      }
      if (o.scope === 'identificateur' && o.cible_id) {
        const { data: agent } = await supabase
          .from('legacy_bo_identificateurs')
          .select('zone')
          .eq('id', o.cible_id)
          .single()
        if (!agent || !canAccessZone(auth.user, (agent as { zone: string | null }).zone)) {
          return NextResponse.json({ erreur: 'Cet objectif ne relève pas de votre périmètre' }, { status: 403 })
        }
      }
    }

    const { data, error } = await supabase
      .from('legacy_bo_objectifs')
      .delete()
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'objectif_delete', module: 'objectifs',
      details: `Objectif supprimé : ${data?.cible_label} (${data?.month + 1}/${data?.year})`,
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erreur suppression objectif:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la suppression de l’objectif' }, { status: 500 })
  }
}
