import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { isMissingTableError } from '@/lib/backoffice/table-guard'
import { normalizeZoneKey } from '@/lib/objectifs'
import {
  DEFAULT_ALERT_RULES,
  computeDossiersEnAttente,
  computeIdentificateursInactifs,
  computeChuteVentes,
  computeObjectifsEnRetard,
  type AlertRuleType,
  type AlertRuleDef,
  type GeneratedAlert,
} from '@/lib/alertes-moteur'

// Moteur d'alertes back-office — « proactif au lieu de consultatif ».
// POST /api/backoffice/alertes/evaluer charge les seuils actifs, évalue les
// quatre règles contre les données réelles du jour (enrôlements, roster,
// ventes, objectifs) et insère les alertes nouvelles dans legacy_bo_alerts.
// La clé dedup_key (type:référence:jour) garantit qu'une ré-évaluation le
// même jour ne duplique rien ; l'agrégation par référence en écrasant
// l'horodatage remet l'alerte en tête des non-lues si la situation persiste.

const ROUTE_TYPES: AlertRuleType[] = ['dossiers_en_attente', 'identificateur_inactif', 'chute_ventes', 'objectif_en_retard']

function dayRangeUtcStr(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 86_400_000)
  if (Number.isNaN(start.getTime())) throw new Error('date invalide')
  return { start: start.toISOString(), end: end.toISOString() }
}

