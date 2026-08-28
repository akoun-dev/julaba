import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [
      totalActors,
      activeActors,
      suspendedActors,
      totalEnrolments,
      pendingEnrolments,
      totalZones,
      totalMissions,
      activeMissions,
      actorsByZone,
    ] = await Promise.all([
      db.boActor.count(),
      db.boActor.count({ where: { status: 'actif' } }),
      db.boActor.count({ where: { status: 'suspendu' } }),
      db.boEnrolment.count(),
      db.boEnrolment.count({ where: { status: 'en_attente' } }),
      db.boZone.count(),
      db.boMission.count(),
      db.boMission.count({ where: { status: 'en_cours' } }),
      db.boZone.findMany({ select: { name: true, region: true, actorCount: true } }),
    ])

    // Aggregate actors by region
    const regionMap: Record<string, number> = {}
    for (const z of actorsByZone) {
      regionMap[z.region] = (regionMap[z.region] || 0) + z.actorCount
    }
    const actorCountsByRegion = Object.entries(regionMap).map(([name, count]) => ({ name, count }))

    // Daily enrolment trend (last 7 days)
    const now = new Date()
    const dailyEnrolmentTrend = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date(now)
        day.setDate(day.getDate() - (6 - i))
        day.setHours(0, 0, 0, 0)
        const nextDay = new Date(day)
        nextDay.setDate(nextDay.getDate() + 1)
        return db.boEnrolment.count({
          where: { createdAt: { gte: day, lt: nextDay } },
        }).then((count) => ({
          day: day.toISOString().split('T')[0],
          count,
        }))
      })
    )

    // Top identificateurs (grouped by identificateurName with zone)
    const topIdents = await db.boActor.groupBy({
      by: ['identificateurName', 'zone'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
      where: { identificateurName: { not: null } },
    })
    
    // Aggregate by identificateur name (some have multiple zones)
    const identMap: Record<string, { name: string; zone: string; count: number }> = {}
    for (const t of topIdents) {
      if (t.identificateurName) {
        if (!identMap[t.identificateurName]) {
          identMap[t.identificateurName] = { name: t.identificateurName, zone: t.zone || '', count: 0 }
        }
        identMap[t.identificateurName].count += t._count.id
      }
    }
    const topIdentificateurs = Object.values(identMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Data quality (computed from actors)
    const [totalWithPhoto, totalWithGps, totalWithPhone] = await Promise.all([
      db.boActor.count({ where: { photoUrl: { not: null } } }),
      db.boActor.count({ where: { gpsLat: { not: null }, gpsLng: { not: null } } }),
      db.boActor.count({ where: { phone: { not: '' } } }),
    ])
    const dataQuality = {
      photos: totalActors > 0 ? Math.round((totalWithPhoto / totalActors) * 100) : 0,
      gps: totalActors > 0 ? Math.round((totalWithGps / totalActors) * 100) : 0,
      phones: totalActors > 0 ? Math.round((totalWithPhone / totalActors) * 100) : 0,
    }

    // System health from DB config
    let systemHealth: Array<{ name: string; status: string; latency: number }> = []
    try {
      const healthConfig = await db.boPlatformConfig.findUnique({ where: { category: 'system_health' } })
      if (healthConfig) {
        const parsed = JSON.parse(healthConfig.config)
        systemHealth = Array.isArray(parsed) ? parsed : []
      }
    } catch {
      // If config is missing or invalid, systemHealth stays empty
    }

    // National target from DB config
    let nationalTarget = 15000
    try {
      const targetConfig = await db.boPlatformConfig.findUnique({ where: { category: 'national_target' } })
      if (targetConfig) {
        const parsed = JSON.parse(targetConfig.config)
        nationalTarget = parsed.enrolmentTarget || 15000
      }
    } catch {
      // Default target stays
    }

    const unacknowledgedAlerts = await db.boAlert.count({ where: { acknowledged: false } })

    return NextResponse.json({
      totalActors,
      activeActors,
      suspendedActors,
      totalEnrolments,
      pendingEnrolments,
      totalZones,
      totalMissions,
      activeMissions,
      actorCountsByRegion,
      dailyEnrolmentTrend,
      topIdentificateurs,
      dataQuality,
      systemHealth,
      nationalTarget,
      unacknowledgedAlerts,
    })
  } catch (error) {
    console.error('Erreur dashboard:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du tableau de bord' }, { status: 500 })
  }
}
