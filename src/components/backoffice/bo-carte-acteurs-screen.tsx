'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  MapPin,
  Loader2,
  AlertTriangle,
  Store,
  Wheat,
  Handshake,
  UserCheck,
  Users,
  FileWarning,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBackofficeStore, type BoActor } from '@/lib/stores/backoffice-store'
import { BoPageHeader } from './bo-ui'
import { ACTOR_TYPE_COLORS, type MapActorPoint, type MapZonePoint } from './bo-carte-acteurs-types'

const BoCarteActeursMap = dynamic(
  () => import('./bo-carte-acteurs-map').then((m) => m.BoCarteActeursMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-800">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    ),
  }
)

type ActorTypeFilter = BoActor['type']

const TYPE_FILTER_OPTIONS: { value: ActorTypeFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'marchand', label: 'Marchands', icon: <Store className="h-3.5 w-3.5" /> },
  { value: 'producteur', label: 'Producteurs', icon: <Wheat className="h-3.5 w-3.5" /> },
  { value: 'cooperatif', label: 'Coopératives', icon: <Handshake className="h-3.5 w-3.5" /> },
]

// The actors endpoint caps at 100 rows/page (see /api/backoffice/actors) —
// the map needs the complete set to plot accurately, not just whichever
// page the Acteurs screen last loaded, so this fetches its own full copy
// directly instead of reading the shared, paginated store.actors.
async function fetchAllActors(): Promise<BoActor[]> {
  const limit = 100
  let page = 1
  let all: BoActor[] = []
  for (let guard = 0; guard < 50; guard++) {
    const res = await fetch(`/api/backoffice/actors?limit=${limit}&page=${page}`)
    if (!res.ok) break
    const data = await res.json()
    const rows: Record<string, unknown>[] = data.actors || []
    const mapped: BoActor[] = rows.map((a) => ({
      id: a.id as string,
      actorId: (a.actor_id as string) || '',
      firstName: (a.first_name as string) || '',
      lastName: (a.last_name as string) || '',
      type: a.type as BoActor['type'],
      phone: (a.phone as string) || '',
      zone: (a.zone as string) || '',
      status: a.status as BoActor['status'],
      gpsLat: a.gps_lat as number | undefined,
      gpsLng: a.gps_lng as number | undefined,
      createdAt: (a.created_at as string) || new Date().toISOString(),
    }))
    all = all.concat(mapped)
    const total = (data.total as number) ?? all.length
    if (all.length >= total || rows.length === 0) break
    page += 1
  }
  return all
}

