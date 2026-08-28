import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [accounts, aggregate, todayStart] = await Promise.all([
      db.boKeiwaAccount.findMany({
        orderBy: { createdAt: 'desc' },
        where: { isActive: true },
      }),
      db.boKeiwaAccount.aggregate({
        _sum: { balance: true, transactionCount: true },
        _count: { id: true },
      }),
      Promise.resolve(new Date(new Date().setHours(0, 0, 0, 0))),
    ])

    const recentTransactions = await db.boKeiwaTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Today's stats
    const todayTransactions = await db.boKeiwaTransaction.findMany({
      where: { createdAt: { gte: todayStart } },
    })
    const todayCount = todayTransactions.length
    const todayVolume = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    const activeAccounts = await db.boKeiwaAccount.count({ where: { isActive: true } })

    // Daily volume for last 7 days (from DB transactions)
    const now = new Date()
    const dailyVolume = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const dayStart = new Date(now)
        dayStart.setDate(dayStart.getDate() - (6 - i))
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        return db.boKeiwaTransaction
          .findMany({
            where: { createdAt: { gte: dayStart, lt: dayEnd } },
            select: { amount: true },
          })
          .then((txs) => {
            const volume = txs.reduce((s, t) => s + t.amount, 0)
            const dayLabel = dayStart.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
            return { day: dayLabel, volume }
          })
      })
    )

    // Resolve zone for each account from BoActor via phone number
    const holderPhones = accounts.map((a) => a.holderPhone.replace(/\s/g, ''))
    const actorByPhone: Record<string, string> = {}
    if (holderPhones.length > 0) {
      // Find actors matching holder phones
      const actors = await db.boActor.findMany({
        where: {
          phone: { in: holderPhones.map((p) => p.replace(/\s/g, '')) },
        },
        select: { phone: true, zone: true },
      })
      for (const actor of actors) {
        const cleanPhone = actor.phone.replace(/\s/g, '')
        actorByPhone[cleanPhone] = actor.zone
      }
    }

    // Map accounts to frontend format — zone comes from DB, not hard-coded
    const mappedAccounts = accounts.map((acc) => {
      const cleanPhone = acc.holderPhone.replace(/\s/g, '')
      const actorZone = actorByPhone[cleanPhone]
      return {
        holder: acc.holderName,
        solde: acc.balance,
        lastTx: acc.updatedAt.toISOString(),
        type: 'marchand' as const,
        zone: acc.zone || actorZone || '',
      }
    })

    // Map transactions to frontend format
    const mappedTransactions = recentTransactions.map((tx) => ({
      id: tx.id.slice(0, 8).toUpperCase(),
      type: tx.type as 'depot' | 'retrait' | 'transfert',
      montant: tx.amount,
      expediteur: tx.senderName || 'N/A',
      destinataire: tx.recipientName || 'N/A',
      date: tx.createdAt.toISOString(),
      status: tx.status as 'termine' | 'en_cours' | 'echoue' | 'annule',
    }))

    return NextResponse.json({
      accounts: mappedAccounts,
      transactions: mappedTransactions,
      totalBalance: aggregate._sum.balance || 0,
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
