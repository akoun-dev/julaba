import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications'
import { createTontineSchema, formatZodError } from '@/lib/validation/marchand'

function mapTontine(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    amount: row.amount as number,
    frequency: row.frequency as string,
    memberCount: row.member_count as number,
    nextDueDate: row.next_due_date as string | null,
  }
}

/**
 * POST /api/marchand/tontines/create — a marchand creates their own tontine.
 *
 * Deliberately a separate route from POST /api/marchand/tontines (which
 * records a cotisation): the two actions share nothing but the table names,
 * and a split keeps each handler's validation/error story readable.
 *
 * The creator is inserted as the first member. Idempotent on clientId
 * (unique on legacy_tontines) so an offline-queued create replayed twice
 * returns the same tontine instead of duplicating it.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = createTontineSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, name, amount, frequency, memberCount, nextDueDate, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_tontines')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        return NextResponse.json({ tontine: mapTontine(existing) }, { status: 200 })
      }
    }

    const { data: tontine, error: tontineError } = await supabase
      .from('legacy_tontines')
      .insert({
        name,
        amount,
        frequency,
        member_count: memberCount,
        next_due_date: nextDueDate || null,
        client_id: clientId || null,
      })
      .select()
      .single()
    if (tontineError) throw tontineError

    const { error: memberError } = await supabase
      .from('legacy_tontine_members')
      .insert({ tontine_id: tontine.id, merchant_id: merchantId })
    if (memberError) throw memberError

    await createNotification({
      subjectType: 'merchant',
      subjectId: merchantId,
      type: 'tontine_creation',
      title: 'Tontine créée',
      body: `Votre tontine "${name}" a été créée. Vous pouvez maintenant cotiser.`,
      data: { tontineId: tontine.id },
    })

    return NextResponse.json({ tontine: mapTontine(tontine) }, { status: 201 })
  } catch (error) {
    console.error('[API marchand/tontines/create POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
