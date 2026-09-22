'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Bot,
  Brain,
  Zap,
  Activity,
  AlertCircle,
  Clock,
  Server,
  TrendingUp,
  TrendingDown,
  Cpu,
  MemoryStick,
  Thermometer,
  RefreshCw,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ============== TYPES ==============

interface ModelError {
  id: string
  timestamp: string
  errorType: string
  message: string
  input: string
  severity: string
  resolved: boolean
}

interface MonitoringData {
  dailyRequests: { day: string; requests: number }[]
  modelErrors: ModelError[]
  modelVersion: {
    version: string
    model: string
    deployedAt: string
    previousVersion: string
    accuracy: string
    parameters: string
    contextWindow: string
    provider: string
  }
  systemMetrics: { label: string; value: number; color: string }[]
  accuracy: string
  responseTime: string
  dailyRequestCount: string
  errorRate: string
}

// ============== MAIN COMPONENT ==============

export function BoMonitoringIaScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'

  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null)
  const [errorFilter, setErrorFilter] = useState<string>('tous')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/monitoring')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const SEVERITY_COLOR: Record<string, string> = {
    critique: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700',
    haute: isDark ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-100 text-orange-700',
    moyenne: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700',
    basse: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600',
  }

  const gridStroke = isDark ? '#334155' : '#E2E8F0'
  const tickFill = isDark ? '#64748B' : '#6B7280'
  const tooltipStyle: React.CSSProperties = isDark
    ? { borderRadius: '8px', border: '1px solid #334155', fontSize: '12px', backgroundColor: '#1E293B', color: '#E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }
    : { borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }

  const filteredErrors = useMemo(() => {
    if (!data) return []
    return data.modelErrors.filter((e) => {
      if (errorFilter === 'tous') return true
      if (errorFilter === 'active') return !e.resolved
      return e.resolved
    })
  }, [data, errorFilter])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData().finally(() => setIsRefreshing(false))
  }

  const kpis = data ? [
    { label: 'Précision (Accuracy)', value: data.accuracy, icon: <Brain className="h-5 w-5" />, color: 'text-emerald-600', bgColor: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50', delta: '+1.2%', deltaUp: true, desc: 'vs semaine préc.' },
    { label: 'Temps de réponse moyen', value: data.responseTime, icon: <Zap className="h-5 w-5" />, color: 'text-amber-600', bgColor: isDark ? 'bg-amber-500/15' : 'bg-amber-50', delta: '-0.3s', deltaUp: false, desc: 'vs semaine préc.' },
    { label: 'Requêtes quotidiennes', value: data.dailyRequestCount, icon: <Activity className="h-5 w-5" />, color: isDark ? 'text-slate-300' : 'text-gray-700', bgColor: isDark ? 'bg-slate-700' : 'bg-gray-100', delta: '+12%', deltaUp: true, desc: 'vs hier' },
    { label: "Taux d'erreur", value: data.errorRate, icon: <AlertCircle className="h-5 w-5" />, color: 'text-red-600', bgColor: isDark ? 'bg-red-500/10' : 'bg-red-50', delta: '-0.2%', deltaUp: false, desc: 'vs hier' },
  ] : []

  const activeErrorCount = data ? data.modelErrors.filter(e => !e.resolved).length : 0
  const totalErrorCount = data ? data.modelErrors.length : 0
  const resolvedErrorCount = data ? data.modelErrors.filter(e => e.resolved).length : 0

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')} style={{ minHeight: '100%' }}>
      {/* Header */}
      <BoPageHeader
        title="Monitoring IA"
        description="Performance du modèle Tata Nanti Lou — KPI, erreurs et versions"
        actions={
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`text-xs px-3 py-1.5 ${isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              Modèle actif
            </Badge>
            <Button variant="outline" size="sm" className="h-8" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
          </div>
        }
      />

      <Separator />

      {/* Error State */}
      {error && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* KPI Cards */}
      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <Skeleton className={`h-10 w-10 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                      <Skeleton className={`h-4 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    </div>
                    <Skeleton className={`h-3 w-36 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-7 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-3 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                  </CardContent>
                </Card>
              ))
            : kpis.map((kpi) => (
                <Card
                  key={kpi.label}
                  className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'} hover:shadow-md transition-[box-shadow] duration-200 cursor-pointer ${selectedKpi === kpi.label ? 'ring-2 ring-offset-2' : ''}`}
                  onClick={() => setSelectedKpi(selectedKpi === kpi.label ? null : kpi.label)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className={`p-2.5 rounded-xl ${kpi.bgColor} ${kpi.color}`}>
                        {kpi.icon}
                      </div>
                      <div className={`flex items-center gap-0.5 text-xs font-medium ${kpi.deltaUp ? 'text-emerald-600' : 'text-red-600'}`}>
                        {kpi.deltaUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {kpi.delta}
                      </div>
                    </div>
                    <p className={`text-[11px] uppercase tracking-wider font-medium mt-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{kpi.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{kpi.desc}</p>
                  </CardContent>
                </Card>
              ))
          }
        </div>
      )}

      {/* Chart + Model Info + System Metrics */}
      {!error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Daily Requests Chart */}
          <Card className={`border-0 lg:col-span-2 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <Activity className="h-4 w-4" />
                Requêtes quotidiennes (7 jours)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dailyRequests}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Requêtes']}
                      cursor={{ fill: isDark ? 'rgba(226,232,240,0.05)' : 'rgba(51,51,51,0.05)' }}
                    />
                    <Bar dataKey="requests" radius={[6, 6, 0, 0]}>
                      {data.dailyRequests.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.day === 'Jeu' ? (isDark ? '#E2E8F0' : '#333333') : (isDark ? '#475569' : '#D1D5DB')}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Model Version + System Metrics */}
          <div className="space-y-4">
            {/* Model Version Info */}
            <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Server className="h-4 w-4" />
                  Info modèle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Version</span>
                    <Badge variant="secondary" className="font-mono text-xs">{data.modelVersion.version}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Modèle</span>
                    <span className={`font-mono text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{data.modelVersion.model}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Paramètres</span>
                    <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{data.modelVersion.parameters}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Context Window</span>
                    <span className={`font-mono text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{data.modelVersion.contextWindow}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Fournisseur</span>
                    <span className={`text-xs text-right max-w-[150px] truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{data.modelVersion.provider}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Déployé le</span>
                    <span className={`text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatDate(data.modelVersion.deployedAt)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Version préc.</span>
                    <span className={`font-mono text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{data.modelVersion.previousVersion}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Resources */}
            <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Cpu className="h-4 w-4" />
                  Ressources système
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.systemMetrics.map((metric) => (
                  <div key={metric.label} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{metric.label}</span>
                      <span className={`font-medium ${metric.value > 75 ? 'text-amber-600' : (isDark ? 'text-slate-300' : 'text-gray-700')}`}>{metric.value}%</span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${metric.color}`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Loading skeleton for chart section */}
      {!error && loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className={`border-0 lg:col-span-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'shadow-sm'}`}>
            <CardHeader className="pb-2">
              <Skeleton className={`h-5 w-56 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
            </CardHeader>
            <CardContent>
              <Skeleton className={`h-64 w-full rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'shadow-sm'}`}>
              <CardHeader className="pb-2">
                <Skeleton className={`h-5 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className={`h-4 w-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'shadow-sm'}`}>
              <CardHeader className="pb-2">
                <Skeleton className={`h-5 w-36 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className={`h-3 w-full mb-1.5 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-2 w-full rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent Model Errors */}
      {!error && data && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <AlertCircle className="h-4 w-4 text-red-500" />
                Erreurs récentes du modèle
                <Badge variant="secondary" className="text-[10px] ml-1">{activeErrorCount} actives</Badge>
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={errorFilter === 'tous' ? 'secondary' : 'ghost'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setErrorFilter('tous')}
                >
                  Toutes ({totalErrorCount})
                </Button>
                <Button
                  variant={errorFilter === 'active' ? 'secondary' : 'ghost'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setErrorFilter('active')}
                >
                  Actives ({activeErrorCount})
                </Button>
                <Button
                  variant={errorFilter === 'resolved' ? 'secondary' : 'ghost'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setErrorFilter('resolved')}
                >
                  Résolues ({resolvedErrorCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Heure</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Message</TableHead>
                  <TableHead className="text-xs">Input</TableHead>
                  <TableHead className="text-xs">Sévérité</TableHead>
                  <TableHead className="text-xs text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredErrors.map((err) => (
                  <TableRow key={err.id} className={!err.resolved ? (isDark ? 'bg-red-500/5' : 'bg-red-50/30') : ''}>
                    <TableCell className={`text-xs py-2.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatDate(err.timestamp)}
                      </span>
                    </TableCell>
                    <TableCell className={`text-xs py-2.5 font-mono font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{err.errorType}</TableCell>
                    <TableCell className={`text-xs py-2.5 max-w-[250px] truncate ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{err.message}</TableCell>
                    <TableCell className={`text-xs py-2.5 max-w-[180px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{err.input}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium ${SEVERITY_COLOR[err.severity]}`}>
                        {err.severity.charAt(0).toUpperCase() + err.severity.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5 text-center">
                      {err.resolved ? (
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Résolu</Badge>
                      ) : (
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700'}`}>Actif</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton for errors table */}
      {!error && loading && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'shadow-sm'}`}>
          <CardHeader className="pb-2">
            <Skeleton className={`h-5 w-56 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          </CardHeader>
          <CardContent>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-2.5">
                <Skeleton className={`h-4 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-4 w-48 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-4 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-14 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}