import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// Read-only backoffice visibility into the Tontine/TontineMember/
// TontineContribution feature — until now this had no admin-facing screen
// or API route at all, despite being a real, working money-tracking
// feature for marchands (see src/components/marchand/secondary-screens.tsx).
export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'tontines', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()

    const [tontinesResult, contributionsResult] = await Promise.all([
      supabase
        .from('legacy_tontines')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('legacy_tontine_contributions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (tontinesResult.error) throw tontinesResult.error
    if (contributionsResult.error) throw contributionsResult.error

    const tontines = tontinesResult.data ?? []
    const contributions = contributionsResult.data ?? []

    const tontineIds = tontines.map((t) => t.id)

    const membersResult = tontineIds.length > 0
      ? await supabase
          .from('legacy_tontine_members')
          .select('*')
          .in('tontine_id', tontineIds)
      : { data: [], error: null }

    if (membersResult.error) throw membersResult.error
    const members = membersResult.data ?? []

    const merchantIds = [...new Set(members.map((m) => m.merchant_id).filter(Boolean))]
    const merchants = merchantIds.length > 0
      ? await supabase
          .from('merchants')
          .select('id, first_name, phone')
          .in('id', merchantIds)
      : { data: [], error: null }

    if (merchants.error) throw merchants.error
    const merchantById = Object.fromEntries((merchants.data ?? []).map((m) => [m.id, m]))

    const membersByTontine = new Map<string, typeof members>()
    for (const m of members) {
      const list = membersByTontine.get(m.tontine_id) ?? []
      list.push(m)
      membersByTontine.set(m.tontine_id, list)
    }

    const merchantIdsFromContributions = [...new Set(contributions.map((c) => c.merchant_id))]
    const merchantsFromContributions = merchantIdsFromContributions.length > 0
      ? await supabase
          .from('merchants')
          .select('id, first_name, phone')
          .in('id', merchantIdsFromContributions)
      : { data: [], error: null }

    if (merchantsFromContributions.error) throw merchantsFromContributions.error
    const merchantByContribId = Object.fromEntries((merchantsFromContributions.data ?? []).map((m) => [m.id, m]))

    const totalsByTontine = contributions.reduce((acc: Record<string, number>, c) => {
      acc[c.tontine_id] = (acc[c.tontine_id] ?? 0) + c.amount
      return acc
    }, {})

    return NextResponse.json({
      tontines: tontines.map((t) => ({
        id: t.id,
        name: t.name,
        amount: t.amount,
        frequency: t.frequency,
        memberCount: t.member_count,
        nextDueDate: t.next_due_date,
        createdAt: t.created_at,
        members: (membersByTontine.get(t.id) ?? []).map((m) => ({
          id: m.id,
          joinedAt: m.joined_at,
          merchant: m.merchant_id ? (merchantById[m.merchant_id] ?? null) : null,
        })),
        totalCotiseFcfa: totalsByTontine[t.id] ?? 0,
      })),
      contributions: contributions.map((c) => ({
        id: c.id,
        tontineId: c.tontine_id,
        merchantId: c.merchant_id,
        amount: c.amount,
        createdAt: c.created_at,
        merchant: merchantByContribId[c.merchant_id] ?? null,
      })),
    })
  } catch (error) {
    console.error('[API backoffice/tontines GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des tontines' }, { status: 500 })
  }
}
