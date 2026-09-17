import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications/server'
import { formatFCFA } from '@/lib/voice/localIntent'

function mapTontine(row: any) {
  return {
    id: row.id as string,
    name: row.name as string,
    amount: row.amount as number,
    frequency: row.frequency as string,
    memberCount: row.member_count as number,
    nextDueDate: row.next_due_date as string | null,
  }
}

function mapContribution(row: any) {
  return {
    id: row.id as string,
    tontineId: row.tontine_id as string,
    merchantId: row.merchant_id as string,
    amount: row.amount as number,
    clientId: row.client_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    const { data: memberships, error: membershipsError } = await supabase
      .from('legacy_tontine_members')
      .select('*, tontine:legacy_tontines(*)')
      .eq('merchant_id', merchantId!)
    if (membershipsError) throw membershipsError

    const tontines = await Promise.all(
      (memberships ?? []).map(async (m: any) => {
        const { data: contributions } = await supabase
          .from('legacy_tontine_contributions')
          .select('amount')
          .eq('tontine_id', m.tontine_id)
          .eq('merchant_id', merchantId!)

        const totalCotiseFcfa = (contributions ?? []).reduce(
          (sum: number, c: any) => sum + (c.amount ?? 0),
          0,
        )

        const tontine = m.tontine
        return {
          ...mapTontine(tontine),
          totalCotiseFcfa,
        }
      }),
    )

    return NextResponse.json({ tontines })
  } catch (error) {
    console.error('[API marchand/tontines GET]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { merchantId, tontineId, amount, clientId } = body

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    if (!tontineId || !amount || amount <= 0) {
      return NextResponse.json({ erreur: 'tontineId et montant sont obligatoires' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_tontine_contributions')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        return NextResponse.json(mapContribution(existing), { status: 200 })
      }
    }

    const { data: membership, error: membershipError } = await supabase
      .from('legacy_tontine_members')
      .select('*, tontine:legacy_tontines(*)')
      .eq('tontine_id', tontineId)
      .eq('merchant_id', merchantId)
      .single()
    if (membershipError || !membership) {
      return NextResponse.json({ erreur: "Vous n'êtes pas membre de cette tontine" }, { status: 403 })
    }

    const { data: contribution, error: contributionError } = await supabase
      .from('legacy_tontine_contributions')
      .insert({
        tontine_id: tontineId,
        merchant_id: merchantId,
        amount,
        client_id: clientId || null,
      })
      .select()
      .single()
    if (contributionError) throw contributionError

    const tontineName = (membership as any).tontine?.name ?? ''

    await createNotification({
      subjectType: 'merchant',
      subjectId: merchantId,
      type: 'tontine_cotisation',
      title: 'Cotisation confirmée',
      body: `Votre cotisation de ${formatFCFA(amount)} pour "${tontineName}" a été enregistrée.`,
      data: { tontineId },
    })

    return NextResponse.json(mapContribution(contribution), { status: 201 })
  } catch (error) {
    console.error('[API marchand/tontines POST]', error)
    return NextResponse.json({ erreur: 'Erreur serveur' }, { status: 500 })
  }
}