function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'alertes', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    // ── 1. Seuils actifs (repli sur les défauts si la table manque) ──
    const rules: Record<AlertRuleType, AlertRuleDef> = {
      dossiers_en_attente: { ruleType: 'dossiers_en_attente', ...DEFAULT_ALERT_RULES.dossiers_en_attente, enabled: true },
      identificateur_inactif: { ruleType: 'identificateur_inactif', ...DEFAULT_ALERT_RULES.identificateur_inactif, enabled: true },
      chute_ventes: { ruleType: 'chute_ventes', ...DEFAULT_ALERT_RULES.chute_ventes, enabled: true },
      objectif_en_retard: { ruleType: 'objectif_en_retard', ...DEFAULT_ALERT_RULES.objectif_en_retard, enabled: true },
    }
    let rulesSource: 'base' | 'defauts' = 'defauts'
    {
      const { data: ruleRows, error } = await supabase
        .from('legacy_bo_alert_rules')
        .select('rule_type, threshold, enabled')
      if (error && !isMissingTableError(error)) throw error
      if (ruleRows && ruleRows.length > 0) {
        rulesSource = 'base'
        for (const row of ruleRows as { rule_type: AlertRuleType; threshold: number; enabled: boolean }[]) {
          if (!ROUTE_TYPES.includes(row.rule_type)) continue
          rules[row.rule_type] = {
            ruleType: row.rule_type,
            unit: DEFAULT_ALERT_RULES[row.rule_type].unit,
            threshold: Number(row.threshold),
            enabled: row.enabled,
          }
        }
      }
    }

    const alerts: GeneratedAlert[] = []
    const skipped: AlertRuleType[] = []

    // ── 2. Données réelles (les requêtes indépendantes en parallèle) ──
    const [enrolmentsRes, identsRes, salesRes] = await Promise.all([
      supabase
        .from('legacy_bo_enrolments')
        .select('id, dossier_id, actor_name, status, submitted_at, identificateur_id, zone, created_at')
        .gte('submitted_at', new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()),
      supabase
        .from('legacy_bo_identificateurs')
        .select('id, name, is_active, created_at'),
      supabase
        .from('legacy_sales')
        .select('total_amount, created_at')
        .gte('created_at', new Date(`${shiftDateStr(todayStr, -8)}T00:00:00.000Z`).toISOString())
        .order('created_at', { ascending: true }),
    ])
    if (enrolmentsRes.error) throw enrolmentsRes.error
    if (identsRes.error) throw identsRes.error
    if (salesRes.error) throw salesRes.error

    const enrolments = (enrolmentsRes.data || []) as {
      id: string; dossier_id: string; actor_name: string; status: string
      submitted_at: string; identificateur_id: string | null; zone: string; created_at: string
    }[]
    const idents = (identsRes.data || []) as {
      id: string; name: string; is_active: boolean; created_at: string
    }[]

    // ── 3. Règle 1 : dossiers en attente ──
    if (rules.dossiers_en_attente.enabled) {
      alerts.push(...computeDossiersEnAttente(
        enrolments.map((e) => ({
          id: e.id, dossierId: e.dossier_id, actorName: e.actor_name,
          status: e.status, submittedAt: e.submitted_at,
        })),
        rules.dossiers_en_attente.threshold,
        now,
      ))
    }

    // ── 4. Règle 2 : identificateurs inactifs ──
    if (rules.identificateur_inactif.enabled) {
      const lastByAgent = new Map<string, string>()
      for (const e of enrolments) {
        if (!e.identificateur_id) continue
        const prev = lastByAgent.get(e.identificateur_id)
        if (!prev || e.submitted_at > prev) lastByAgent.set(e.identificateur_id, e.submitted_at)
      }
      alerts.push(...computeIdentificateursInactifs(
        idents.map((i) => ({
          id: i.id, name: i.name, isActive: i.is_active, createdAt: i.created_at,
          lastEnrolmentAt: lastByAgent.get(i.id) ?? null,
        })),
        rules.identificateur_inactif.threshold,
        now,
      ))
    }

    // ── 5. Règle 3 : chute des ventes ──
    if (rules.chute_ventes.enabled) {
      const totalsByDay = new Map<string, number>()
      for (const s of (salesRes.data || []) as { total_amount: number; created_at: string }[]) {
        const day = s.created_at.slice(0, 10)
        totalsByDay.set(day, (totalsByDay.get(day) || 0) + Number(s.total_amount || 0))
      }
      const dailyTotals: { date: string; total: number }[] = []
      for (let i = -7; i <= 0; i++) {
        const date = shiftDateStr(todayStr, i)
        dailyTotals.push({ date, total: totalsByDay.get(date) || 0 })
      }
      alerts.push(...computeChuteVentes(dailyTotals, rules.chute_ventes.threshold, now))
    }

    // ── 6. Règle 4 : objectifs mensuels en retard ──
    if (rules.objectif_en_retard.enabled) {
      const { data: objectifs, error: oErr } = await supabase
        .from('legacy_bo_objectifs')
        .select('id, scope, cible_id, cible_label, month, year, target')
        .eq('month', now.getMonth())
        .eq('year', now.getFullYear())
      if (oErr && !isMissingTableError(oErr)) throw oErr
      if (!oErr && objectifs) {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
        const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
        const monthRows = enrolments.filter((e) => e.submitted_at >= monthStart && e.submitted_at < monthEnd)
        alerts.push(...computeObjectifsEnRetard(
          (objectifs as { id: string; scope: 'identificateur' | 'zone'; cible_id: string; cible_label: string; month: number; year: number; target: number }[])
            .map((o) => {
              let current = 0
              for (const e of monthRows) {
                if (o.scope === 'identificateur') {
                  if (e.identificateur_id === o.cible_id) current++
                } else if (normalizeZoneKey(e.zone) === normalizeZoneKey(o.cible_id)) {
                  current++
                }
              }
              return { id: o.id, scope: o.scope, cibleLabel: o.cible_label, month: o.month, year: o.year, target: o.target, current }
            }),
          rules.objectif_en_retard.threshold,
          now,
        ))
      } else {
        skipped.push('objectif_en_retard')
      }
    }

    // ── 7. Déduplication puis insertion des alertes nouvelles ──
    let generated = 0
    if (alerts.length > 0) {
      // Détection de la colonne dedup_key (migration 20260917140000) : sur
      // une base sans la migration, on se replie sur une déduplication par
      // (module + message) du jour — le message contient la référence.
      let hasDedupColumn = true
      {
        const probe = await supabase.from('legacy_bo_alerts').select('dedup_key').limit(1)
        if (probe.error) {
          const msg = (probe.error as { message?: string }).message || ''
          if (/dedup_key|42703|PGRST204|schema cache/i.test(msg)) hasDedupColumn = false
          else if (!isMissingTableError(probe.error)) throw probe.error
          else hasDedupColumn = false
        }
      }

      let rowsToInsert: { severity: string; title: string; message: string; module: string; acknowledged: boolean; dedup_key?: string; created_at: string }[]

      if (hasDedupColumn) {
        const dedupKeys = alerts.map((a) => a.dedupKey)
        const { data: existing, error: exErr } = await supabase
          .from('legacy_bo_alerts')
          .select('dedup_key, acknowledged')
          .in('dedup_key', dedupKeys)
        if (exErr && !isMissingTableError(exErr)) throw exErr

        // Une alerte déjà présente mais encore non lue est rafraîchie
        // (horodatage + message) pour remonter en tête ; une alerte déjà
        // prise en compte (ack) n'est jamais réactivée.
        const existingByKey = new Map((existing || []).map((row) => [row.dedup_key as string, row.acknowledged as boolean]))

        rowsToInsert = alerts
          .filter((a) => existingByKey.get(a.dedupKey) !== true)
          .map((a) => ({
            severity: a.severity,
            title: a.title,
            message: a.message,
            module: a.module,
            acknowledged: false,
            dedup_key: a.dedupKey,
            created_at: now.toISOString(),
          }))

        if (rowsToInsert.length > 0) {
          const { error: insErr } = await supabase
            .from('legacy_bo_alerts')
            .upsert(rowsToInsert, { onConflict: 'dedup_key' })
          if (insErr) throw insErr
        }
      } else {
        // Repli sans migration : alertes du jour lues par module, une
        // alerte (module, message) déjà connue n'est jamais dupliquée.
        const dayStart = now.toISOString().slice(0, 10)
        const { data: todays, error: tErr } = await supabase
          .from('legacy_bo_alerts')
          .select('module, message, acknowledged')
          .gte('created_at', `${dayStart}T00:00:00.000Z`)
        if (tErr && !isMissingTableError(tErr)) throw tErr
        const knownMsgs = new Map((todays || []).map((row) => [`${row.module}|${row.message}`, row.acknowledged as boolean]))

        rowsToInsert = alerts
          // Repli strict : toute alerte (module + message) déjà présente
          // aujourd'hui — lue ou non — n'est jamais dupliquée.
          .filter((a) => !knownMsgs.has(`${a.module}|${a.message}`))
          .map((a) => ({
            severity: a.severity,
            title: a.title,
            message: a.message,
            module: a.module,
            acknowledged: false,
            created_at: now.toISOString(),
          }))

        if (rowsToInsert.length > 0) {
          const { error: insErr } = await supabase
            .from('legacy_bo_alerts')
            .insert(rowsToInsert)
          if (insErr) throw insErr
        }
      }

      generated = rowsToInsert.length
    }

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'alertes_evaluer', module: 'alertes',
      details: `${generated} alerte(s) générée(s), seuils ${rulesSource === 'base' ? 'persistés' : 'par défaut'}`,
      request,
    })

    return NextResponse.json({
      generated,
      skipped,
      rulesSource,
      alertes: alerts,
    })
  } catch (error) {
    console.error('Erreur évaluation alertes:', error)
    return NextResponse.json({ erreur: 'Erreur lors de l’évaluation des alertes' }, { status: 500 })
  }
}
