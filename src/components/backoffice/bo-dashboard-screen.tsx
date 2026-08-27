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
  TrendingUp,
  UserX,
  Clock,
  CreditCard,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'

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
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

function TickerBar() {
  const ticker = useBackofficeStore((s) => s.ticker)

  const items = useMemo(
    () => [
      { label: 'Transactions/min', value: ticker.transactionsPerMin.toString(), color: 'text-emerald-600', dotColor: 'bg-emerald-500' },
      { label: 'Enrôlements/h', value: ticker.enrolmentsPerHour.toString(), color: 'text-amber-600', dotColor: 'bg-amber-500' },
      { label: 'Uptime', value: `${ticker.uptime}%`, color: 'text-emerald-600', dotColor: 'bg-emerald-500' },
      { label: 'Utilisateurs actifs', value: ticker.activeUsers.toLocaleString('fr-FR'), color: 'text-slate-700', dotColor: 'bg-slate-400' },
    ],
    [ticker]
  )

  return (
    <div className="rounded-xl px-6 py-3 flex flex-wrap items-center gap-6 md:gap-10 bg-white border border-slate-200">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <PulseDot color={item.dotColor} />
          <span className="text-xs text-slate-500 hidden sm:inline">{item.label}</span>
          <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
        </div>
      ))}
      <div className="ml-auto hidden md:flex items-center gap-1.5 text-slate-400">
        <Activity className="h-3 w-3" />
        <span className="text-xs font-medium">Temps réel</span>
      </div>
    </div>
  )
}

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{item.label}</p>
          <p className="text-[28px] font-bold mt-2 text-slate-900 leading-none">{item.value}</p>
          {item.trend && (
            <div className="mt-2.5 flex items-center gap-1">
              {item.trendType === 'positive' ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              ) : item.trendType === 'negative' ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
              ) : null}
              <span className={`text-xs font-semibold ${
                item.trendType === 'positive' ? 'text-emerald-600' : item.trendType === 'negative' ? 'text-red-500' : 'text-slate-500'
              }`}>
                {item.trend}
              </span>
            </div>
          )}
        </div>
        <div className={`flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl ${item.iconBg}`}>
          {item.icon}
        </div>
      </div>
    </div>
  )
}

function KpiGrid() {
  const kpis: KpiItem[] = [
    {
      label: 'Total Acteurs',
      value: '12 450',
      trend: '+12%',
      trendType: 'positive',
      icon: <Users className="h-5 w-5 text-blue-600" />,
      iconBg: 'bg-blue-50',
    },
    {
      label: 'Actifs',
      value: '9 845',
      trend: '79%',
      trendType: 'neutral',
      icon: <UserCheck className="h-5 w-5 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Volume FCFA/h',
      value: '2.3M',
      trend: '+8%',
      trendType: 'positive',
      icon: <TrendingUp className="h-5 w-5 text-violet-600" />,
      iconBg: 'bg-violet-50',
    },
    {
      label: 'Suspendus',
      value: '127',
      trend: '+3',
      trendType: 'negative',
      icon: <UserX className="h-5 w-5 text-red-500" />,
      iconBg: 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} item={kpi} />
      ))}
    </div>
  )
}

function NationalObjectives() {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const target = 83

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(target), 150)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-slate-900 font-semibold text-sm">Objectifs Nationaux 2026</h3>
          <p className="text-slate-400 text-xs mt-0.5">Cible d'enrôlement marchands</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">83%</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-900 text-2xl font-bold">12 450</span>
        <span className="text-slate-400 text-sm">sur 15 000</span>
      </div>
      <Progress
        value={animatedProgress}
        className="h-2.5 bg-slate-100 [&>div]:bg-blue-500 rounded-full"
      />
      <p className="text-slate-400 text-xs mt-2.5">
        Il reste <span className="text-slate-700 font-medium">2 550</span> acteurs à enrôler
      </p>
    </div>
  )
}

function RegionChart() {
  const data = [
    { name: 'Abidjan', value: 6245, fill: '#3B82F6' },
    { name: 'Bouaké', value: 1890, fill: '#60A5FA' },
    { name: 'Yamoussoukro', value: 1245, fill: '#93C5FD' },
    { name: 'Daloa', value: 890, fill: '#BFDBFE' },
    { name: 'Korhogo', value: 670, fill: '#DBEAFE' },
    { name: 'San-Pédro', value: 510, fill: '#EFF6FF' },
    { name: 'Autres', value: 3000, fill: '#CBD5E1' },
  ]

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Activité par Région</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '13px' }}
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

