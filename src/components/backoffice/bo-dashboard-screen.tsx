'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from 'recharts'
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  FolderOpen,
  Eye,
  FileBarChart,
  ChevronRight,
  Wifi,
  Database,
  MessageSquare,
  Mic,
  Plus,
  MoreHorizontal,
  RefreshCw,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Loader2,
  Inbox,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useBackofficeStore,
  type DashboardData,
} from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner, BoEmptyState } from './bo-ui'

// ============== TYPES ==============

interface KpiItem {
  label: string
  value: string
  trend?: string
  trendType?: 'positive' | 'negative' | 'neutral'
  icon: React.ReactNode
  iconBg: string
}

// ============== SUB-COMPONENTS ==============

function PulseDot({ color = 'bg-emerald-500' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ' + color} />
      <span className={'relative inline-flex rounded-full h-2 w-2 ' + color} />
    </span>
  )
}

function TickerBar() {
  const { ticker, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const items = useMemo(
    () => [
      { label: 'Transactions/min', value: ticker.transactionsPerMin.toString(), color: isDark ? 'text-emerald-400' : 'text-emerald-600', dotColor: 'bg-emerald-500' },
      { label: 'Enrôlements/h', value: (ticker.enrolmentsPerHour ?? 0).toLocaleString('fr-FR'), color: isDark ? 'text-amber-400' : 'text-amber-600', dotColor: 'bg-amber-500' },
      { label: 'Uptime', value: ticker.uptime + '%', color: isDark ? 'text-emerald-400' : 'text-emerald-600', dotColor: 'bg-emerald-500' },
      { label: 'Utilisateurs actifs', value: ticker.activeUsers.toLocaleString('fr-FR'), color: isDark ? 'text-slate-300' : 'text-slate-700', dotColor: 'bg-slate-400' },
    ],
    [ticker, isDark]
  )

  return (
    <div className={isDark ? 'rounded-xl px-6 py-3 flex flex-wrap items-center gap-6 md:gap-10 border bg-slate-800 border-slate-700' : 'rounded-xl px-6 py-3 flex flex-wrap items-center gap-6 md:gap-10 border bg-white border-slate-200'}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <PulseDot color={item.dotColor} />
          <span className={isDark ? 'text-xs hidden sm:inline text-slate-400' : 'text-xs hidden sm:inline text-slate-500'}>{item.label}</span>
          <span className={'text-sm font-semibold ' + item.color}>{item.value}</span>
        </div>
      ))}
      <div className={isDark ? 'ml-auto hidden md:flex items-center gap-1.5 text-slate-500' : 'ml-auto hidden md:flex items-center gap-1.5 text-slate-400'}>
        <Activity className="h-3 w-3" />
        <span className="text-xs font-medium">Temps réel</span>
      </div>
    </div>
  )
}

function KpiCard({ item, loading }: { item: KpiItem; loading?: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  if (loading) {
    return (
      <div className={isDark ? 'rounded-2xl p-5 border bg-slate-800 border-slate-700' : 'rounded-2xl p-5 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-5 border transition-shadow duration-200 bg-slate-800 border-slate-700 shadow-none hover:shadow-none' : 'rounded-2xl p-5 border transition-shadow duration-200 bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]'}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={isDark ? 'text-xs font-medium tracking-wide uppercase text-slate-400' : 'text-xs font-medium tracking-wide uppercase text-slate-500'}>{item.label}</p>
          <p className={isDark ? 'text-[28px] font-bold mt-2 leading-none text-slate-100' : 'text-[28px] font-bold mt-2 leading-none text-slate-900'}>{item.value}</p>
          {item.trend && (
            <div className="mt-2.5 flex items-center gap-1">
              {item.trendType === 'positive' ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              ) : item.trendType === 'negative' ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
              ) : null}
              <span className={
                item.trendType === 'positive' ? 'text-xs font-semibold text-emerald-600' :
                item.trendType === 'negative' ? 'text-xs font-semibold text-red-500' :
                isDark ? 'text-xs font-semibold text-slate-400' : 'text-xs font-semibold text-slate-500'
              }>
                {item.trend}
              </span>
            </div>
          )}
        </div>
        <div className={'flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl ' + item.iconBg}>
          {item.icon}
        </div>
      </div>
    </div>
  )
}

