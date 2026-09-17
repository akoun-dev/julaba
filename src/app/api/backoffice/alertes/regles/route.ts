import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission, logAudit } from '@/lib/backoffice-auth'
import { isMissingTableError } from '@/lib/backoffice/table-guard'
import { DEFAULT_ALERT_RULES, type AlertRuleType } from '@/lib/alertes-moteur'

// Seuils configurables du moteur d'alertes BO. GET renvoie les règles
// persistées (ou les défauts si la table n'existe pas encore / est vide) ;
// PUT met à jour seuil + activation par type de règle.

const VALID_RULE_TYPES = Object.keys(DEFAULT_ALERT_RULES) as AlertRuleType[]

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'alertes', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('legacy_bo_alert_rules')
      .select('*')
      .order('rule_type')

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ regles: [], migration_en_attente: true })
      }
      throw error
    }

    return NextResponse.json({ regles: data || [] })
  } catch (error) {
    console.error('Erreur listage règles alertes:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des seuils' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'alertes', 'update')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const updates: { ruleType: AlertRuleType; threshold: number; enabled: boolean }[] = Array.isArray(body.regles) ? body.regles : []

    if (updates.length === 0) {
      return NextResponse.json({ erreur: 'Aucune règle fournie' }, { status: 400 })
    }
    for (const u of updates) {
      if (!VALID_RULE_TYPES.includes(u.ruleType)) {
        return NextResponse.json({ erreur: `Type de règle inconnu : ${u.ruleType}` }, { status: 400 })
      }
      if (!Number.isFinite(u.threshold) || u.threshold < 0 || u.threshold > 10000) {
        return NextResponse.json({ erreur: `Seuil invalide pour ${u.ruleType}` }, { status: 400 })
      }
      if (typeof u.enabled !== 'boolean') {
        return NextResponse.json({ erreur: `Activation invalide pour ${u.ruleType}` }, { status: 400 })
      }
    }

    const supabase = createSupabaseAdminClient()
    const rows = updates.map((u) => ({
      rule_type: u.ruleType,
      threshold: u.threshold,
      enabled: u.enabled,
      created_by: auth.user.email,
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('legacy_bo_alert_rules')
      .upsert(rows, { onConflict: 'rule_type' })
      .select()
    if (error) throw error

    await logAudit({
      userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email,
      action: 'alert_rules_update', module: 'alertes',
      details: updates.map((u) => `${u.ruleType}=${u.threshold} (${u.enabled ? 'actif' : 'inactif'})`).join(', '),
      request,
    })

    return NextResponse.json({ regles: data || [] })
  } catch (error) {
    console.error('Erreur mise a jour seuils:', error)
    return NextResponse.json({ erreur: 'Erreur lors de l’enregistrement des seuils' }, { status: 500 })
  }
}
