'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Users, CheckCircle2, XCircle, Timer, MapPin } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type ActorType } from '@/lib/stores/identificateur-store'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

type Period = '7d' | '30d' | '3m' | 'all'

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 jours',
  '30d': '30 jours',
  '3m': '3 mois',
  'all': 'Tout',
}

function getPeriodStart(period: Period): number {
  const now = Date.now()
  switch (period) {
    case '7d': return now - 7 * 24 * 60 * 60 * 1000
    case '30d': return now - 30 * 24 * 60 * 60 * 1000
    case '3m': return now - 90 * 24 * 60 * 60 * 1000
    case 'all': return 0
  }
}

const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const ACTOR_TYPE_COLORS: Record<ActorType, string> = {
  marchand: '#C66A2C',
  producteur: '#4CAF50',
  cooperative: '#2196F3',
}

export function IdentStatistiquesScreen() {
  const { goBack, soleilMode } = useAppStore()
  const { dossiers } = useIdentificateurStore()
  const [period, setPeriod] = useState<Period>('30d')

  const textClass = soleilMode ? 'text-black' : ''
  const headingClass = soleilMode ? 'text-lg' : 'text-base'
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Filter dossiers by period, excluding brouillons
  const filteredDossiers = useMemo(() => {
    const start = getPeriodStart(period)
    return dossiers.filter(
      (d) => d.status !== 'brouillon' && d.createdAt >= start
    )
  }, [dossiers, period])

  const totalIdent = filteredDossiers.length
  const validatedCount = filteredDossiers.filter((d) => d.status === 'valide').length
  const rejectedCount = filteredDossiers.filter((d) => d.status === 'rejete').length

  const tauxValidation = totalIdent > 0
    ? Math.round((validatedCount / totalIdent) * 100)
    : 0
  const tauxRejet = totalIdent > 0
    ? Math.round((rejectedCount / totalIdent) * 100)
    : 0

  // Repartition par type
  const typeCounts = useMemo(() => {
    const counts: Record<ActorType, number> = { marchand: 0, producteur: 0, cooperative: 0 }
    filteredDossiers.forEach((d) => { counts[d.actorType]++ })
    return counts
  }, [filteredDossiers])

  // Evolution temporelle: last 7 days bar chart
  const last7Days = useMemo(() => {
    const days: { label: string; count: number; date: string }[] = []
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      const dayStart = date.getTime()
      const dayEnd = nextDate.getTime()
      const count = dossiers.filter(
        (d) => d.status !== 'brouillon' && d.createdAt >= dayStart && d.createdAt < dayEnd
      ).length
      days.push({
        label: dayNames[date.getDay()],
        count,
        date: `${date.getDate()}/${date.getMonth() + 1}`,
      })
    }
    return days
  }, [dossiers])

  const maxBarCount = Math.max(...last7Days.map((d) => d.count), 1)

  // Repartition par zone
  const zoneCounts = useMemo(() => {
    const map: Record<string, number> = {}
    filteredDossiers.forEach((d) => {
      const zone = d.zone || 'Non défini'
      map[zone] = (map[zone] || 0) + 1
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
  }, [filteredDossiers])

  const maxZoneCount = zoneCounts.length > 0 ? zoneCounts[0][1] : 1

  // KPI cards data
  const kpiCards = [
    {
      label: 'Total identifications',
      value: String(totalIdent),
      icon: Users,
      color: 'bg-[#9F8170]/10',
      textColor: IDENT_COLOR,
    },
    {
      label: 'Taux de validation',
      value: `${tauxValidation}%`,
      icon: CheckCircle2,
      color: 'bg-green-50',
      textColor: '#16a34a',
    },
    {
      label: 'Temps moyen',
      value: '-- min',
      icon: Timer,
      color: 'bg-amber-50',
      textColor: '#d97706',
    },
    {
      label: 'Taux de rejet',
      value: `${tauxRejet}%`,
      icon: XCircle,
      color: 'bg-red-50',
      textColor: '#dc2626',
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
        <span className="text-white font-bold text-sm tracking-wider">STATISTIQUES</span>
      </div>

      {/* Period selector tabs */}
      <div className="px-4 mt-4">
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-all',
                period === p
                  ? 'text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              style={
                period === p ? { backgroundColor: IDENT_COLOR } : undefined
              }
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards 2x2 grid */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', kpi.color)}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.textColor }} />
                </div>
                <p
                  className={cn('font-bold', soleilMode ? 'text-2xl' : 'text-xl', textClass)}
                  style={{ color: kpi.textColor }}
                >
                  {kpi.value}
                </p>
                <p className={cn('text-muted-foreground mt-0.5', smallTextClass)}>
                  {kpi.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Repartition par type */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Répartition par type
        </h2>
        <Card>
          <CardContent className="p-4 space-y-4">
            {(Object.keys(ACTOR_TYPE_LABELS) as ActorType[]).map((type) => {
              const count = typeCounts[type]
              const pct = totalIdent > 0 ? Math.round((count / totalIdent) * 100) : 0
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('text-sm font-medium', textClass, soleilMode && 'text-base')}>
                      {ACTOR_TYPE_LABELS[type]}
                    </span>
                    <span className={cn('text-xs text-muted-foreground', soleilMode && 'text-sm')}>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Evolution temporelle */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Évolution temporelle
        </h2>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-end justify-between gap-2" style={{ height: '140px' }}>
              {last7Days.map((day, i) => {
                const heightPct = maxBarCount > 0 ? (day.count / maxBarCount) * 100 : 0
                const isToday = i === last7Days.length - 1
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className={cn('text-[10px] font-medium', textClass, soleilMode && 'text-xs')}>
                      {day.count > 0 ? day.count : ''}
                    </span>
                    <div
                      className="w-full rounded-t-md transition-all duration-500"
                      style={{
                        height: `${Math.max(heightPct, 4)}%`,
                        minHeight: '4px',
                        backgroundColor: isToday ? IDENT_COLOR : `${IDENT_COLOR}60`,
                      }}
                    />
                    <span className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                      {day.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Repartition par zone */}
      <div className="px-4 mt-6">
        <h2 className={cn('font-semibold mb-3', textClass, headingClass)}>
          Répartition par zone
        </h2>
        {zoneCounts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
                Aucune donnée pour cette période
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              {zoneCounts.map(([zone, count]) => {
                const pct = Math.round((count / maxZoneCount) * 100)
                return (
                  <div key={zone}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-sm', textClass, soleilMode && 'text-base')}>
                        📍 {zone}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn('text-xs', soleilMode && 'text-sm')}
                        style={{ backgroundColor: `${IDENT_COLOR}15`, color: IDENT_COLOR }}
                      >
                        {count}
                      </Badge>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: IDENT_COLOR }}
                      />
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
