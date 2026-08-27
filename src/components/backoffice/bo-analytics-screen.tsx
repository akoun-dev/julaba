'use client'

import { useMemo } from 'react'
import {
  Users,
  Clock,
  BarChart3,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// ============== MOCK DATA ==============

// Generate 30 days of DAU data
function generateDAUData() {
  return Array.from({ length: 30 }, (_, i) => {
    const base = 3800
    const trend = i * 25
    const noise = Math.floor(Math.random() * 400 - 200)
    const weekend = (i % 7 >= 5) ? -300 : 0
    return {
      day: `J${i + 1}`,
      users: Math.max(2800, base + trend + noise + weekend),
    }
  })
}

const DAU_DATA = generateDAUData()

// Pie chart: Caisse 35%, Stock 20%, Ventes 15%, Voix 18%, Autres 12%
const FEATURE_USAGE = [
  { name: 'Caisse', value: 35, color: '#333333' },
  { name: 'Stock', value: 20, color: '#6B7280' },
  { name: 'Ventes', value: 15, color: '#D97706' },
  { name: 'Voix', value: 18, color: '#059669' },
  { name: 'Autres', value: 12, color: '#9CA3AF' },
]

const TOP_FEATURES = [
  { name: 'Enregistrement caisse', usage: '92%', sessions: 18450, trend: '+15%' },
  { name: 'Gestion du stock', usage: '78%', sessions: 15600, trend: '+9%' },
  { name: 'Tata Nanti Lou (Voix)', usage: '64%', sessions: 12800, trend: '+28%' },
  { name: 'Consultation rapports', usage: '52%', sessions: 10400, trend: '+6%' },
  { name: 'Recherche acteurs', usage: '47%', sessions: 9400, trend: '+4%' },
  { name: 'Marketplace', usage: '38%', sessions: 7600, trend: '+42%' },
]

const RETENTION_FUNNEL = [
  { step: 'Inscription', count: 12800, pct: '100%' },
  { step: '1ère connexion', count: 10500, pct: '82.0%' },
  { step: '1ère transaction', count: 7800, pct: '60.9%' },
  { step: '7 jours actifs', count: 5200, pct: '40.6%' },
  { step: '30 jours actifs', count: 3100, pct: '24.2%' },
]

// ============== MAIN COMPONENT ==============

export function BoAnalyticsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const gridStroke = isDark ? '#334155' : '#E2E8F0'
  const tickFill = isDark ? '#64748B' : '#6B7280'
  const tooltipStyle: React.CSSProperties = isDark
    ? { borderRadius: '8px', border: '1px solid #334155', fontSize: '12px', backgroundColor: '#1E293B', color: '#E2E8F0' }
    : { borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }

  const kpis = [
    { label: 'DAU (Utilisateurs actifs/jour)', value: '4 250', icon: <Users className="h-5 w-5" />, delta: '+8.2%', up: true },
    { label: 'MAU (Utilisateurs actifs/mois)', value: '12 800', icon: <BarChart3 className="h-5 w-5" />, delta: '+12.5%', up: true },
    { label: 'Durée session moyenne', value: '8.5 min', icon: <Clock className="h-5 w-5" />, delta: '+1.2 min', up: true },
    { label: 'Adoption fonctionnalités', value: '73%', icon: <TrendingUp className="h-5 w-5" />, delta: '+4%', up: true },
  ]

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-6 w-6" />ANALYTICS PRODUIT</span>
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Métriques d&apos;utilisation et adoption du produit Jùlaba
        </p>
      </div>

      <Separator />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>{kpi.icon}</div>
                <div className={`flex items-center gap-0.5 text-xs font-medium ${kpi.up ? 'text-emerald-600' : 'text-red-500'}`}>
                  {kpi.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {kpi.delta}
                </div>
              </div>
              <p className={`text-xs uppercase tracking-wide mt-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* DAU Line Chart */}
        <Card className={`border-0 lg:col-span-2 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              DAU sur 30 jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={DAU_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: tickFill }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: tickFill }} domain={[2500, 'auto']} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Utilisateurs']} />
                  <Line type="monotone" dataKey="users" stroke={isDark ? '#E2E8F0' : '#333333'} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: isDark ? '#E2E8F0' : '#333333' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Feature Usage Pie Chart */}
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Répartition d&apos;usage par fonctionnalité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={FEATURE_USAGE} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                    {FEATURE_USAGE.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, 'Usage']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
              {FEATURE_USAGE.map((f) => (
                <div key={f.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: f.color }} />
                  <span className={isDark ? 'text-slate-300' : 'text-gray-600'}>{f.name}</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>{f.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Features Table + Retention Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Features */}
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Top fonctionnalités
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fonctionnalité</TableHead>
                  <TableHead className="text-xs text-right">Usage</TableHead>
                  <TableHead className="text-xs text-right">Sessions</TableHead>
                  <TableHead className="text-xs text-right">Tendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_FEATURES.map((f) => (
                  <TableRow key={f.name}>
                    <TableCell className={`text-xs py-2.5 font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{f.name}</TableCell>
                    <TableCell className="text-xs py-2.5 text-right font-semibold">{f.usage}</TableCell>
                    <TableCell className={`text-xs py-2.5 text-right ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{f.sessions.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className="text-xs py-2.5 text-right">
                      <span className={`font-medium ${f.trend.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>
                        {f.trend}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Retention Funnel */}
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Entonnoir de rétention utilisateur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {RETENTION_FUNNEL.map((step, i) => {
              const maxCount = RETENTION_FUNNEL[0].count
              const widthPct = (step.count / maxCount) * 100
              const opacity = 1 - i * 0.15
              return (
                <div key={step.step} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{step.step}</span>
                    <div className="flex items-center gap-3">
                      <span className={`tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{typeof step.count === 'number' ? step.count.toLocaleString('fr-FR') : step.count}</span>
                      <span className={`font-semibold w-14 text-right ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{step.pct}</span>
                    </div>
                  </div>
                  <div className={`h-7 rounded-md overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <div
                      className="h-full rounded-md transition-all duration-700 flex items-center justify-end pr-2"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: isDark ? `rgba(226, 232, 240, ${opacity})` : `rgba(51, 51, 51, ${opacity})`,
                      }}
                    >
                      {widthPct > 25 && (
                        <span className="text-[10px] text-white font-medium">{step.pct}</span>
                      )}
                    </div>
                  </div>
                  {i < RETENTION_FUNNEL.length - 1 && (
                    <div className={`text-center text-[10px] ${isDark ? 'text-slate-600' : 'text-gray-300'}`}>↓</div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
