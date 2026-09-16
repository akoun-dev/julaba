import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createNotification } from '@/lib/notifications'
import { keiwaOperationSchema, formatZodError } from '@/lib/validation/marchand'
import { formatFCFA } from '@/lib/voice/localIntent'

function mapWallet(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    balance: row.balance as number,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
  }
}

function mapTransaction(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    type: row.type as string,
    amount: row.amount as number,
    balanceAfter: row.balance_after as number,
    recipientName: row.recipient_name as string | null,
    recipientPhone: row.recipient_phone as string | null,
    note: row.note as string | null,
    clientId: row.client_id as string | null,
    createdAt: row.created_at as string,
  }
}

async function getOrCreateWallet(supabase: ReturnType<typeof createSupabaseAdminClient>, merchantId: string) {
  const { data: existing } = await supabase
    .from('legacy_keiwa_wallets')
    .select('*')
    .eq('merchant_id', merchantId)
    .single()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('legacy_keiwa_wallets')
    .insert({ merchant_id: merchantId })
    .select()
    .single()
  if (error) throw error
  return created
}

/**
 * GET /api/marchand/keiwa?merchantId= — wallet + 30 most recent
 * transactions. The wallet row is created lazily on first access so the
 * screen can render a 0 FCFA balance instead of a "not activated" state.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()
    const wallet = await getOrCreateWallet(supabase, merchantId!)

    const { data: transactions, error } = await supabase
      .from('legacy_keiwa_transactions')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error

    return NextResponse.json({
      wallet: mapWallet(wallet),
      transactions: (transactions ?? []).map(mapTransaction),
    })
  } catch (error) {
    console.error('[API marchand/keiwa GET]', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du portefeuille' }, { status: 500 })
  }
}

/**
 * POST /api/marchand/keiwa — depot | retrait | transfert.
 *
 * The balance mutation itself runs inside the transactional SQL function
 * legacy_keiwa_apply_operation (row lock → no double-spend, no lost
 * update; idempotent on clientId for offline-queue replays). Keiwa is
 * deliberately NOT queueable offline: the balance is authoritative
 * server-side and a local optimistic balance could drift from reality.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = keiwaOperationSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, type, amount, recipientName, recipientPhone, note, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    if (type === 'transfert' && (!recipientName || !recipientPhone)) {
      return NextResponse.json(
        { erreur: 'Le nom et le téléphone du destinataire sont obligatoires pour un transfert' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase.rpc('legacy_keiwa_apply_operation', {
      p_merchant_id: merchantId,
      p_type: type,
      p_amount: amount,
      p_recipient_name: recipientName || null,
      p_recipient_phone: recipientPhone || null,
      p_note: note || null,
      p_client_id: clientId || null,
    })
    if (error) {
      // The SQL function raises 'SOLDE_INSUFFISANT' — surface it as a
      // client-correctable 400, not a 500.
      if (typeof error.message === 'string' && error.message.includes('SOLDE_INSUFFISANT')) {
        return NextResponse.json({ erreur: 'Solde insuffisant' }, { status: 400 })
      }
      throw error
    }

    const result = data as { replayed: boolean; transaction: Record<string, unknown>; balance: number }

    if (!result.replayed) {
      const detail = type === 'transfert' && recipientName ? ` vers ${recipientName}` : ''
      await createNotification({
        subjectType: 'merchant',
        subjectId: merchantId,
        type: 'keiwa_transaction',
        title: type === 'depot' ? 'Dépôt confirmé' : type === 'retrait' ? 'Retrait confirmé' : 'Transfert confirmé',
        body: `${type === 'depot' ? 'Dépôt' : type === 'retrait' ? 'Retrait' : 'Transfert'} de ${formatFCFA(amount)}${detail} enregistré. Nouveau solde : ${formatFCFA(result.balance)}.`,
        data: { type, amount },
      })
    }

    return NextResponse.json(
      { wallet: { balance: result.balance }, transaction: mapTransaction(result.transaction) },
      { status: result.replayed ? 200 : 201 }
    )
  } catch (error) {
    console.error('[API marchand/keiwa POST]', error)
    return NextResponse.json({ erreur: 'Erreur lors de la transaction' }, { status: 500 })
  }
}