function KpiGrid({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const activeRate = dashboard && dashboard.totalActors > 0
    ? Math.round((dashboard.activeActors / dashboard.totalActors) * 100)
    : 0

  const kpis: KpiItem[] = [
    {
      label: 'Total Acteurs',
      value: dashboard ? dashboard.totalActors.toLocaleString('fr-FR') : '0',
      trend: dashboard?.pendingEnrolments ? dashboard.pendingEnrolments + ' en attente' : undefined,
      trendType: 'neutral',
      icon: <Users className="h-5 w-5 text-blue-600" />,
      iconBg: isDark ? 'bg-blue-500/15' : 'bg-blue-50',
    },
    {
      label: 'Actifs',
      value: dashboard ? dashboard.activeActors.toLocaleString('fr-FR') : '0',
      trend: dashboard ? activeRate + '%' : undefined,
      trendType: 'neutral',
      icon: <UserCheck className="h-5 w-5 text-emerald-600" />,
      iconBg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
    },
    {
      label: 'Missions actives',
      value: dashboard ? dashboard.activeMissions.toLocaleString('fr-FR') : '0',
      trend: dashboard ? 'sur ' + dashboard.totalMissions : undefined,
      trendType: 'neutral',
      icon: <TrendingUp className="h-5 w-5 text-violet-600" />,
      iconBg: isDark ? 'bg-violet-500/15' : 'bg-violet-50',
    },
    {
      label: 'Suspendus',
      value: dashboard ? dashboard.suspendedActors.toLocaleString('fr-FR') : '0',
      icon: <UserX className="h-5 w-5 text-red-500" />,
      iconBg: isDark ? 'bg-red-500/15' : 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} item={kpi} loading={isLoading} />
      ))}
    </div>
  )
}

function NationalObjectives({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const target = dashboard?.nationalTarget || 15000
  const current = dashboard?.totalActors || 0
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
  const remaining = Math.max(0, target - current)

  const [animatedProgress, setAnimatedProgress] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setAnimatedProgress(pct), 150)
      return () => clearTimeout(timer)
    }
  }, [pct, isLoading])

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-2 w-32" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-2.5 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Objectifs Nationaux 2026</h3>
          <p className={isDark ? 'text-xs mt-0.5 text-slate-500' : 'text-xs mt-0.5 text-slate-400'}>Cible d&#39;enrolement marchands</p>
        </div>
        <span className={isDark ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400' : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700'}>{pct}%</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className={isDark ? 'text-2xl font-bold text-slate-100' : 'text-2xl font-bold text-slate-900'}>{current.toLocaleString('fr-FR')}</span>
        <span className={isDark ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>sur {target.toLocaleString('fr-FR')}</span>
      </div>
      <Progress
        value={animatedProgress}
        className={isDark ? 'h-2.5 rounded-full bg-slate-700 [&>div]:bg-blue-500' : 'h-2.5 rounded-full bg-slate-100 [&>div]:bg-blue-500'}
      />
      <p className={isDark ? 'text-xs mt-2.5 text-slate-500' : 'text-xs mt-2.5 text-slate-400'}>
        Il reste <span className={isDark ? 'font-medium text-slate-300' : 'font-medium text-slate-700'}>{remaining.toLocaleString('fr-FR')}</span> acteurs a enroller
      </p>
    </div>
  )
}

