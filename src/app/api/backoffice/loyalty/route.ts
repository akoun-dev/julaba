import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { logAudit, requireBackofficePermission } from '@/lib/backoffice-auth'

const ruleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  actionType: z.enum(['sale', 'purchase', 'order_completed', 'harvest', 'cooperative_activity', 'payment', 'activity', 'manual_bonus']),
  targetRoles: z.array(z.enum(['all', 'marchand', 'producteur', 'grossiste', 'semi_grossiste', 'cooperateur', 'cooperative'])).min(1),
  condition: z.record(z.string(), z.unknown()).default({}),
  points: z.number().int().positive(),
  pointsPer: z.number().int().positive().nullable().optional(),
  limitCount: z.number().int().positive().nullable().optional(),
  period: z.enum(['transaction', 'day', 'week', 'month', 'program']).default('transaction'),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
})

const rewardSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  rewardType: z.enum(['COUPON', 'DISCOUNT', 'CASHBACK', 'ADVANTAGE', 'PROMOTION']),
  costPoints: z.number().int().positive(),
  valueCfa: z.number().int().nonnegative().nullable().optional(),
  targetRoles: z.array(z.enum(['all', 'marchand', 'producteur', 'grossiste', 'semi_grossiste', 'cooperateur', 'cooperative'])).min(1),
  stockAvailable: z.number().int().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'loyalty', 'read')
  if (auth instanceof NextResponse) return auth
  try {
    const supabase = createSupabaseAdminClient()
    const [programResult, rulesResult, levelsResult, rewardsResult, accountsResult, transactionsResult] = await Promise.all([
      supabase.from('loyalty_programs').select('*').eq('code', 'julaba-default').maybeSingle(),
      supabase.from('loyalty_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('loyalty_levels').select('*').order('threshold_points', { ascending: true }),
      supabase.from('loyalty_rewards').select('*').order('created_at', { ascending: false }),
      supabase.from('loyalty_accounts').select('id, subject_role, points_balance, current_level_id, status'),
      supabase.from('loyalty_transactions').select('id, kind, points, source, status, created_at'),
    ])
    const failedQuery = [programResult, rulesResult, levelsResult, rewardsResult, accountsResult, transactionsResult].find((result) => result.error)
    if (failedQuery?.error) throw failedQuery.error
    const program = programResult.data
    const rules = rulesResult.data
    const levels = levelsResult.data
    const rewards = rewardsResult.data
    const accountRows = accountsResult.data
    const transactionRows = transactionsResult.data
    const accounts = accountRows ?? []
    const transactions = transactionRows ?? []
    return NextResponse.json({
      program,
      rules: rules ?? [],
      levels: levels ?? [],
      rewards: rewards ?? [],
      stats: {
        activeAccounts: accounts.filter((a) => a.status === 'active').length,
      pointsDistributed: transactions.filter((t) => t.status === 'posted' && t.points > 0).reduce((sum, t) => sum + t.points, 0),
      pointsUsed: Math.abs(transactions.filter((t) => t.status === 'posted' && t.kind === 'REDEEM').reduce((sum, t) => sum + Math.min(t.points, 0), 0)),
      pointsExpired: Math.abs(transactions.filter((t) => t.status === 'posted' && t.kind === 'EXPIRATION').reduce((sum, t) => sum + Math.min(t.points, 0), 0)),
        accountsByRole: accounts.reduce((out: Record<string, number>, a) => { out[a.subject_role] = (out[a.subject_role] ?? 0) + 1; return out }, {} as Record<string, number>),
      },
    })
  } catch (error) {
    console.error('[API backoffice/loyalty GET]', error)
    return NextResponse.json({ erreur: 'Données fidélité indisponibles' }, { status: 500 })
  }
}

const createSchema = z.object({ entity: z.enum(['rule', 'reward', 'level', 'program']), data: z.unknown() })

export async function POST(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'loyalty', 'create')
  if (auth instanceof NextResponse) return auth
  try {
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ erreur: 'Entité fidélité invalide' }, { status: 422 })
    const supabase = createSupabaseAdminClient()
    const { data: program } = await supabase.from('loyalty_programs').select('id').eq('code', 'julaba-default').single()
    if (!program) return NextResponse.json({ erreur: 'Programme introuvable' }, { status: 404 })
    let result: { data: unknown; error: { message: string } | null }
    if (parsed.data.entity === 'rule') {
      const rule = ruleSchema.parse(parsed.data.data)
      result = await supabase.from('loyalty_rules').insert({ program_id: program.id, name: rule.name, description: rule.description ?? null, action_type: rule.actionType, target_roles: rule.targetRoles, condition: rule.condition, points: rule.points, points_per: rule.pointsPer ?? null, limit_count: rule.limitCount ?? null, period: rule.period, status: rule.status, starts_at: rule.startsAt ?? null, ends_at: rule.endsAt ?? null, created_by: auth.user.id }).select().single()
    } else if (parsed.data.entity === 'reward') {
      const reward = rewardSchema.parse(parsed.data.data)
      result = await supabase.from('loyalty_rewards').insert({ program_id: program.id, code: reward.code, name: reward.name, description: reward.description ?? null, reward_type: reward.rewardType, cost_points: reward.costPoints, value_cfa: reward.valueCfa ?? null, target_roles: reward.targetRoles, stock_available: reward.stockAvailable ?? null, usage_limit: reward.usageLimit ?? null, starts_at: reward.startsAt ?? null, ends_at: reward.endsAt ?? null, status: reward.status, metadata: reward.metadata, created_by: auth.user.id }).select().single()
    } else if (parsed.data.entity === 'level') {
      const level = z.object({ code: z.string().min(2).max(60), name: z.string().min(2).max(100), description: z.string().max(500).nullable().optional(), thresholdPoints: z.number().int().nonnegative(), sortOrder: z.number().int().nonnegative().default(0), benefits: z.array(z.unknown()).default([]), status: z.enum(['active', 'inactive', 'archived']).default('active') }).parse(parsed.data.data)
      result = await supabase.from('loyalty_levels').insert({ program_id: program.id, code: level.code, name: level.name, description: level.description ?? null, threshold_points: level.thresholdPoints, sort_order: level.sortOrder, benefits: level.benefits, status: level.status }).select().single()
    } else {
      return NextResponse.json({ erreur: 'Le programme par défaut ne peut pas être recréé' }, { status: 409 })
    }
    if (result.error) throw result.error
    await logAudit({ userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email, action: `loyalty.${parsed.data.entity}.create`, module: 'loyalty', details: JSON.stringify({ id: (result.data as { id?: string })?.id }), request })
    return NextResponse.json(result.data, { status: 201 })
  } catch (error) {
    console.error('[API backoffice/loyalty POST]', error)
    return NextResponse.json({ erreur: 'Création fidélité impossible' }, { status: 400 })
  }
}
