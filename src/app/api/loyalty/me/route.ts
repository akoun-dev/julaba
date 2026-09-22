import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { loyaltyOwnerType, redeemLoyaltyReward, type LoyaltySubjectRole } from '@/lib/loyalty/server'

const roleSchema = z.enum(['marchand', 'producteur', 'grossiste', 'semi_grossiste', 'cooperateur'])

function parseRole(value: string | null): LoyaltySubjectRole | null {
  const parsed = roleSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

async function guard(request: NextRequest, subjectId: string | null, role: LoyaltySubjectRole | null) {
  if (!subjectId || !role) return NextResponse.json({ erreur: 'subjectId et subjectRole sont requis' }, { status: 400 })
  return requireDeviceOwner(request, loyaltyOwnerType(role), subjectId)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subjectId = searchParams.get('subjectId')
    const role = parseRole(searchParams.get('subjectRole'))
    const guardResponse = await guard(request, subjectId, role)
    if (guardResponse) return guardResponse

    const supabase = createSupabaseAdminClient()
    const { data: program, error: programError } = await supabase
      .from('loyalty_programs')
      .select('id, code, name, description')
      .eq('code', 'julaba-default')
      .eq('status', 'active')
      .maybeSingle()
    if (programError) throw programError
    if (!program) return NextResponse.json({ erreur: 'Programme fidélité indisponible' }, { status: 503 })

    const { data: account, error: accountError } = await supabase
      .from('loyalty_accounts')
      .select('id, subject_id, subject_role, points_balance, points_earned, points_redeemed, points_expired, current_level_id, status, created_at')
      .eq('program_id', program.id)
      .eq('subject_id', subjectId)
      .maybeSingle()
    if (accountError) throw accountError

    if (!account) {
      return NextResponse.json({ program, account: null, level: null, nextLevel: null, progress: null, rewards: [], transactions: [] })
    }

    const [{ data: level }, { data: nextLevel }, { data: rewards }, { data: transactions }] = await Promise.all([
      account.current_level_id
        ? supabase.from('loyalty_levels').select('id, code, name, description, threshold_points, benefits').eq('id', account.current_level_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('loyalty_levels').select('id, code, name, description, threshold_points, benefits').eq('program_id', program.id).eq('status', 'active').gt('threshold_points', account.points_balance).order('threshold_points', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('loyalty_rewards').select('id, code, name, description, reward_type, cost_points, value_cfa, target_roles, stock_available, usage_limit, starts_at, ends_at').eq('program_id', program.id).eq('status', 'active').or(`target_roles.cs.{all},target_roles.cs.{${role}}`).order('cost_points', { ascending: true }),
      supabase.from('loyalty_transactions').select('id, kind, points, source, source_id, description, expires_at, status, created_at').eq('account_id', account.id).order('created_at', { ascending: false }).limit(100),
    ])

    const previousThreshold = level?.threshold_points ?? 0
    const nextThreshold = nextLevel?.threshold_points ?? previousThreshold
    const span = Math.max(nextThreshold - previousThreshold, 1)
    const progress = nextLevel ? Math.min(100, Math.max(0, Math.round(((account.points_balance - previousThreshold) / span) * 100))) : 100
    return NextResponse.json({ program, account, level: level ?? null, nextLevel: nextLevel ?? null, progress, rewards: rewards ?? [], transactions: transactions ?? [] })
  } catch (error) {
    console.error('[API loyalty/me GET]', error)
    return NextResponse.json({ erreur: 'Compte fidélité indisponible' }, { status: 500 })
  }
}

const redeemSchema = z.object({
  subjectId: z.string().min(1),
  subjectRole: roleSchema,
  rewardId: z.string().uuid(),
  operationId: z.string().min(8).max(160),
  deviceId: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = redeemSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ erreur: 'Données de récompense invalides' }, { status: 422 })
    const guardResponse = await guard(request, parsed.data.subjectId, parsed.data.subjectRole)
    if (guardResponse) return guardResponse

    const result = await redeemLoyaltyReward(createSupabaseAdminClient(), {
      subjectId: parsed.data.subjectId,
      subjectRole: parsed.data.subjectRole,
      rewardId: parsed.data.rewardId,
      operationId: parsed.data.operationId,
      deviceId: parsed.data.deviceId,
      metadata: parsed.data.metadata,
    })
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === 'P0001') return NextResponse.json({ erreur: 'Solde de points insuffisant' }, { status: 422 })
    if (code === 'P0003') return NextResponse.json({ erreur: 'Récompense indisponible' }, { status: 409 })
    if (code === 'P0004') return NextResponse.json({ erreur: 'Récompense épuisée' }, { status: 409 })
    if (code === 'P0005') return NextResponse.json({ erreur: 'Compte fidélité inactif' }, { status: 403 })
    if (code === 'P0006') return NextResponse.json({ erreur: 'Limite d’utilisation atteinte' }, { status: 409 })
    console.error('[API loyalty/me POST]', error)
    return NextResponse.json({ erreur: 'Utilisation de la récompense impossible' }, { status: 500 })
  }
}
