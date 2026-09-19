import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createCreditOpSchema, formatZodError } from '@/lib/validation/marchand'
import { operationUuid } from '@/lib/stock/stock-service'

// MODE-906 (§21-22/§27-28) — grand livre de crédit clients.
//
// POST : résolution du partenaire par partnerClientId (création à la volée
// si inconnu, partnerName requis) puis RPC merchant_record_credit_op —
// verrou FOR UPDATE, idempotence (merchant_id, operation_id), refus
// REPAYMENT_EXCEEDS_DEBT si un remboursement dépassait la dette.
// Repli PGRST202 (migrations non poussées) : INSERT op + UPDATE solde avec
// la MÊME sémantique de refus (relecture du solde avant UPDATE). Table
// absente (42P01) → 503 transitoire : l'opération reste en file offline.
//
// GET : les 50 dernières opérations avec le nom du partenaire, scoppées
// au marchand de la session.

function mapOp(row: Record<string, unknown>, partnerName?: string | null) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    operationId: row.operation_id as string,
    kind: row.kind as string,
    partnerId: row.partner_id as string,
    partnerName: partnerName ?? null,
    saleClientId: (row.sale_client_id ?? null) as string | null,
    amountCfa: row.amount_cfa as number,
    note: (row.note ?? null) as string | null,
    createdAt: row.created_at as string,
  }
}

function isTransientDbError(error: { code?: string } | null | undefined): boolean {
  // 42P01 = relation inexistante (migrations non appliquées) → transitoire :
  // l'entrée en file offline n'est PAS rejetée, elle sera rejouée.
  return error?.code === '42P01'
}

