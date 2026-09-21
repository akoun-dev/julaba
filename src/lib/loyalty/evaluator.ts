import type { SupabaseClient } from '@supabase/supabase-js'
import { postLoyaltyTransaction, type LoyaltySubjectRole } from './server'

export interface LoyaltyEvent {
  subjectId: string
  subjectRole: LoyaltySubjectRole
  actionType: 'sale' | 'purchase' | 'order_completed' | 'harvest' | 'cooperative_activity' | 'payment' | 'activity'
  source: string
  sourceId: string
  amountCfa?: number
  metadata?: Record<string, unknown>
}

type LoyaltyRule = {
  id: string
  name: string
  action_type: LoyaltyEvent['actionType']
  target_roles: string[]
  condition: Record<string, unknown>
  points: number
  points_per: number | null
  limit_count: number | null
  period: string
  starts_at: string | null
  ends_at: string | null
}

function roleMatches(targets: string[], role: LoyaltySubjectRole): boolean {
  return targets.length === 0 || targets.includes('all') || targets.includes(role)
}

function conditionMatches(condition: Record<string, unknown>, event: LoyaltyEvent): boolean {
  const minimum = Number(condition.minAmountCfa ?? condition.amountMinCfa ?? 0)
  const maximum = condition.maxAmountCfa == null ? null : Number(condition.maxAmountCfa)
  if (minimum > 0 && (event.amountCfa ?? 0) < minimum) return false
  if (maximum != null && Number.isFinite(maximum) && (event.amountCfa ?? 0) > maximum) return false
  return true
}

function calculatePoints(rule: LoyaltyRule, event: LoyaltyEvent): number {
  if (rule.points_per && event.amountCfa != null) {
    return Math.floor(event.amountCfa / rule.points_per) * rule.points
  }
  return rule.points
}

/**
 * Évalue les règles actives côté serveur après le succès d'une opération.
 * Une erreur de fidélité ne bloque jamais l'opération métier source : elle
 * sera observable dans les logs et pourra être rejouée par l'outil d'admin.
 */
export async function awardLoyaltyForEvent(supabase: SupabaseClient, event: LoyaltyEvent): Promise<void> {
  const { data: rules, error } = await supabase
    .from('loyalty_rules')
    .select('id, name, action_type, target_roles, condition, points, points_per, limit_count, period, starts_at, ends_at')
    .eq('program_id', (await supabase.from('loyalty_programs').select('id').eq('code', 'julaba-default').eq('status', 'active').single()).data?.id ?? '')
    .eq('action_type', event.actionType)
    .eq('status', 'active')
  if (error) throw error

  for (const rule of (rules ?? []) as LoyaltyRule[]) {
    const now = Date.now()
    if (rule.starts_at && Date.parse(rule.starts_at) > now) continue
    if (rule.ends_at && Date.parse(rule.ends_at) <= now) continue
    if (!roleMatches(rule.target_roles ?? [], event.subjectRole)) continue
    if (!conditionMatches(rule.condition ?? {}, event)) continue
    const points = calculatePoints(rule, event)
    if (points <= 0) continue
    await postLoyaltyTransaction(supabase, {
      subjectId: event.subjectId,
      subjectRole: event.subjectRole,
      operationId: `${event.source}:${event.sourceId}:rule:${rule.id}`,
      kind: 'EARN',
      points,
      source: event.source,
      sourceId: event.sourceId,
      ruleId: rule.id,
      description: `${rule.name} — ${event.source}`,
      metadata: event.metadata,
    })
  }
}