function RegionChart({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const CHART_COLORS = ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE', '#EFF6FF', '#CBD5E1']

  const data = useMemo(() => {
    if (!dashboard?.actorCountsByRegion?.length) return []
    return dashboard.actorCountsByRegion.map((item, i) => ({
      name: item.name,
      value: item.count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [dashboard])

  const gridStroke = isDark ? '#334155' : '#F1F5F9'
  const tickFill = isDark ? '#64748B' : '#94A3B8'
  const tooltipStyle: React.CSSProperties = isDark
    ? { borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '13px', backgroundColor: '#1E293B', color: '#E2E8F0' }
    : { borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '13px' }

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <Skeleton className="h-4 w-40 mb-5" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Activité par Région</h3>
        <div className="h-72 flex items-center justify-center">
          <p className={isDark ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>Aucune donnée disponible</p>
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Activité par Région</h3>
        <button type="button" aria-label="Plus d'options" className={isDark ? 'p-2.5 rounded-lg transition-colors hover:bg-white/5 text-slate-400 hover:text-slate-300' : 'p-2.5 rounded-lg transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600'}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
            <XAxis type="number" tick={{ fontSize: 11, fill: tickFill }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Acteurs']}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EnrolmentTrendChart({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const data = useMemo(() => {
    if (!dashboard?.dailyEnrolmentTrend?.length) return []
    return dashboard.dailyEnrolmentTrend.map((item) => ({
      name: item.day,
      'enrolements': item.count,
    }))
  }, [dashboard])

  const gridStroke = isDark ? '#334155' : '#F1F5F9'
  const tickFill = isDark ? '#64748B' : '#94A3B8'
  const tooltipStyle: React.CSSProperties = isDark
    ? { borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '13px', backgroundColor: '#1E293B', color: '#E2E8F0' }
    : { borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '13px' }

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <Skeleton className="h-4 w-48 mb-5" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Tendance d&#39;enrôlement (7 jours)</h3>
        <div className="h-72 flex items-center justify-center">
          <p className={isDark ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>Aucune donnée disponible</p>
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Tendance d&#39;Enrolement (7 jours)</h3>
        <button type="button" aria-label="Plus d'options" className={isDark ? 'p-2.5 rounded-lg transition-colors hover:bg-white/5 text-slate-400 hover:text-slate-300' : 'p-2.5 rounded-lg transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600'}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="enrolGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: tickFill }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Enrôlements']}
            />
            <Area type="monotone" dataKey="enrolements" stroke="#3B82F6" strokeWidth={2} fill="url(#enrolGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TopIdentificateurs({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const identificateurs = dashboard?.topIdentificateurs || []

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <Skeleton className="h-4 w-40 mb-5" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Top Identificateurs</h3>
        <button type="button" aria-label="Plus d'options" className={isDark ? 'p-2.5 rounded-lg transition-colors hover:bg-white/5 text-slate-400 hover:text-slate-300' : 'p-2.5 rounded-lg transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600'}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1">
        {identificateurs.length === 0 ? (
          <div className="py-8 text-center">
            <p className={isDark ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>Aucune donnee disponible</p>
          </div>
        ) : (
          identificateurs.map((id, idx) => (
            <div key={idx} className={isDark ? 'flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors hover:bg-slate-700' : 'flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors hover:bg-slate-50'}>
              <span className={
                idx === 0 ? (isDark ? 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-amber-500/15 text-amber-400' : 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-amber-100 text-amber-700') :
                idx === 1 ? (isDark ? 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-slate-700 text-slate-300' : 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-600') :
                idx === 2 ? (isDark ? 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-orange-500/15 text-orange-400' : 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-orange-100 text-orange-700') :
                (isDark ? 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-slate-700/50 text-slate-400' : 'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-slate-50 text-slate-400')
              }>
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={isDark ? 'text-sm font-medium truncate text-slate-100' : 'text-sm font-medium truncate text-slate-900'}>{id.name}</p>
                <p className={isDark ? 'text-xs text-slate-500' : 'text-xs text-slate-400'}>{id.zone}</p>
              </div>
              <Badge variant="secondary" className={isDark ? 'font-semibold tabular-nums text-xs bg-slate-700 text-slate-300' : 'font-semibold tabular-nums text-xs bg-slate-100 text-slate-600'}>
                {id.count}
              </Badge>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DataQualitySection({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const qualities = [
    { label: 'Photos valides', value: dashboard?.dataQuality?.photos ?? 0, color: '#10B981' },
    { label: 'GPS précis', value: dashboard?.dataQuality?.gps ?? 0, color: '#3B82F6' },
    { label: 'Téléphones vérifiés', value: dashboard?.dataQuality?.phones ?? 0, color: '#8B5CF6' },
  ]

  const circleStroke = isDark ? '#334155' : '#F1F5F9'

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <Skeleton className="h-4 w-36 mb-5" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Qualité des Données</h3>
        <button type="button" aria-label="Plus d'options" className={isDark ? 'p-2.5 rounded-lg transition-colors hover:bg-white/5 text-slate-400 hover:text-slate-300' : 'p-2.5 rounded-lg transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600'}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-4">
        {qualities.map((q) => (
          <div key={q.label} className="flex items-center gap-4">
            <div className="relative flex-shrink-0 w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke={circleStroke} strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="24" fill="none" stroke={q.color} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={(q.value / 100) * 150.8 + ' 150.8'}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className={isDark ? 'absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-100' : 'absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900'}>{q.value}%</span>
            </div>
            <div className="flex-1">
              <p className={isDark ? 'text-sm font-medium text-slate-100' : 'text-sm font-medium text-slate-900'}>{q.label}</p>
              <p className={isDark ? 'text-xs mt-0.5 text-slate-500' : 'text-xs mt-0.5 text-slate-400'}>
                {q.value >= 95 ? 'Excellente qualité' : q.value >= 90 ? 'Qualité satisfaisante' : q.value >= 70 ? 'À améliorer' : 'Données insuffisantes'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemHealth({ dashboard, isLoading }: { dashboard: DashboardData | null; isLoading: boolean }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const services = dashboard?.systemHealth || []

  const statusConfig: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    OK: {
      bg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
      text: isDark ? 'text-emerald-400' : 'text-emerald-700',
      border: isDark ? 'border-slate-600' : 'border-emerald-100',
      dot: 'bg-emerald-500',
    },
    Lent: {
      bg: isDark ? 'bg-amber-500/15' : 'bg-amber-50',
      text: isDark ? 'text-amber-400' : 'text-amber-700',
      border: isDark ? 'border-slate-600' : 'border-amber-100',
      dot: 'bg-amber-500',
    },
    Erreur: {
      bg: isDark ? 'bg-red-500/15' : 'bg-red-50',
      text: isDark ? 'text-red-400' : 'text-red-700',
      border: isDark ? 'border-slate-600' : 'border-red-100',
      dot: 'bg-red-500',
    },
    operationnel: {
      bg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
      text: isDark ? 'text-emerald-400' : 'text-emerald-700',
      border: isDark ? 'border-slate-600' : 'border-emerald-100',
      dot: 'bg-emerald-500',
    },
    degraded: {
      bg: isDark ? 'bg-amber-500/15' : 'bg-amber-50',
      text: isDark ? 'text-amber-400' : 'text-amber-700',
      border: isDark ? 'border-slate-600' : 'border-amber-100',
      dot: 'bg-amber-500',
    },
  }

  const iconMap: Record<string, React.ElementType> = {
    'API Principale': Wifi,
    'Base de données': Database,
    'Keiwa Wallet': Activity,
    'SMS Provider': MessageSquare,
    'Push Notifications': MessageSquare,
    'Integration DGE': Activity,
  }

  if (isLoading) {
    return (
      <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
        <Skeleton className="h-4 w-32 mb-5" />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Santé Système</h3>
        <button type="button" aria-label="Plus d'options" className={isDark ? 'p-2.5 rounded-lg transition-colors hover:bg-white/5 text-slate-400 hover:text-slate-300' : 'p-2.5 rounded-lg transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600'}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {services.length === 0 ? (
          <div className="col-span-2 py-6 text-center">
            <p className={isDark ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>Aucune donnée de santé système</p>
          </div>
        ) : (
          services.map((svc) => {
            const cfg = statusConfig[svc.status] || statusConfig['operationnel']
            const IconComponent = iconMap[svc.name] || Activity
            return (
              <div key={svc.name} className={'flex items-center gap-2.5 px-3 py-3 rounded-xl border ' + cfg.bg + ' ' + cfg.border}>
                <IconComponent className={cfg.text} />
                <p className={cfg.text + ' text-xs font-medium truncate'}>{svc.name}</p>
                <span className={'ml-auto h-2 w-2 rounded-full shrink-0 ' + cfg.dot} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function QuickAccessLinks({ pendingCount }: { pendingCount: number }) {
  const { boNavigate, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const links = [
    {
      label: 'Dossiers en attente', icon: <FolderOpen className="h-5 w-5" />, route: 'bo-enrolement' as const, count: pendingCount,
      color: isDark ? 'text-amber-400' : 'text-amber-600',
      bg: isDark ? 'bg-amber-500/15' : 'bg-amber-50',
      border: isDark ? 'border-amber-500/20' : 'border-amber-100',
    },
    {
      label: 'Supervision', icon: <Eye className="h-5 w-5" />, route: 'bo-supervision' as const, count: undefined,
      color: isDark ? 'text-blue-400' : 'text-blue-600',
      bg: isDark ? 'bg-blue-500/15' : 'bg-blue-50',
      border: isDark ? 'border-blue-500/20' : 'border-blue-100',
    },
    {
      label: 'Rapports', icon: <FileBarChart className="h-5 w-5" />, route: 'bo-rapports' as const, count: undefined,
      color: isDark ? 'text-violet-400' : 'text-violet-600',
      bg: isDark ? 'bg-violet-500/15' : 'bg-violet-50',
      border: isDark ? 'border-violet-500/20' : 'border-violet-100',
    },
    {
      label: 'Acteurs', icon: <Users className="h-5 w-5" />, route: 'bo-acteurs' as const, count: undefined,
      color: isDark ? 'text-emerald-400' : 'text-emerald-600',
      bg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
      border: isDark ? 'border-emerald-500/20' : 'border-emerald-100',
    },
  ]

  return (
    <div className={isDark ? 'rounded-2xl p-6 border bg-slate-800 border-slate-700 shadow-none' : 'rounded-2xl p-6 border bg-white border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={isDark ? 'font-semibold text-sm text-slate-100' : 'font-semibold text-sm text-slate-900'}>Acces Rapide</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {links.map((link) => (
          <button
            key={link.label}
            onClick={() => boNavigate(link.route)}
            className={link.border + ' ' + link.bg + ' flex items-center gap-3 px-4 py-3.5 rounded-xl border hover:opacity-80 transition-opacity text-left'}
          >
            <span className={link.color}>{link.icon}</span>
            <span className={link.color + ' text-xs font-medium flex-1'}>{link.label}</span>
            {link.count !== undefined && link.count > 0 && (
              <span className={isDark ? 'text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-slate-800 text-slate-300 border-slate-600' : 'text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-white text-slate-600 border-slate-200'}>{link.count}</span>
            )}
            <ChevronRight className={isDark ? 'w-3.5 h-3.5 text-slate-600' : 'w-3.5 h-3.5 text-slate-300'} />
          </button>
        ))}
      </div>
    </div>
  )
}

function FullPageLoader() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  return (
    <div className={isDark ? 'flex flex-col items-center justify-center min-h-[400px] gap-4 bg-slate-900' : 'flex flex-col items-center justify-center min-h-[400px] gap-4 bg-[#F8FAFC]'}>
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <p className={isDark ? 'text-sm text-slate-400' : 'text-sm text-slate-500'}>Chargement du tableau de bord...</p>
    </div>
  )
}

// ============== MAIN COMPONENT ==============

export function BoDashboardScreen() {
  const { boUser, boTheme, loading, dashboard, enrolments, fetchAllData, errors, boNavigate } = useBackofficeStore()
  const error = errors.dashboard ?? null
  const isDark = boTheme === 'dark'
  const firstName = boUser?.name?.split(' ')[0] || 'Admin'

  const pendingCount = dashboard?.pendingEnrolments ?? enrolments.filter(e => e.status === 'en_attente').length

  useEffect(() => {
    if (!dashboard && !loading) {
      fetchAllData()
    }
  }, [dashboard, loading, fetchAllData])

  const isLoading = loading && !dashboard

  // Full loading state
  if (isLoading) {
    return (
      <div className={isDark ? 'p-6 lg:p-8 space-y-6 bg-slate-900' : 'p-6 lg:p-8 space-y-6 bg-[#F8FAFC]'}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <FullPageLoader />
      </div>
    )
  }

  // Error / empty state
  if (!dashboard && !loading) {
    return (
      <div className={isDark ? 'p-6 lg:p-8 space-y-6 bg-slate-900' : 'p-6 lg:p-8 space-y-6 bg-[#F8FAFC]'}>
        <BoPageHeader
          title={`Bienvenue, ${firstName}`}
          description="Voici l'état actuel de la plateforme Jùlaba."
        />
        {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}
        <BoEmptyState
          icon={Inbox}
          title="Données indisponibles"
          description="Impossible de charger les données du tableau de bord."
          className="min-h-[400px]"
          action={
            <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className={isDark ? 'p-6 lg:p-8 space-y-6 bg-slate-900' : 'p-6 lg:p-8 space-y-6 bg-[#F8FAFC]'}>
      {/* Page Header */}
      <BoPageHeader
        title={`Bienvenue, ${firstName}`}
        description="Voici l'état actuel de la plateforme Jùlaba."
      />

      {/* Error banner */}
      {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}
            {/* 1. Real-time Ticker Bar */}
      <TickerBar />
      {/* À traiter maintenant */}
      {!isLoading && dashboard && (
        <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
              <Clock className="h-4 w-4 text-red-500" />
            </div>
            <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>À traiter maintenant</h2>
          </div>
          <div className="space-y-3">
            {dashboard.pendingEnrolments > 0 && (
              <div className={`flex items-center justify-between p-3 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                    <FolderOpen className="h-4.5 w-4.5 text-amber-500" />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {dashboard.pendingEnrolments} dossier{dashboard.pendingEnrolments > 1 ? 's' : ''} en attente
                    </p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Validation des enrôlements requise
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => boNavigate('bo-enrolement')} className="h-8 text-xs gap-1.5">
                  Traiter <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
            {dashboard.unacknowledgedAlerts > 0 && (
              <div className={`flex items-center justify-between p-3 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
                    <Activity className="h-4.5 w-4.5 text-red-500" />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {dashboard.unacknowledgedAlerts} alerte{dashboard.unacknowledgedAlerts > 1 ? 's' : ''} non traitée{dashboard.unacknowledgedAlerts > 1 ? 's' : ''}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Vérifiez les alertes critiques
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => boNavigate('bo-supervision')} className="h-8 text-xs gap-1.5">
                  Voir <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
            {dashboard.pendingEnrolments === 0 && dashboard.unacknowledgedAlerts === 0 && (
              <div className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <UserCheck className="h-4.5 w-4.5 text-emerald-500" />
                </div>
                <p className={`text-sm font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Tout est à jour. Aucune action requise.
                </p>
              </div>
            )}
          </div>
        </div>
      )}



      {/* 2. KPI Cards Grid */}
      <KpiGrid dashboard={dashboard} isLoading={isLoading} />

      {/* 3. Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RegionChart dashboard={dashboard} isLoading={isLoading} />
        <EnrolmentTrendChart dashboard={dashboard} isLoading={isLoading} />
      </div>

      {/* 4. Objectives + System Health + Data Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <NationalObjectives dashboard={dashboard} isLoading={isLoading} />
        <SystemHealth dashboard={dashboard} isLoading={isLoading} />
        <DataQualitySection dashboard={dashboard} isLoading={isLoading} />
      </div>

      {/* 5. Top Identificateurs + Quick Access */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <TopIdentificateurs dashboard={dashboard} isLoading={isLoading} />
        <QuickAccessLinks pendingCount={pendingCount} />
      </div>
    </div>
  )
}