function EnrolmentTrendChart() {
  const enrolments = useBackofficeStore((s) => s.enrolments)

  const data = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const baseCounts = [145, 178, 162, 198, 210, 87, 45]
    const todayValidated = enrolments.filter((e) => e.status === 'valide').length
    return days.map((day, i) => ({
      name: day,
      enrôlements: i === 6 ? todayValidated * 3 + 45 : baseCounts[i],
    }))
  }, [enrolments])

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Tendance d'Enrôlement (7 jours)</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '13px' }}
              formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Enrôlements']}
            />
            <Area type="monotone" dataKey="enrôlements" stroke="#3B82F6" strokeWidth={2} fill="url(#enrolGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TopIdentificateurs() {
  const identificateurs = [
    { rank: 1, name: 'Kouadio Jean', zone: 'Adjamé', count: 342 },
    { rank: 2, name: 'Bamba Fatou', zone: 'Cocody', count: 298 },
    { rank: 3, name: 'Diaby Ibrahim', zone: 'Bouaké', count: 267 },
    { rank: 4, name: 'Soro Marie', zone: 'Yopougon', count: 231 },
    { rank: 5, name: 'Traoré Moussa', zone: 'Plateau', count: 198 },
  ]

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Top 5 Identificateurs</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1">
        {identificateurs.map((id) => (
          <div key={id.rank} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              id.rank === 1 ? 'bg-amber-100 text-amber-700' :
              id.rank === 2 ? 'bg-slate-100 text-slate-600' :
              id.rank === 3 ? 'bg-orange-100 text-orange-700' :
              'bg-slate-50 text-slate-400'
            }`}>
              {id.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{id.name}</p>
              <p className="text-xs text-slate-400">{id.zone}</p>
            </div>
            <Badge variant="secondary" className="font-semibold tabular-nums text-xs bg-slate-100 text-slate-600">
              {id.count}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataQualitySection() {
  const qualities = [
    { label: 'Photos valides', value: 98, color: '#10B981' },
    { label: 'GPS précis', value: 92, color: '#3B82F6' },
    { label: 'Téléphones vérifiés', value: 96, color: '#8B5CF6' },
  ]

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Qualité des Données</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-4">
        {qualities.map((q) => (
          <div key={q.label} className="flex items-center gap-4">
            <div className="relative flex-shrink-0 w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#F1F5F9" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="24" fill="none" stroke={q.color} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${(q.value / 100) * 150.8} 150.8`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">{q.value}%</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{q.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {q.value >= 95 ? 'Excellente qualité' : q.value >= 90 ? 'Qualité satisfaisante' : 'À améliorer'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemHealth() {
  const services = [
    { name: 'API Gateway', status: 'OK' as const, icon: Wifi },
    { name: 'Base de données', status: 'OK' as const, icon: Database },
    { name: 'Service STT', status: 'OK' as const, icon: Mic },
    { name: 'Service SMS', status: 'Lent' as const, icon: MessageSquare },
  ]

  const statusConfig = {
    OK: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', dot: 'bg-emerald-500' },
    Lent: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', dot: 'bg-amber-500' },
    Erreur: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', dot: 'bg-red-500' },
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Santé Système</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {services.map((svc) => {
          const cfg = statusConfig[svc.status]
          const IconComponent = svc.icon
          return (
            <div key={svc.name} className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
              <IconComponent className={`h-4 w-4 ${cfg.text}`} />
              <p className={`text-xs font-medium ${cfg.text} truncate`}>{svc.name}</p>
              <span className={`ml-auto h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuickAccessLinks() {
  const boNavigate = useBackofficeStore((s) => s.boNavigate)

  const links = [
    { label: 'Dossiers en attente', icon: <FolderOpen className="h-5 w-5" />, route: 'bo-enrolement' as const, count: 342, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Supervision', icon: <Eye className="h-5 w-5" />, route: 'bo-supervision' as const, count: undefined, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Rapports', icon: <FileBarChart className="h-5 w-5" />, route: 'bo-rapports' as const, count: undefined, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Acteurs', icon: <Users className="h-5 w-5" />, route: 'bo-acteurs' as const, count: undefined, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  ]

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-slate-900 font-semibold text-sm">Accès Rapide</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {links.map((link) => (
          <button
            key={link.label}
            onClick={() => boNavigate(link.route)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border ${link.border} ${link.bg} hover:opacity-80 transition-opacity text-left`}
          >
            <span className={link.color}>{link.icon}</span>
            <span className={`text-xs font-medium ${link.color} flex-1`}>{link.label}</span>
            {link.count !== undefined && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">{link.count}</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ============== MAIN COMPONENT ==============

export function BoDashboardScreen() {
  const { boUser } = useBackofficeStore()
  const firstName = boUser?.name?.split(' ')[0] || 'Admin'

  return (
    <div className="p-6 lg:p-8 space-y-6 bg-[#F8FAFC]">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back, {firstName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Bienvenue ! Voici un aperçu de l'activité de la plateforme Jùlaba.
          </p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg h-10 hidden sm:flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nouveau rapport
        </Button>
      </div>

      {/* 1. Real-time Ticker Bar */}
      <TickerBar />

      {/* 2. KPI Cards Grid */}
      <KpiGrid />

      {/* 3. Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RegionChart />
        <EnrolmentTrendChart />
      </div>

      {/* 4. Objectives + System Health + Data Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <NationalObjectives />
        <SystemHealth />
        <DataQualitySection />
      </div>

      {/* 5. Top Identificateurs + Quick Access */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <TopIdentificateurs />
        <QuickAccessLinks />
      </div>
    </div>
  )
}
