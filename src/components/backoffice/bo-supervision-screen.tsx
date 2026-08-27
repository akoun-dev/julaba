'use client'

import { useMemo } from 'react'
import {
  Users,
  Activity,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Shield,
  Database,
  Mic,
  MessageSquare,
  HardDrive,
  Wifi,
  ArrowUpDown,
  Eye,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  useBackofficeStore,
  BO_COLOR,
  SEVERITY_COLORS,
  type BoAlert,
} from '@/lib/stores/backoffice-store'

// ============== HELPERS ==============

function formatTimestamp(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'À l\'instant'
  if (minutes < 60) return `Il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `Il y a ${days}j`
}

const SEVERITY_CONFIG: Record<
  BoAlert['severity'],
  { label: string; color: string; border: string; bg: string; badge: string; icon: React.ReactNode }
> = {
  critique: {
    label: 'Critique',
    color: 'text-red-600',
    border: 'border-l-red-600',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-800 border-red-200',
    icon: <AlertOctagon className="h-4 w-4 text-red-600" />,
  },
  haute: {
    label: 'Haute',
    color: 'text-orange-600',
    border: 'border-l-orange-500',
    bg: 'bg-orange-50/60',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  },
  moyenne: {
    label: 'Moyenne',
    color: 'text-yellow-600',
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50/40',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: <Info className="h-4 w-4 text-yellow-600" />,
  },
  basse: {
    label: 'Basse',
    color: 'text-blue-600',
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/40',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <Info className="h-4 w-4 text-blue-600" />,
  },
}

const PLATFORM_METRICS = [
  { label: 'Temps réponse API', value: 142, max: 500, unit: 'ms', icon: <Zap className="h-4 w-4" />, color: 'text-emerald-600', progressColor: '[&>div]:bg-emerald-500' },
  { label: 'Connexions DB', value: 34, max: 100, unit: '', icon: <Database className="h-4 w-4" />, color: 'text-blue-600', progressColor: '[&>div]:bg-blue-500' },
  { label: 'Précision STT', value: 94.7, max: 100, unit: '%', icon: <Mic className="h-4 w-4" />, color: 'text-violet-600', progressColor: '[&>div]:bg-violet-500' },
  { label: 'Taux livraison SMS', value: 97.2, max: 100, unit: '%', icon: <MessageSquare className="h-4 w-4" />, color: 'text-teal-600', progressColor: '[&>div]:bg-teal-500' },
  { label: 'Stockage utilisé', value: 72, max: 100, unit: '%', icon: <HardDrive className="h-4 w-4" />, color: 'text-amber-600', progressColor: '[&>div]:bg-amber-500' },
  { label: 'Sessions actives', value: 847, max: 2000, unit: '', icon: <Wifi className="h-4 w-4" />, color: 'text-rose-600', progressColor: '[&>div]:bg-rose-500' },
]

// ============== COMPONENT ==============

export function BoSupervisionScreen() {
  const alerts = useBackofficeStore((s) => s.alerts)
  const acknowledgeAlert = useBackofficeStore((s) => s.acknowledgeAlert)
  const ticker = useBackofficeStore((s) => s.ticker)
  const actors = useBackofficeStore((s) => s.actors)
  const enrolments = useBackofficeStore((s) => s.enrolments)
  const auditLog = useBackofficeStore((s) => s.auditLog)

  const pendingEnrolments = useMemo(
    () => enrolments.filter((e) => e.status === 'en_attente').length,
    [enrolments]
  )

  const severityCounts = useMemo(() => {
    const counts = { critique: 0, haute: 0, moyenne: 0, basse: 0 }
    for (const a of alerts) {
      counts[a.severity]++
    }
    return counts
  }, [alerts])

  const unacknowledgedAlerts = useMemo(
    () => alerts.filter((a) => !a.acknowledged),
    [alerts]
  )

  const recentActivity = useMemo(() => auditLog.slice(0, 10), [auditLog])

  return (
    <div className="p-6 space-y-6">
      {/* ── TITLE ── */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center h-10 w-10 rounded-xl"
          style={{ backgroundColor: BO_COLOR }}
        >
          <Eye className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
            <span className="inline-flex items-center gap-2"><Eye className="h-6 w-6" />SUPERVISION</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Surveillance en temps réel de la plateforme Jùlaba
          </p>
        </div>
      </div>

      {/* ── 1. REAL-TIME METRICS BAR ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Utilisateurs actifs
              </p>
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {ticker.activeUsers.toLocaleString('fr-FR')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Transactions / min
              </p>
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {ticker.transactionsPerMin}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Enrôlements en attente
              </p>
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {pendingEnrolments}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Disponibilité système
              </p>
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {ticker.uptime}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. ALERT SEVERITY SUMMARY ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: BO_COLOR }}>
          Résumé des alertes
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['critique', 'haute', 'moyenne', 'basse'] as const).map((sev) => {
            const config = SEVERITY_CONFIG[sev]
            const count = severityCounts[sev]
            return (
              <Card
                key={sev}
                className={`border-l-4 ${config.border}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center h-9 w-9 rounded-lg ${SEVERITY_COLORS[sev]} text-white`}
                  >
                    {config.icon}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {config.label}
                    </p>
                    <p className="text-xl font-bold" style={{ color: BO_COLOR }}>
                      {count}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── 3. ALERT LIST ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: BO_COLOR }}>
            Alertes actives
          </h2>
          <Badge variant="outline" className="text-xs">
            {unacknowledgedAlerts.length} non acquittée(s)
          </Badge>
        </div>
        <ScrollArea className="max-h-96 overflow-y-auto">
          <div className="space-y-3">
            {alerts.map((alert) => {
              const config = SEVERITY_CONFIG[alert.severity]
              return (
                <Card
                  key={alert.id}
                  className={`border-l-4 ${config.border} ${alert.severity === 'critique' ? config.bg : ''} ${alert.acknowledged ? 'opacity-60' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5 flex-shrink-0">
                          {config.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3
                              className="font-semibold text-sm"
                              style={{ color: BO_COLOR }}
                            >
                              {alert.title}
                            </h3>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${config.badge}`}
                            >
                              {config.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {alert.module}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {alert.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(alert.timestamp)}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {alert.acknowledged ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Acquittée
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 gap-1"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Acquitter
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {alerts.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucune alerte active</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── 4. PLATFORM OVERVIEW ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: BO_COLOR }}>
          Vue d'ensemble de la plateforme
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORM_METRICS.map((m) => {
            const pct = Math.min(100, (m.value / m.max) * 100)
            return (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`${m.color}`}>{m.icon}</div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {m.label}
                      </span>
                    </div>
                    <span className={`text-lg font-bold ${m.color}`}>
                      {m.value}{m.unit}
                    </span>
                  </div>
                  <Progress value={pct} className={`h-2 ${m.progressColor}`} />
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
                    {pct.toFixed(1)}% de la capacité
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── 5. RECENT ACTIVITY FEED ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: BO_COLOR }}>
          Activité récente
        </h2>
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="divide-y">
                {recentActivity.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div
                        className="flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: BO_COLOR }}
                      >
                        {idx + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: BO_COLOR }}
                        >
                          {entry.userName}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {entry.action}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {entry.module}
                        </Badge>
                      </div>
                      {entry.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {entry.details}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    Aucune activité récente
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