export function BoCarteActeursScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const zones = useBackofficeStore((s) => s.zones)
  const identificateurs = useBackofficeStore((s) => s.identificateurs)
  const dashboard = useBackofficeStore((s) => s.dashboard)
  const fetchZones = useBackofficeStore((s) => s.fetchZones)
  const fetchIdentificateurs = useBackofficeStore((s) => s.fetchIdentificateurs)
  const fetchDashboard = useBackofficeStore((s) => s.fetchDashboard)
  const isDark = boTheme === 'dark'

  const [allActors, setAllActors] = useState<BoActor[]>([])
  const [loadingActors, setLoadingActors] = useState(true)
  const [typeFilters, setTypeFilters] = useState<Set<ActorTypeFilter>>(
    new Set(['marchand', 'producteur', 'cooperatif'])
  )
  const [showIdentificateurs, setShowIdentificateurs] = useState(true)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingActors(true)
    fetchAllActors().then((actors) => { if (!cancelled) setAllActors(actors) }).finally(() => { if (!cancelled) setLoadingActors(false) })
    fetchZones()
    fetchIdentificateurs()
    fetchDashboard()
    return () => { cancelled = true }
  }, [fetchZones, fetchIdentificateurs, fetchDashboard])

  const toggleType = (type: ActorTypeFilter) => {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const actorsWithGps = useMemo(() => allActors.filter((a) => a.gpsLat != null && a.gpsLng != null), [allActors])
  const actorsWithoutGps = allActors.length - actorsWithGps.length

  // A zone's "centroid" for map placement — the average position of its own
  // actors that do have GPS. Zones with none plotted can't be placed (no
  // zone-boundary geodata exists in this app), so they're skipped on the
  // map but still counted in the "Acteurs par zone" list and the alerts.
  const zoneCentroids = useMemo(() => {
    const sums = new Map<string, { lat: number; lng: number; count: number }>()
    for (const a of actorsWithGps) {
      const entry = sums.get(a.zone) || { lat: 0, lng: 0, count: 0 }
      entry.lat += a.gpsLat as number
      entry.lng += a.gpsLng as number
      entry.count += 1
      sums.set(a.zone, entry)
    }
    const centroids = new Map<string, [number, number]>()
    for (const [zone, { lat, lng, count }] of sums) {
      centroids.set(zone, [lat / count, lng / count])
    }
    return centroids
  }, [actorsWithGps])

  const actorPoints: MapActorPoint[] = useMemo(() => (
    actorsWithGps
      .filter((a) => typeFilters.has(a.type))
      .map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`.trim() || a.actorId,
        type: a.type,
        zone: a.zone,
        status: a.status,
        lat: a.gpsLat as number,
        lng: a.gpsLng as number,
      }))
  ), [actorsWithGps, typeFilters])

  const zonesWithoutIdentificateur = zones.filter((z) => z.identificateurCount === 0).length

  const zonePoints: MapZonePoint[] = useMemo(() => {
    if (!showIdentificateurs) return []
    return zones
      .filter((z) => z.identificateurCount > 0 && zoneCentroids.has(z.name))
      .map((z) => {
        const [lat, lng] = zoneCentroids.get(z.name)!
        return { zone: z.name, identificateurCount: z.identificateurCount, actorCount: z.actorCount, lat, lng }
      })
  }, [zones, zoneCentroids, showIdentificateurs])

  const zonesByActorCount = useMemo(
    () => [...zones].sort((a, b) => b.actorCount - a.actorCount),
    [zones]
  )

  const handleZoneClick = useCallback((zoneName: string) => {
    const centroid = zoneCentroids.get(zoneName)
    if (centroid) setFlyTo(centroid)
  }, [zoneCentroids])

  const pendingDossiers = dashboard?.pendingEnrolments ?? 0

  return (
    /* h-full : le <main> du shell BO est déjà le conteneur de scroll de
       hauteur finie (100vh − header − footer) ; calc(100vh-0px) créait
       ~92px de scroll fantôme. */
    <div className={`flex h-full flex-col ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      <div className="p-6 pb-4">
        <BoPageHeader
          title="Carte des acteurs"
          description="Répartition géographique des acteurs et des identificateurs par zone"
        />
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-4 px-6 pb-6">
        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4 overflow-y-auto lg:overflow-visible">
          {/* Filters */}
          <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
            <CardContent className="p-4 space-y-3">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Filtres d&apos;acteurs
              </h3>
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={typeFilters.has(opt.value)} onCheckedChange={() => toggleType(opt.value)} />
                  <span style={{ color: ACTOR_TYPE_COLORS[opt.value] }}>{opt.icon}</span>
                  <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{opt.label}</span>
                </label>
              ))}
              <label className="flex items-center gap-2.5 cursor-pointer pt-1 border-t border-dashed border-slate-200 dark:border-slate-700 mt-1">
                <Checkbox checked={showIdentificateurs} onCheckedChange={(v) => setShowIdentificateurs(!!v)} />
                <UserCheck className="h-3.5 w-3.5" style={{ color: '#0ea5e9' }} />
                <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Identificateurs</span>
              </label>
            </CardContent>
          </Card>

          {/* Alertes terrain */}
          <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
            <CardContent className="p-4 space-y-3">
              <h3 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Alertes terrain
              </h3>
              <div className="space-y-2 text-sm">
                <div className={`flex items-center justify-between rounded-md px-2.5 py-2 ${isDark ? 'bg-slate-700/40' : 'bg-amber-50'}`}>
                  <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <MapPin className="h-3.5 w-3.5" />
                    Acteurs sans géolocalisation
                  </span>
                  <span className="font-semibold">{actorsWithoutGps}</span>
                </div>
                <div className={`flex items-center justify-between rounded-md px-2.5 py-2 ${isDark ? 'bg-slate-700/40' : 'bg-amber-50'}`}>
                  <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <Users className="h-3.5 w-3.5" />
                    Zones sans identificateur
                  </span>
                  <span className="font-semibold">{zonesWithoutIdentificateur}</span>
                </div>
                <div className={`flex items-center justify-between rounded-md px-2.5 py-2 ${isDark ? 'bg-slate-700/40' : 'bg-amber-50'}`}>
                  <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <FileWarning className="h-3.5 w-3.5" />
                    Dossiers en attente
                  </span>
                  <span className="font-semibold">{pendingDossiers}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Acteurs par zone */}
          <Card className={`flex-1 min-h-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
            <CardContent className="p-4 space-y-3 flex flex-col h-full">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Acteurs par zone
              </h3>
              <ScrollArea className="flex-1 max-h-72 lg:max-h-none">
                <div className="space-y-1 pr-2">
                  {zonesByActorCount.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => handleZoneClick(z.name)}
                      disabled={!zoneCentroids.has(z.name)}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                        zoneCentroids.has(z.name)
                          ? (isDark ? 'hover:bg-slate-700 cursor-pointer' : 'hover:bg-slate-100 cursor-pointer')
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{z.name}</span>
                      <span className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>{z.actorCount} acteur{z.actorCount > 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{z.identificateurCount} identif.</span>
                      </span>
                    </button>
                  ))}
                  {zonesByActorCount.length === 0 && (
                    <p className={`text-xs px-2.5 py-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucune zone.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <Card className={`flex-1 min-h-[400px] overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
          <CardContent className="p-0 h-full relative">
            {loadingActors && (
              <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            )}
            <BoCarteActeursMap actorPoints={actorPoints} zonePoints={zonePoints} flyTo={flyTo} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
