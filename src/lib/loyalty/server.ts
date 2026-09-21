import type { SupabaseClient } from '@supabase/supabase-js'

export type LoyaltySubjectRole = 'marchand' | 'producteur' | 'grossiste' | 'semi_grossiste' | 'cooperateur' | 'cooperative'

export interface PostLoyaltyTransactionInput {
  subjectId: string
  subjectRole: LoyaltySubjectRole
  operationId: string
  kind: 'EARN' | 'REDEEM' | 'REVERSAL' | 'EXPIRATION' | 'ADJUSTMENT' | 'BONUS'
  points: number
  source: string
  sourceId?: string | null
  description: string
  ruleId?: string | null
  expiresAt?: string | null
  deviceId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Point d'entrée serveur unique pour poster dans le ledger. Les routes métier
 * l'appellent après leur propre verdict serveur; le client ne peut jamais
 * appeler cette fonction directement.
 */
export async function postLoyaltyTransaction(
  supabase: SupabaseClient,
  input: PostLoyaltyTransactionInput,
) {
  const { data, error } = await supabase.rpc('loyalty_post_transaction', {
    p_subject_id: input.subjectId,
    p_subject_role: input.subjectRole,
    p_program_code: 'julaba-default',
    p_operation_id: input.operationId,
    p_kind: input.kind,
    p_points: input.points,
    p_source: input.source,
    p_source_id: input.sourceId ?? null,
    p_description: input.description,
    p_rule_id: input.ruleId ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_device_id: input.deviceId ?? null,
    p_metadata: input.metadata ?? {},
  })
  if (error) throw error
  return data as { idempotent: boolean; transactionId: string; accountId?: string; balance: number; levelId?: string | null }
}

export async function redeemLoyaltyReward(
  supabase: SupabaseClient,
  input: { subjectId: string; subjectRole: LoyaltySubjectRole; rewardId: string; operationId: string; deviceId?: string | null; metadata?: Record<string, unknown> },
) {
  const { data, error } = await supabase.rpc('loyalty_redeem_reward', {
    p_subject_id: input.subjectId,
    p_subject_role: input.subjectRole,
    p_program_code: 'julaba-default',
    p_reward_id: input.rewardId,
    p_operation_id: input.operationId,
    p_device_id: input.deviceId ?? null,
    p_metadata: input.metadata ?? {},
  })
  if (error) throw error
  return data as { idempotent: boolean; redemptionId: string; transactionId?: string; balance: number }
}

export function loyaltyOwnerType(role: LoyaltySubjectRole): 'merchant' | 'producteur' | 'cooperateur' {
  if (role === 'producteur') return 'producteur'
  if (role === 'cooperateur' || role === 'cooperative') return 'cooperateur'
  return 'merchant'
}
