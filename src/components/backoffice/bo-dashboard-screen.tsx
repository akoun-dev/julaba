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
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useBackofficeStore, BO_COLOR } from '@/lib/stores/backoffice-store'

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

function PulseDot({ color = 'bg-emerald-400' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`}
      />
      <span
        className={`relative inline-flex rounded-full h-2 w-2 ${color}`}
      />
    </span>
  )
}

function TickerBar() {
  const ticker = useBackofficeStore((s) => s.ticker)

  const items = useMemo(
    () => [
      {
        label: 'Transactions/min',
        value: ticker.transactionsPerMin.toString(),
        color: 'text-emerald-400',
        dotColor: 'bg-emerald-400',
      },
      {
        label: 'Enrôlements/h',
        value: ticker.enrolmentsPerHour.toString(),
        color: 'text-amber-400',
        dotColor: 'bg-amber-400',
      },
      {
        label: 'Uptime',
        value: `${ticker.uptime}%`,
        color: 'text-emerald-400',
        dotColor: 'bg-emerald-400',
      },
      {
        label: 'Utilisateurs actifs',
        value: ticker.activeUsers.toLocaleString('fr-FR'),
        color: 'text-gray-300',
        dotColor: 'bg-gray-400',
      },
    ],
    [ticker]
  )

  return (
    <div
      className="rounded-xl px-6 py-3 flex flex-wrap items-center gap-6 md:gap-10"
      style={{ backgroundColor: '#1a1a1a' }}
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <PulseDot color={item.dotColor} />
          <span className="text-xs text-gray-400 hidden sm:inline">
            {item.label}
          </span>
          <span className={`text-sm font-semibold ${item.color}`}>
            {item.value}
          </span>
        </div>
      ))}
      <div className="ml-auto hidden md:flex items-center gap-1.5 text-gray-500">
        <Activity className="h-3 w-3" />
        <span className="text-xs">Temps réel</span>
      </div>
    </div>
  )
}

function KpiCard({ item }: { item: KpiItem }) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-md transition-shadow duration-200 border-gray-100">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
            {item.label}
          </p>
          <p className="text-2xl font-bold mt-1.5" style={{ color: BO_COLOR }}>
            {item.value}
          </p>
          {item.trend && (
            <div className="mt-2 flex items-center gap-1">
              {item.trendType === 'positive' ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              ) : item.trendType === 'negative' ? (
                <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
              ) : null}
              <span
                className={`text-xs font-semibold ${
                  item.trendType === 'positive'
                    ? 'text-emerald-600'
                    : item.trendType === 'negative'
                    ? 'text-red-500'
                    : 'text-gray-500'
                }`}
              >
                {item.trend}
              </span>
            </div>
          )}
        </div>
        <div
          className={`flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-full ${item.iconBg}`}
        >
          {item.icon}
        </div>
      </div>
    </Card>
  )
}

function KpiGrid() {
  const kpis: KpiItem[] = [
    {
      label: 'Total Acteurs',
      value: '12 450',
      trend: '+12% ↑',
      trendType: 'positive',
      icon: <Users className="h-5 w-5 text-white" />,
      iconBg: 'bg-gray-700',
    },
    {
      label: 'Actifs',
      value: '9 845',
      trend: '79%',
      trendType: 'neutral',
      icon: <UserCheck className="h-5 w-5 text-white" />,
      iconBg: 'bg-emerald-600',
    },
    {
      label: 'Volume FCFA/h',
      value: '2.3M',
      trend: '+8% ↑',
      trendType: 'positive',
      icon: <TrendingUp className="h-5 w-5 text-white" />,
      iconBg: 'bg-gray-800',
    },
    {
      label: 'Suspendus',
      value: '127',
      trend: '+3 ↑',
      trendType: 'negative',
      icon: <UserX className="h-5 w-5 text-white" />,
      iconBg: 'bg-red-500',
    },
    {
      label: 'En attente',
      value: '342',
      trend: '-5 ↓',
      trendType: 'positive',
      icon: <Clock className="h-5 w-5 text-white" />,
      iconBg: 'bg-amber-500',
    },
    {
      label: 'Transactions/jour',
      value: '45 678',
      icon: <CreditCard className="h-5 w-5 text-white" />,
      iconBg: 'bg-gray-600',
    },
    {
      label: 'Zones actives',
      value: '14/18',
      icon: <MapPin className="h-5 w-5 text-white" />,
      iconBg: 'bg-gray-700',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
    <Card
      className="p-6 shadow-sm border-0"
      style={{ backgroundColor: '#2a2a2a' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">
            Objectifs Nationaux 2026
          </h3>
          <p className="text-gray-400 text-xs mt-0.5">
            Cible d'enrôlement marchands
          </p>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
          83%
        </Badge>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-lg font-bold">12 450</span>
        <span className="text-gray-400 text-sm">sur 15 000</span>
      </div>
      <Progress
        value={animatedProgress}
        className="h-3 bg-gray-700 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-emerald-400"
      />
      <p className="text-gray-500 text-xs mt-2">
        Il reste <span className="text-gray-300 font-medium">2 550</span> acteurs
        à enrôler pour atteindre l'objectif
      </p>
    </Card>
  )
}

function RegionChart() {
  const data = [
    { name: 'Abidjan', value: 6245, fill: '#333333' },
    { name: 'Bouaké', value: 1890, fill: '#4a4a4a' },
    { name: 'Yamoussoukro', value: 1245, fill: '#5c5c5c' },
    { name: 'Daloa', value: 890, fill: '#6e6e6e' },
    { name: 'Korhogo', value: 670, fill: '#808080' },
    { name: 'San-Pédro', value: 510, fill: '#919191' },
    { name: 'Autres', value: 3000, fill: '#a3a3a3' },
  ]

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Activité par Région
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#f0f0f0"
              />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={95}
                tick={{ fontSize: 12, fill: '#555' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '13px',
                }}
                formatter={(value: number) => [
                  value.toLocaleString('fr-FR'),
                  'Acteurs',
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function EnrolmentTrendChart() {
  const enrolments = useBackofficeStore((s) => s.enrolments)

  // Generate last 7 days of enrolment counts from store + static data
  const data = useMemo(() => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const baseCounts = [145, 178, 162, 198, 210, 87, 45]
    // Mix in enrolment data from store
    const todayValidated = enrolments.filter(
      (e) => e.status === 'valide'
    ).length
    return days.map((day, i) => ({
      name: day,
      enrôlements: i === 6 ? todayValidated * 3 + 45 : baseCounts[i],
    }))
  }, [enrolments])

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Tendance d'Enrôlement (7 jours)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="enrolGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#333333" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#333333" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#888' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '13px',
                }}
                formatter={(value: number) => [
                  value.toLocaleString('fr-FR'),
                  'Enrôlements',
                ]}
              />
              <Area
                type="monotone"
                dataKey="enrôlements"
                stroke="#333333"
                strokeWidth={2}
                fill="url(#enrolGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function TopIdentificateurs() {
  const identificateurs = [
    { rank: 1, name: 'Kouadio Jean', zone: 'Adjamé', count: 342, medal: '🥇' },
    { rank: 2, name: 'Bamba Fatou', zone: 'Cocody', count: 298, medal: '🥈' },
    { rank: 3, name: 'Diaby Ibrahim', zone: 'Bouaké', count: 267, medal: '🥉' },
    { rank: 4, name: 'Soro Marie', zone: 'Yopougon', count: 231, medal: '4.' },
    { rank: 5, name: 'Traoré Moussa', zone: 'Plateau', count: 198, medal: '5.' },
  ]

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Top 5 Identificateurs
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-3">
          {identificateurs.map((id) => (
            <div
              key={id.rank}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-lg w-8 text-center font-bold">
                {id.medal}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: BO_COLOR }}>
                  {id.name}
                </p>
                <p className="text-xs text-gray-400">{id.zone}</p>
              </div>
              <Badge
                variant="secondary"
                className="font-semibold tabular-nums text-xs"
              >
                {id.count}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DataQualitySection() {
  const qualities = [
    { label: 'Photos valides', value: 98, color: 'bg-emerald-500' },
    { label: 'GPS précis', value: 92, color: 'bg-emerald-500' },
    { label: 'Téléphones vérifiés', value: 96, color: 'bg-emerald-500' },
  ]

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Qualité des Données
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-5">
          {qualities.map((q) => (
            <div key={q.label} className="flex items-center gap-4">
              {/* Circular progress indicator */}
              <div className="relative flex-shrink-0 w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke="#f0f0f0"
                    strokeWidth="4"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke={q.color === 'bg-emerald-500' ? '#10b981' : '#f59e0b'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(q.value / 100) * 150.8} 150.8`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: BO_COLOR }}>
                  {q.value}%
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: BO_COLOR }}>
                  {q.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {q.value >= 95
                    ? 'Excellente qualité'
                    : q.value >= 90
                    ? 'Qualité satisfaisante'
                    : 'À améliorer'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
    OK: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      label: 'OK',
    },
    Lent: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
      label: 'Lent',
    },
    Erreur: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      dot: 'bg-red-500',
      label: 'Erreur',
    },
  }

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Santé Système
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 gap-3">
          {services.map((svc) => {
            const cfg = statusConfig[svc.status]
            const IconComponent = svc.icon
            return (
              <div
                key={svc.name}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
              >
                <IconComponent className={`h-4 w-4 ${cfg.text}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${cfg.text} truncate`}>
                    {svc.name}
                  </p>
                </div>
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickAccessLinks() {
  const boNavigate = useBackofficeStore((s) => s.boNavigate)

  const links = [
    {
      label: 'Dossiers en attente',
      icon: <FolderOpen className="h-5 w-5" />,
      route: 'bo-enrolement' as const,
      count: 342,
      bg: 'bg-amber-50 hover:bg-amber-100',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    {
      label: 'Supervision',
      icon: <Eye className="h-5 w-5" />,
      route: 'bo-supervision' as const,
      bg: 'bg-gray-50 hover:bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-200',
    },
    {
      label: 'Rapports',
      icon: <FileBarChart className="h-5 w-5" />,
      route: 'bo-rapports' as const,
      bg: 'bg-gray-50 hover:bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-200',
    },
    {
      label: 'Acteurs',
      icon: <Users className="h-5 w-5" />,
      route: 'bo-acteurs' as const,
      bg: 'bg-gray-50 hover:bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-200',
    },
  ]

  return (
    <Card className="p-6 shadow-sm border-gray-100">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
          Accès Rapide
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 gap-3">
          {links.map((link) => (
            <Button
              key={link.label}
              variant="outline"
              className={`h-auto py-4 px-4 flex flex-col items-center gap-2.5 border ${link.border} ${link.bg} transition-colors`}
              onClick={() => boNavigate(link.route)}
            >
              <span className={link.text}>{link.icon}</span>
              <span className={`text-xs font-medium ${link.text}`}>
                {link.label}
              </span>
              {'count' in link && link.count && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {link.count}
                </Badge>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============== MAIN COMPONENT ==============

export function BoDashboardScreen() {
  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: '#F8F9FA' }}>
      {/* Page Title */}
      <div>
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ color: BO_COLOR }}
        >
          📊 TABLEAU DE BORD NATIONAL
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Vue d'ensemble de la plateforme Jùlaba — Dernière mise à jour :{' '}
          {new Date().toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* 1. Real-time Ticker Bar */}
      <TickerBar />

      {/* 2. KPI Cards Grid */}
      <KpiGrid />

      {/* 3. National Objectives + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NationalObjectives />
        <div className="space-y-6">
          <SystemHealth />
          <DataQualitySection />
        </div>
      </div>

      {/* 4. Charts Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RegionChart />
        <EnrolmentTrendChart />
      </div>

      {/* 5. Top Identificateurs + Quick Access */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopIdentificateurs />
        <QuickAccessLinks />
      </div>
    </div>
  )
}
