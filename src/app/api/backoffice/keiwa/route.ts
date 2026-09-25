import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

// DET-004 (MODE-980) — types de ligne minimaux : seules les colonnes
// réellement consommées par ce GET sont déclarées (le select('*') reste
// volontairement large, le typage lui est borné et honnête).
interface KeiwaAccountRow {
  holder_name: string | null
  holder_phone: string | null
  balance: number | null
  transaction_count: number | null
  zone: string | null
  updated_at: string | null
}
interface KeiwaTxRow {
  id: string
  type: string
  amount: number | null
  sender_name: string | null
  recipient_name: string | null
  created_at: string
  status: string
}

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'keiwa', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0))

    const [accountsResult, transactionsResult, todayTransactionsResult, activeAccountsResult] =
      await Promise.all([
        supabase
          .from('legacy_bo_keiwa_accounts')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('legacy_bo_keiwa_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('legacy_bo_keiwa_transactions')
          .select('*')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('legacy_bo_keiwa_accounts')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true),
      ])

    if (accountsResult.error) throw accountsResult.error
    if (transactionsResult.error) throw transactionsResult.error
    if (todayTransactionsResult.error) throw todayTransactionsResult.error
    if (activeAccountsResult.error) throw activeAccountsResult.error

    // MODE-1006 (noImplicitAny) — le client admin est volontairement non
    // typé (DET-008) : les lignes sont castées vers les types de ligne
    // minimaux déclarés en tête de fichier (précédent DET-004/MODE-980).
    const accounts = (accountsResult.data || []) as KeiwaAccountRow[]
    const recentTransactions = (transactionsResult.data || []) as KeiwaTxRow[]
    const todayTransactions = (todayTransactionsResult.data || []) as KeiwaTxRow[]

    // Compute aggregate in JS
    let totalBalance = 0
    let totalTransactionCount = 0
    for (const acc of accounts) {
      totalBalance += acc.balance || 0
      totalTransactionCount += acc.transaction_count || 0
    }

    // Today's stats
    const todayCount = todayTransactions.length
    const todayVolume = todayTransactions.reduce((sum: number, tx: KeiwaTxRow) => sum + (tx.amount || 0), 0)
    const activeAccounts = activeAccountsResult.count || 0

    // Daily volume for last 7 days
    const now = new Date()
    const dailyVolume = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const dayStart = new Date(now)
        dayStart.setDate(dayStart.getDate() - (6 - i))
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        return supabase
          .from('legacy_bo_keiwa_transactions')
          .select('amount')
          .gte('created_at', dayStart.toISOString())
          .lt('created_at', dayEnd.toISOString())
          .then(({ data }: { data: { amount: number | null }[] | null }) => {
            const volume = (data || []).reduce((s: number, t: { amount: number | null }) => s + (t.amount || 0), 0)
            const dayLabel = dayStart.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
            return { day: dayLabel, volume }
          })
      })
    )

    // Resolve zone for each account from BoActor via phone number
    const holderPhones = accounts.map((a: KeiwaAccountRow) => (a.holder_phone || '').replace(/\s/g, ''))
    const actorByPhone: Record<string, string> = {}
    if (holderPhones.length > 0) {
      const { data: actors } = await supabase
        .from('legacy_bo_actors')
        .select('phone, zone')
        .in('phone', holderPhones.map((p) => p.replace(/\s/g, '')))

      for (const actor of actors || []) {
        const cleanPhone = (actor.phone || '').replace(/\s/g, '')
        actorByPhone[cleanPhone] = actor.zone
      }
    }

    // Map accounts to frontend format
    const mappedAccounts = accounts.map((acc: KeiwaAccountRow) => {
      const cleanPhone = (acc.holder_phone || '').replace(/\s/g, '')
      const actorZone = actorByPhone[cleanPhone]
      return {
        holder: acc.holder_name,
        solde: acc.balance,
        lastTx: acc.updated_at,
        type: 'marchand' as const,
        zone: acc.zone || actorZone || '',
      }
    })

    // Map transactions to frontend format
    const mappedTransactions = recentTransactions.map((tx: KeiwaTxRow) => ({
      id: tx.id,
      type: tx.type as 'depot' | 'retrait' | 'transfert',
      montant: tx.amount,
      expediteur: tx.sender_name || 'N/A',
      destinataire: tx.recipient_name || 'N/A',
      date: tx.created_at,
      status: tx.status as 'termine' | 'en_cours' | 'echoue' | 'annule',
    }))

    return NextResponse.json({
      accounts: mappedAccounts,
      transactions: mappedTransactions,
      totalBalance,
      todayCount,
      todayVolume,
      activeAccounts,
      dailyVolume,
    })
  } catch (error) {
    console.error('Erreur keiwa:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des donnees Keiwa' }, { status: 500 })
  }
}
