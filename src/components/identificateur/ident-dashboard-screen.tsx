'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Users, Target, CheckCircle2, CalendarDays, TrendingUp, Trophy, MapPin, Clock, WifiOff, Activity } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type Dossier } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const STATUS_DOT: Record<Dossier['status'], string> = {
  brouillon: 'bg-gray-400',
  en_attente: 'bg-amber-400',
  valide: 'bg-green-500',
  rejete: 'bg-red-500',
}

const STATUS_LABELS: Record<Dossier['status'], string> = {
  brouillon: 'Brouillon',
  en_attente: 'En attente',
  valide: 'Validé',
  rejete: 'Rejété',
}

// Mock ranking data
const MOCK_RANKING = [
  { name: 'Koné Ibrahim', zone: 'Adjamé', count: 47 },
  { name: 'Diallo Awa', zone: 'Cocody', count: 42 },
  { name: 'Traoré Moussa', zone: 'Yopougon', count: 38 },
  { name: 'Ouattara Mariam', zone: 'Plateau', count: 35 },
  { name: 'Bamba Koffi', zone: 'Abobo', count: 31 },
]

export function IdentDashboardScreen() {
  const { goBack, soleilMode, merchantName } = useAppStore()
  const { dossiers, mission } = useIdentificateurStore()

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Computed stats
  const stats = useMemo(() => {
    const nonBrouillon = dossiers.filter((d) => d.status !== 'brouillon')
    const valides = dossiers.filter((d) => d.status === 'valide')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayDossiers = dossiers.filter((d) => d.createdAt >= today.getTime() && d.status !== 'brouillon')

    const totalIdent = nonBrouillon.length
    const tauxValidation = nonBrouillon.length > 0
      ? Math.round((valides.length / nonBrouillon.length) * 100)
      : 0
    const missionPct = mission.target > 0
      ? Math.min(Math.round((valides.length / mission.target) * 100), 100)
      : 0

    // Days left in month
    const now = new Date()
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysLeft = Math.max(0, lastDayOfMonth - now.getDate())
    const missionRemaining = Math.max(0, mission.target - valides.length)
    const dailyPace = daysLeft > 0 ? Math.ceil(missionRemaining / daysLeft) : missionRemaining

    // Last 5 dossiers
    const lastActivities = [...dossiers]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)

    // Top 5 zones by dossier count
    const zoneMap: Record<string, number> = {}
    nonBrouillon.forEach((d) => {
      const z = d.zone || 'Non défini'
      zoneMap[z] = (zoneMap[z] || 0) + 1
    })
    const topZones = Object.entries(zoneMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const maxZoneCount = topZones.length > 0 ? topZones[0][1] : 1

    return {
      totalIdent,
      tauxValidation,
      missionPct,
      todayCount: todayDossiers.length,
      validesCount: valides.length,
      daysLeft,
      dailyPace,
      missionRemaining,
      lastActivities,
      topZones,
      maxZoneCount,
    }
  }, [dossiers, mission])

  // KPI cards
  const kpiCards = [
    {
      label: 'Total identifiés',
      value: stats.totalIdent,
      icon: Users,
      bg: `${IDENT_COLOR}15`,
      iconColor: IDENT_COLOR,
    },
    {
      label: 'Objectif mensuel',
      value: `${stats.missionPct}%`,
      subtext: `${stats.validesCount} / ${mission.target}`,
      icon: Target,
      bg: 'bg-green-50',
      iconColor: '#16a34a',
    },
    {
      label: 'Taux de validation',
      value: `${stats.tauxValidation}%`,
      icon: CheckCircle2,
      bg: 'bg-emerald-50',
      iconColor: '#059669',
    },
    {
      label: "Aujourd'hui",
      value: stats.todayCount,
      icon: CalendarDays,
      bg: 'bg-amber-50',
      iconColor: '#d97706',
    },
  ]

  return (
    <div className="screen-enter pb-24">
      {/* Top bar */}
      <div
        className="px-4 py-3 flex items-center gap-3 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white/90 hover:text-white hover:bg-white/10 h-9 w-9"
          onClick={goBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-bold text-sm tracking-wider">TABLEAU DE BORD</span>
      </div>

      {/* Vue d'ensemble - KPI cards */}
      <div className="px-4 mt-4">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Vue générale
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      !kpi.bg.startsWith('#') && kpi.bg,
                    )}
                    style={kpi.bg.startsWith('#') ? { backgroundColor: kpi.bg } : undefined}
                  >
                    <kpi.icon className="w-4 h-4" style={{ color: kpi.iconColor }} />
                  </div>
                </div>
                <p className={cn('font-bold', soleilMode ? 'text-2xl' : 'text-xl', textClass)} style={{ color: kpi.iconColor }}>
                  {kpi.value}
                </p>
                <p className={cn('text-xs text-muted-foreground mt-0.5', smallTextClass)}>
                  {kpi.label}
                </p>
                {kpi.subtext && (
                  <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                    {kpi.subtext}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Performance vs objectif */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Performance vs objectif
        </h2>
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                  Progrès mensuel
                </span>
                <span className={cn('font-bold text-sm', textClass, soleilMode && 'text-base')} style={{ color: IDENT_COLOR }}>
                  {stats.validesCount} / {mission.target}
                </span>
              </div>
              <Progress value={stats.missionPct} className="h-3" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                    Jours restants
                  </span>
                </div>
                <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-xl')} style={{ color: IDENT_COLOR }}>
                  {stats.daysLeft}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                    Rythme nécessaire
                  </span>
                </div>
                <p className={cn('font-bold text-lg', textClass, soleilMode && 'text-xl')} style={{ color: IDENT_COLOR }}>
                  {stats.dailyPace}<span className={cn('text-xs font-normal text-muted-foreground', soleilMode && 'text-sm')}>/j</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dernières activités */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Dernière activité
        </h2>
        <Card>
          <CardContent className="p-4">
            {stats.lastActivities.length === 0 ? (
              <div className="py-4 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
                  Aucune activité
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.lastActivities.map((dossier) => (
                  <div key={dossier.id} className="flex items-center gap-3">
                    <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_DOT[dossier.status])} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', textClass, soleilMode && 'text-base')}>
                        {dossier.firstName} {dossier.lastName || '—'}
                      </p>
                      <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                        {new Date(dossier.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', soleilMode && 'text-xs')}>
                      {STATUS_LABELS[dossier.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Classement */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          <Trophy className="w-4 h-4 inline-block mr-1" style={{ color: '#d97706' }} />
          Classement
        </h2>
        <Card>
          <CardContent className="p-4 space-y-2">
            {MOCK_RANKING.map((agent, i) => {
              const isCurrentAgent = agent.name.includes(merchantName || '___NEVER___')
              return (
                <div
                  key={agent.name}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                    isCurrentAgent && 'bg-[#9F8170]/10'
                  )}
                >
                  <span className={cn('w-6 text-center font-bold text-sm', textClass)} style={{ color: i === 0 ? '#d97706' : i === 1 ? '#6b7280' : i === 2 ? '#a16207' : 'rgb(107 114 128)' }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium truncate', textClass, soleilMode && 'text-base')}>
                      {agent.name}
                      {isCurrentAgent && (
                        <Badge className="ml-1.5 text-[10px]" style={{ backgroundColor: IDENT_COLOR, color: 'white' }}>
                          Vous
                        </Badge>
                      )}
                    </p>
                    <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                      📍 {agent.zone}
                    </p>
                  </div>
                  <span className={cn('font-bold text-sm', textClass, soleilMode && 'text-base')} style={{ color: IDENT_COLOR }}>
                    {agent.count}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
        <div className="flex items-center gap-1.5 mt-2 px-1">
          <WifiOff className="w-3 h-3 text-muted-foreground" />
          <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
            Connexion internet nécessaire pour les classements en temps réel
          </p>
        </div>
      </div>

      {/* Top zoneses */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          <MapPin className="w-4 h-4 inline-block mr-1" style={{ color: IDENT_COLOR }} />
          Top zones
        </h2>
        {stats.topZones.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
                Aucune donnée de zone
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              {stats.topZones.map(([zone, count], i) => {
                const pct = Math.round((count / stats.maxZoneCount) * 100)
                return (
                  <div key={zone}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>
                        {i + 1}. {zone}
                      </span>
                      <span className={cn('text-xs font-semibold', textClass, soleilMode && 'text-sm')} style={{ color: IDENT_COLOR }}>
                        {count}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-0.5" style={{ height: '28px' }}>
                      <div className="flex-1 h-full bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: i === 0 ? IDENT_COLOR : `${IDENT_COLOR}${80 - i * 15 > 30 ? (80 - i * 15).toString(16).padStart(2, '0') : '30'}`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