async function readPartner(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  merchantId: string,
  partnerClientId: string,
) {
  const { data } = await supabase
    .from('business_partners')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('client_id', partnerClientId)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

async function readPartnerBalance(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  partnerId: string,
): Promise<number> {
  const { data } = await supabase
    .from('business_partners')
    .select('balance_cfa')
    .eq('id', partnerId)
    .single()
  return (data?.balance_cfa ?? 0) as number
}

function repaymentExceedsDebtResponse(balanceCfa: number) {
  return NextResponse.json(
    {
      erreur: 'Le paiement dépasse la dette du client',
      code: 'REPAYMENT_EXCEEDS_DEBT',
      balanceCfa,
    },
    { status: 422 },
  )
}

/**
 * POST /api/marchand/credit-ops
 * Enregistre une op de crédit ('credit' | 'repayment'). 201 créé, 200 déjà
 * connu (idempotent), 422 refus métier REPAYMENT_EXCEEDS_DEBT, 503
 * transitoire (migrations absentes).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ erreur: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createCreditOpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
  }
  const { merchantId, clientId, kind, partnerClientId, partnerName, saleClientId, amountCfa, note } = parsed.data

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()

  // ── Résolution du partenaire (création à la volée si inconnu).
  let partner = await readPartner(supabase, merchantId, partnerClientId)
  if (!partner) {
    if (!partnerName?.trim()) {
      return NextResponse.json(
        { erreur: 'Client inconnu : le nom du client est obligatoire pour créer sa fiche' },
        { status: 400 },
      )
    }
    const { data: created, error: insertError } = await supabase
      .from('business_partners')
      .insert({
        merchant_id: merchantId,
        client_id: partnerClientId,
        kind: 'client',
        name: partnerName.trim(),
      })
      .select()
      .single()
    if (insertError) {
      if (insertError.code === '23505') {
        // Course concurrente sur client_id (deux envois du même partenaire) :
        // relecture — le partenaire existe désormais.
        partner = await readPartner(supabase, merchantId, partnerClientId)
      } else if (isTransientDbError(insertError)) {
        return NextResponse.json({ erreur: 'Table partenaires non encore migrée' }, { status: 503 })
      } else {
        console.error('[credit-ops] partner insert failed:', insertError.message)
        return NextResponse.json({ erreur: 'Création du client impossible' }, { status: 500 })
      }
    } else {
      partner = created as Record<string, unknown>
    }
  }
  if (!partner) {
    console.error('[credit-ops] partenaire introuvable après création')
    return NextResponse.json({ erreur: 'Client introuvable' }, { status: 500 })
  }

  const operationId = operationUuid(clientId)

  // ── Chemin principal : RPC transactionnelle (verrou FOR UPDATE,
  // idempotence, refus strict).
  const { data: rpcData, error: rpcError } = await supabase.rpc('merchant_record_credit_op', {
    p_merchant_id: merchantId,
    p_operation_id: operationId,
    p_kind: kind,
    p_partner_id: partner.id as string,
    p_sale_client_id: saleClientId ?? null,
    p_amount_cfa: amountCfa,
    p_note: note ?? null,
  })

  if (!rpcError) {
    const result = rpcData as { operation_id?: string; balance_cfa?: number; created?: boolean }
    return NextResponse.json(
      {
        operationId: result.operation_id ?? operationId,
        kind,
        partnerId: partner.id as string,
        balanceCfa: (result.balance_cfa ?? 0) as number,
        created: result.created ?? true,
      },
      { status: result.created ? 201 : 200 },
    )
  }

  // Refus métier de la RPC : un remboursement ne peut jamais dépasser la
  // dette — 422 définitif (l'entrée en file est retirée, conflit rapporté).
  if (rpcError.message === 'REPAYMENT_EXCEEDS_DEBT') {
    let balanceCfa = 0
    try {
      const details = JSON.parse(rpcError.details ?? '{}') as { balance_cfa?: number }
      balanceCfa = Number(details.balance_cfa ?? 0)
    } catch {
      balanceCfa = await readPartnerBalance(supabase, partner.id as string).catch(() => 0)
    }
    return repaymentExceedsDebtResponse(balanceCfa)
  }

  // ── Repli PGRST202 : RPC absente (migrations non appliquées en base).
  // Même sémantique, sans transaction : relecture du solde avant UPDATE.
  if (rpcError.code === 'PGRST202') {
    console.warn('[credit-ops] RPC merchant_record_credit_op indisponible, repli non transactionnel')
    const currentBalance = await readPartnerBalance(supabase, partner.id as string)
    if (kind === 'repayment' && currentBalance - amountCfa < 0) {
      return repaymentExceedsDebtResponse(currentBalance)
    }

    const opRow = {
      merchant_id: merchantId,
      operation_id: operationId,
      kind,
      partner_id: partner.id as string,
      sale_client_id: saleClientId ?? null,
      amount_cfa: amountCfa,
      note: note ?? null,
    }
    const { error: opError } = await supabase.from('merchant_credit_ops').insert(opRow)
    if (opError) {
      if (opError.code === '23505') {
        // Op déjà connue (rejeu) → 200 idempotent, SANS retoucher le solde.
        const { data: existingOp } = await supabase
          .from('merchant_credit_ops')
          .select('*')
          .eq('merchant_id', merchantId)
          .eq('operation_id', operationId)
          .maybeSingle()
        return NextResponse.json(
          {
            operationId,
            kind,
            partnerId: partner.id as string,
            balanceCfa: await readPartnerBalance(supabase, partner.id as string),
            created: false,
            op: existingOp ? mapOp(existingOp as Record<string, unknown>, (partner.name as string) ?? null) : null,
          },
          { status: 200 },
        )
      }
      if (isTransientDbError(opError)) {
        return NextResponse.json({ erreur: 'Grand livre de crédit non encore migré' }, { status: 503 })
      }
      console.error('[credit-ops] repli insert failed:', opError.message)
      return NextResponse.json({ erreur: 'Enregistrement de l\u2019opération de crédit impossible' }, { status: 500 })
    }

    const newBalance = kind === 'credit' ? currentBalance + amountCfa : currentBalance - amountCfa
    const { error: updateError } = await supabase
      .from('business_partners')
      .update({ balance_cfa: newBalance })
      .eq('id', partner.id as string)
    if (updateError) {
      console.error('[credit-ops] repli update solde failed:', updateError.message)
      return NextResponse.json({ erreur: 'Mise à jour du solde impossible' }, { status: 500 })
    }

    return NextResponse.json(
      {
        operationId,
        kind,
        partnerId: partner.id as string,
        balanceCfa: newBalance,
        created: true,
      },
      { status: 201 },
    )
  }

  console.error('[credit-ops] RPC failed:', rpcError.code, rpcError.message)
  return NextResponse.json({ erreur: 'Enregistrement de l\u2019opération de crédit impossible' }, { status: 500 })
}

/**
 * GET /api/marchand/credit-ops?merchantId=…[&limit=…]
 * Les 50 dernières opérations de crédit avec le nom du partenaire.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const merchantId = searchParams.get('merchantId')

  const auth = await requireDeviceOwner(request, 'merchant', merchantId)
  if (auth) return auth

  const supabase = createSupabaseAdminClient()
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200)

  const { data: ops, error } = await supabase
    .from('merchant_credit_ops')
    .select('*')
    .eq('merchant_id', merchantId!)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isTransientDbError(error)) {
      return NextResponse.json({ erreur: 'Grand livre de crédit non encore migré' }, { status: 503 })
    }
    console.error('[credit-ops] GET failed:', error.message)
    return NextResponse.json({ erreur: 'Lecture des opérations de crédit impossible' }, { status: 500 })
  }

  // Noms des partenaires (2 requêtes simples — jamais de jointure implicite).
  const partnerIds = [...new Set((ops ?? []).map((o) => o.partner_id as string))]
  const names = new Map<string, string>()
  if (partnerIds.length > 0) {
    const { data: partners } = await supabase
      .from('business_partners')
      .select('id, name')
      .in('id', partnerIds)
    for (const p of partners ?? []) {
      names.set(p.id as string, p.name as string)
    }
  }

  return NextResponse.json({
    ops: (ops ?? []).map((row: Record<string, unknown>) => mapOp(row, names.get(row.partner_id as string))),
  })
}
