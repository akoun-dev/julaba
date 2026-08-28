import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const totalActors = await db.boActor.count()
    const activeActors = await db.boActor.count({ where: { status: 'actif' } })

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [actorsThisMonth, actorsThisWeek, actorsToday, lastWeekActors] = await Promise.all([
      db.boActor.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      db.boActor.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      db.boActor.count({ where: { createdAt: { gte: todayStart } } }),
      db.boActor.count({ where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    ])

    const dau = actorsToday
    const mau = actorsThisMonth
    const wau = actorsThisWeek

    // Compute featureUsage from audit logs grouped by module (last 30 days)
    const auditByModule = await db.auditLog.groupBy({
      by: ['module'],
      _count: { id: true },
      where: { createdAt: { gte: thirtyDaysAgo } },
    })

    // Also get last week's audit counts for trend calculation
    const auditByModuleLastWeek = await db.auditLog.groupBy({
      by: ['module'],
      _count: { id: true },
      where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    })

    const lastWeekMap: Record<string, number> = {}
    for (const item of auditByModuleLastWeek) {
      lastWeekMap[item.module] = item._count.id
    }

    const totalAuditThisPeriod = auditByModule.reduce((sum, a) => sum + a._count.id, 0)
    const totalAuditLastWeek = auditByModuleLastWeek.reduce((sum, a) => sum + a._count.id, 0)

    // Map module names to friendly display names
    const MODULE_DISPLAY: Record<string, string> = {
      authentification: 'Identification',
      acteurs: 'Acteurs',
      zones: 'Zones',
      missions: 'Missions',
      parametres: 'Paramètres',
      enrolment: 'Enrôlement',
      'enrôlement': 'Enrôlement',
      rapport: 'Rapports',
      audit: 'Audit',
      paiement: 'Keiwa Wallet',
      communication: 'Communication',
      tontine: 'Tontine',
      caisse: 'Caisse',
    }

    const featureUsage: Record<string, { name: string; usage: number; trend: number }> = {}

    for (const item of auditByModule) {
      const displayName = MODULE_DISPLAY[item.module] || item.module.charAt(0).toUpperCase() + item.module.slice(1)
      const usage = totalAuditThisPeriod > 0 ? Math.round((item._count.id / totalAuditThisPeriod) * 100) : 0
      const lastWeekCount = lastWeekMap[item.module] || 0
      // Trend: percentage change vs last week
      const trend = lastWeekCount > 0 ? Math.round(((item._count.id - lastWeekCount) / lastWeekCount) * 100) : (item._count.id > 0 ? 100 : 0)
      featureUsage[item.module] = { name: displayName, usage, trend }
    }

    // If no audit data, featureUsage will be empty (honest empty state)

    const retentionFunnel = [
      { stage: 'Inscrits', count: totalActors, rate: 100 },
      { stage: 'Actifs (30j)', count: actorsThisMonth, rate: totalActors > 0 ? Math.round((actorsThisMonth / totalActors) * 100) : 0 },
      { stage: 'Actifs (7j)', count: actorsThisWeek, rate: totalActors > 0 ? Math.round((actorsThisWeek / totalActors) * 100) : 0 },
      { stage: 'Actifs (aujourd\'hui)', count: dau, rate: totalActors > 0 ? Math.round((dau / totalActors) * 100) : 0 },
    ]

    return NextResponse.json({ dau, mau, wau, featureUsage, retentionFunnel })
  } catch (error) {
    console.error('Erreur analytics:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des analyses' }, { status: 500 })
  }
}
