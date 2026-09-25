import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireDeviceOwner } from '@/lib/require-owner'
import { createExpenseSchema, formatZodError } from '@/lib/validation/marchand'
import { withServerTiming } from '@/lib/server-perf'

function mapExpense(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientId: row.client_id as string | null,
    amount: row.amount as number,
    category: row.category as string,
    description: row.description as string | null,
    isVoice: row.is_voice as boolean,
    voiceTranscript: row.voice_transcript as string | null,
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

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const category = searchParams.get('category')

    let query = supabase
      .from('legacy_expenses')
      .select('*')
      .eq('merchant_id', merchantId!)
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString())
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString())
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data: expenses, error: expensesError } = await query
    if (expensesError) throw expensesError

    // MODE-1006 (noImplicitAny) — le client admin est volontairement non
    // typé (DET-008) : les lignes sont castées vers la forme déjà
    // consommée par mapExpense.
    const mapped = ((expenses ?? []) as Record<string, unknown>[]).map(mapExpense)

    const totalExpenses = mapped.reduce((sum, e) => sum + (e.amount ?? 0), 0)

    const categoryBreakdown = mapped.reduce((acc: Record<string, number>, e) => {
      const cat = e.category ?? 'autre'
      acc[cat] = (acc[cat] ?? 0) + (e.amount ?? 0)
      return acc
    }, {})

    return NextResponse.json({
      expenses: mapped,
      totalExpenses,
      count: mapped.length,
      categoryBreakdown,
    })
  } catch (error) {
    console.error('Erreur depenses marchand:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des depenses' }, { status: 500 })
  }
}

// I-04 (TRV-PERF-001) — latence d'écriture de la dépense exposée en
// Server-Timing. Logique métier inchangée.
export async function POST(request: NextRequest): Promise<NextResponse> {
  return withServerTiming('expense', () => postHandler(request))
}

async function postHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erreur: formatZodError(parsed.error) }, { status: 400 })
    }
    const { merchantId, amount, category, description, isVoice, voiceTranscript, clientId } = parsed.data

    const auth = await requireDeviceOwner(request, 'merchant', merchantId)
    if (auth) return auth

    const supabase = createSupabaseAdminClient()

    if (clientId) {
      const { data: existing } = await supabase
        .from('legacy_expenses')
        .select('*')
        .eq('client_id', clientId)
        .single()
      if (existing) {
        return NextResponse.json(mapExpense(existing), { status: 200 })
      }
    }

    const { data: expense, error: expenseError } = await supabase
      .from('legacy_expenses')
      .insert({
        merchant_id: merchantId,
        client_id: clientId || null,
        amount,
        category,
        description: description || null,
        is_voice: isVoice || false,
        voice_transcript: voiceTranscript || null,
      })
      .select()
      .single()
    if (expenseError) throw expenseError

    return NextResponse.json(mapExpense(expense), { status: 201 })
  } catch (error) {
    console.error('Erreur creation depense:', error)
    return NextResponse.json({ erreur: 'Erreur lors de la creation de la depense' }, { status: 500 })
  }
}
