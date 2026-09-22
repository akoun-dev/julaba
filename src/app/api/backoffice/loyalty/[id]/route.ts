import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { logAudit, requireBackofficePermission } from '@/lib/backoffice-auth'

const entitySchema = z.enum(['rule', 'reward', 'level'])
const roleSchema = z.enum(['all', 'marchand', 'producteur', 'grossiste', 'semi_grossiste', 'cooperateur', 'cooperative'])
const patchSchema = z.object({
  entity: entitySchema,
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  points: z.number().int().positive().optional(),
  actionType: z.enum(['sale', 'purchase', 'order_completed', 'harvest', 'cooperative_activity', 'payment', 'activity', 'manual_bonus']).optional(),
  period: z.enum(['transaction', 'day', 'week', 'month', 'program']).optional(),
  limitCount: z.number().int().positive().nullable().optional(),
  pointsPer: z.number().int().positive().nullable().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  targetRoles: z.array(roleSchema).min(1).optional(),
  thresholdPoints: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  benefits: z.array(z.unknown()).optional(),
  costPoints: z.number().int().positive().optional(),
  valueCfa: z.number().int().nonnegative().nullable().optional(),
  stockAvailable: z.number().int().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBackofficePermission(request, 'loyalty', 'update')
  if (auth instanceof NextResponse) return auth
  try {
    const id = (await context.params).id
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ erreur: 'Modification fidélité invalide' }, { status: 422 })
    const { entity, ...input } = parsed.data
    const table = entity === 'rule' ? 'loyalty_rules' : entity === 'reward' ? 'loyalty_rewards' : 'loyalty_levels'
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.description !== undefined) updates.description = input.description
    if (input.status !== undefined) updates.status = input.status
    if (entity === 'rule') {
      if (input.points !== undefined) updates.points = input.points
      if (input.actionType !== undefined) updates.action_type = input.actionType
      if (input.period !== undefined) updates.period = input.period
      if (input.limitCount !== undefined) updates.limit_count = input.limitCount
      if (input.pointsPer !== undefined) updates.points_per = input.pointsPer
      if (input.condition !== undefined) updates.condition = input.condition
      if (input.targetRoles !== undefined) updates.target_roles = input.targetRoles
    }
    if (input.startsAt !== undefined) updates.starts_at = input.startsAt
    if (input.endsAt !== undefined) updates.ends_at = input.endsAt
    if (entity === 'level') {
      if (input.thresholdPoints !== undefined) updates.threshold_points = input.thresholdPoints
      if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
      if (input.benefits !== undefined) updates.benefits = input.benefits
    }
    if (entity === 'reward') {
      if (input.costPoints !== undefined) updates.cost_points = input.costPoints
      if (input.valueCfa !== undefined) updates.value_cfa = input.valueCfa
      if (input.stockAvailable !== undefined) updates.stock_available = input.stockAvailable
      if (input.usageLimit !== undefined) updates.usage_limit = input.usageLimit
      if (input.metadata !== undefined) updates.metadata = input.metadata
    }
    if (!Object.keys(updates).length) return NextResponse.json({ erreur: 'Aucune modification fournie' }, { status: 422 })
    const supabase = createSupabaseAdminClient()
    const result = await supabase.from(table).update(updates).eq('id', id).select().single()
    if (result.error) throw result.error
    await logAudit({ userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email, action: `loyalty.${entity}.update`, module: 'loyalty', details: JSON.stringify({ id, fields: Object.keys(updates) }), request })
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[API backoffice/loyalty PATCH]', error)
    return NextResponse.json({ erreur: 'Modification fidélité impossible' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBackofficePermission(request, 'loyalty', 'delete')
  if (auth instanceof NextResponse) return auth
  try {
    const id = (await context.params).id
    const entity = entitySchema.safeParse(new URL(request.url).searchParams.get('entity'))
    if (!entity.success) return NextResponse.json({ erreur: 'Type d’entité requis' }, { status: 422 })
    const table = entity.data === 'rule' ? 'loyalty_rules' : entity.data === 'reward' ? 'loyalty_rewards' : 'loyalty_levels'
    const supabase = createSupabaseAdminClient()
    const result = await supabase.from(table).update({ status: 'archived' }).eq('id', id).select('id, status').single()
    if (result.error) throw result.error
    await logAudit({ userId: auth.user.id, userName: auth.user.name, userEmail: auth.user.email, action: `loyalty.${entity.data}.archive`, module: 'loyalty', details: JSON.stringify({ id }), request })
    return NextResponse.json({ ...result.data, archived: true })
  } catch (error) {
    console.error('[API backoffice/loyalty DELETE]', error)
    return NextResponse.json({ erreur: 'Archivage fidélité impossible' }, { status: 400 })
  }
}
