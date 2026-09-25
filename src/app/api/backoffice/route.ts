import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireBackofficePermission } from '@/lib/backoffice-auth'

type ActorDashRow = {
  id: string
  status: string | null
  zone: string | null
  identificateur_name: string | null
  photo_url: string | null
  gps_lat: number | null
  gps_lng: number | null
  phone: string | null
  created_at: string | null
}

type EnrolmentDashRow = { id: string; status: string | null; zone: string | null; created_at: string | null }

type ZoneDashRow = { name: string; region: string; actor_count: number | null }

type MissionDashRow = { id: string; status: string | null }

export async function GET(request: NextRequest) {
  const auth = await requireBackofficePermission(request, 'dashboard', 'read')
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createSupabaseAdminClient()

    const [
      actorsRes,
      enrolmentsRes,
      zonesRes,
      missionsRes,
    ] = await Promise.all([
      supabase.from('legacy_bo_actors').select('id, status, zone, identificateur_name, photo_url, gps_lat, gps_lng, phone, created_at'),
      supabase.from('legacy_bo_enrolments').select('id, status, zone, created_at'),
      supabase.from('legacy_bo_zones').select('name, region, actor_count'),
      supabase.from('legacy_bo_missions').select('id, status'),
    ])

    const actors = (actorsRes.data || []) as ActorDashRow[]
    const enrolments = (enrolmentsRes.data || []) as EnrolmentDashRow[]
    const zonesData = (zonesRes.data || []) as ZoneDashRow[]
    const missions = (missionsRes.data || []) as MissionDashRow[]

    const totalActors = actors.length
    const activeActors = actors.filter((a) => a.status === 'actif').length
    const suspendedActors = actors.filter((a) => a.status === 'suspendu').length
    const totalEnrolments = enrolments.length
    const pendingEnrolments = enrolments.filter((e) => e.status === 'en_attente').length
    const totalZones = zonesData.length
    const totalMissions = missions.length
    const activeMissions = missions.filter((m) => m.status === 'en_cours').length

    const actorsByZone = zonesData.map((z) => ({ name: z.name, region: z.region, actorCount: z.actor_count || 0 }))

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
        return supabase
          .from('legacy_bo_enrolments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', day.toISOString())
          .lt('created_at', nextDay.toISOString())
          .then(({ count }: { count: number | null }) => ({
            day: day.toISOString().split('T')[0],
            count: count || 0,
          }))
      })
    )

    // Top identificateurs (grouped by identificateur_name with zone)
    const { data: identActors } = await supabase
      .from('legacy_bo_actors')
      .select('identificateur_name, zone')
      .not('identificateur_name', 'is', null)

    const identMap: Record<string, { name: string; zone: string; count: number }> = {}
    for (const t of identActors || []) {
      if (t.identificateur_name) {
        if (!identMap[t.identificateur_name]) {
          identMap[t.identificateur_name] = { name: t.identificateur_name, zone: t.zone || '', count: 0 }
        }
        identMap[t.identificateur_name].count += 1
      }
    }
    const topIdentificateurs = Object.values(identMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Data quality (computed from actors)
    const totalWithPhoto = actors.filter((a) => a.photo_url != null).length
    const totalWithGps = actors.filter((a) => a.gps_lat != null && a.gps_lng != null).length
    const totalWithPhone = actors.filter((a) => a.phone !== '').length
    const dataQuality = {
      photos: totalActors > 0 ? Math.round((totalWithPhoto / totalActors) * 100) : 0,
      gps: totalActors > 0 ? Math.round((totalWithGps / totalActors) * 100) : 0,
      phones: totalActors > 0 ? Math.round((totalWithPhone / totalActors) * 100) : 0,
    }

    // System health from DB config
    let systemHealth: Array<{ name: string; status: string; latency: number }> = []
    try {
      const { data: healthConfig } = await supabase
        .from('legacy_bo_platform_configs')
        .select('config')
        .eq('category', 'system_health')
        .single()
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
      const { data: targetConfig } = await supabase
        .from('legacy_bo_platform_configs')
        .select('config')
        .eq('category', 'national_target')
        .single()
      if (targetConfig) {
        const parsed = JSON.parse(targetConfig.config)
        nationalTarget = parsed.enrolmentTarget || 15000
      }
    } catch {
      // Default target stays
    }

    const { count: unacknowledgedAlerts } = await supabase
      .from('legacy_bo_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('acknowledged', false)

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
      unacknowledgedAlerts: unacknowledgedAlerts || 0,
    })
  } catch (error) {
    console.error('Erreur dashboard:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du tableau de bord' }, { status: 500 })
  }
}
