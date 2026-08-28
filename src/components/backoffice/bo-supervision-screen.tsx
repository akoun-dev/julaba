'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Shield,
  Users,
  Wifi,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useBackofficeStore,
  type BoAlert,
  type DashboardData,
} from '@/lib/stores/backoffice-store'
import { BoErrorBanner, BoEmptyState, BoPageHeader } from './bo-ui'

type AlertFilter = 'toutes' | 'non_acquittees' | 'critiques' | 'sante_systeme'
type Severity = BoAlert['severity']

const SEVERITY_ORDER: Severity[] = ['critique', 'haute', 'moyenne', 'basse']

const FILTERS: { key: AlertFilter; label: string }[] = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'non_acquittees', label: 'Non acquittées' },
  { key: 'critiques', label: 'Critiques' },
  { key: 'sante_systeme', label: 'Santé système' },
]

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  return `Il y a ${Math.floor(hours / 24)} j`
}

function isSystemAlert(alert: BoAlert) {
  const module = alert.module.toLowerCase()
  return ['système', 'systeme', 'api', 'bdd', 'sms', 'keiwa'].some((term) => module.includes(term))
}

function severityConfig(severity: Severity, isDark: boolean) {
  const configs = {
    critique: {
      label: 'Critique',
      border: isDark ? 'border-red-500/70' : 'border-red-300',
      bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
      badge: isDark ? 'border-red-500/30 bg-red-500/15 text-red-300' : 'border-red-200 bg-red-100 text-red-800',
      icon: <AlertOctagon className="h-4 w-4 text-red-500" />,
    },
    haute: {
      label: 'Haute',
      border: isDark ? 'border-orange-500/70' : 'border-orange-300',
      bg: isDark ? 'bg-orange-500/10' : 'bg-orange-50',
      badge: isDark ? 'border-orange-500/30 bg-orange-500/15 text-orange-300' : 'border-orange-200 bg-orange-100 text-orange-800',
      icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
    },
    moyenne: {
      label: 'Moyenne',
      border: isDark ? 'border-yellow-500/70' : 'border-yellow-300',
      bg: isDark ? 'bg-yellow-500/10' : 'bg-yellow-50',
      badge: isDark ? 'border-yellow-500/30 bg-yellow-500/15 text-yellow-300' : 'border-yellow-200 bg-yellow-100 text-yellow-800',
      icon: <Info className="h-4 w-4 text-yellow-500" />,
    },
    basse: {
      label: 'Basse',
      border: isDark ? 'border-blue-500/70' : 'border-blue-300',
      bg: isDark ? 'bg-blue-500/10' : 'bg-blue-50',
      badge: isDark ? 'border-blue-500/30 bg-blue-500/15 text-blue-300' : 'border-blue-200 bg-blue-100 text-blue-800',
      icon: <Info className="h-4 w-4 text-blue-500" />,
    },
  }
  return configs[severity]
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  isDark,
}: {
  label: string
  value: string | number
  icon: typeof Users
  tone: 'emerald' | 'blue' | 'amber'
  isDark: boolean
}) {
  const tones = {
    emerald: isDark ? 'text-emerald-300 bg-emerald-500/10' : 'text-emerald-700 bg-emerald-50',
    blue: isDark ? 'text-blue-300 bg-blue-500/10' : 'text-blue-700 bg-blue-50',
    amber: isDark ? 'text-amber-300 bg-amber-500/10' : 'text-amber-700 bg-amber-50',
  }
  return (
    <div className={`flex min-w-0 items-center gap-3 border-r px-4 py-2.5 last:border-r-0 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
        <span className={`block text-lg font-bold tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</span>
      </span>
    </div>
  )
}

function HealthPanel({ dashboard, isDark }: { dashboard: DashboardData | null; isDark: boolean }) {
  const health = dashboard?.systemHealth ?? []
  return (
    <section className={`rounded-2xl border ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div>
          <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Santé système</h2>
          <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>État des services principaux</p>
        </div>
        <Wifi className={isDark ? 'h-4 w-4 text-emerald-400' : 'h-4 w-4 text-emerald-600'} />
      </div>
      {health.length > 0 ? (
        <div className="space-y-1 p-3">
          {health.map((service) => {
            const isOk = service.status === 'operationnel' || service.status === 'OK'
            return (
              <div key={service.name} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${isDark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-50'}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className={`truncate text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{service.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {service.latency > 0 && <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{service.latency} ms</span>}
                  <Badge className={isOk ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>{isOk ? 'Opérationnel' : service.status}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`p-5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Les données de santé système ne sont pas disponibles.</div>
      )}
    </section>
  )
}

export function BoSupervisionScreen() {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const isDark = boTheme === 'dark'
  const alerts = useBackofficeStore((s) => s.alerts)
  const acknowledgeAlert = useBackofficeStore((s) => s.acknowledgeAlert)
  const ticker = useBackofficeStore((s) => s.ticker)
  const enrolments = useBackofficeStore((s) => s.enrolments)
  const auditLog = useBackofficeStore((s) => s.auditLog)
  const loading = useBackofficeStore((s) => s.loading)
  const error = useBackofficeStore((s) => s.error)
  const dashboard = useBackofficeStore((s) => s.dashboard)
  const fetchAllData = useBackofficeStore((s) => s.fetchAllData)
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('toutes')

  useEffect(() => {
    if (!dashboard && !loading) fetchAllData()
  }, [dashboard, loading, fetchAllData])

  const pendingEnrolments = useMemo(() => enrolments.filter((e) => e.status === 'en_attente').length, [enrolments])
  const unacknowledgedAlerts = useMemo(() => alerts.filter((alert) => !alert.acknowledged), [alerts])
  const severityCounts = useMemo(() => {
    const counts = { critique: 0, haute: 0, moyenne: 0, basse: 0 }
    alerts.forEach((alert) => { counts[alert.severity] += 1 })
    return counts
  }, [alerts])
  const filterCounts: Record<AlertFilter, number> = {
    toutes: alerts.length,
    non_acquittees: unacknowledgedAlerts.length,
    critiques: severityCounts.critique,
    sante_systeme: alerts.filter(isSystemAlert).length,
  }
  const filteredAlerts = useMemo(() => {
    const visible = alerts.filter((alert) => {
      if (alertFilter === 'non_acquittees') return !alert.acknowledged
      if (alertFilter === 'critiques') return alert.severity === 'critique'
      if (alertFilter === 'sante_systeme') return isSystemAlert(alert)
      return true
    })
    return [...visible].sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1
      const severityDifference = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      if (severityDifference !== 0) return severityDifference
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })
  }, [alertFilter, alerts])
  const recentActivity = useMemo(() => auditLog.slice(0, 10), [auditLog])

  return (
    <div className={`screen-enter min-h-full p-4 sm:p-6 lg:p-8 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <div className="flex w-full flex-col gap-5">
        <BoPageHeader
          title="Supervision"
          description="Identifiez les incidents et traitez les alertes prioritaires de la plateforme Jùlaba."
          actions={
            <Button variant="outline" onClick={() => fetchAllData()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Actualiser
            </Button>
          }
        />

        {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}

        <div className={`grid grid-cols-2 overflow-hidden rounded-2xl border sm:grid-cols-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}`}>
          <Metric label="Utilisateurs actifs" value={ticker.activeUsers.toLocaleString('fr-FR')} icon={Users} tone="emerald" isDark={isDark} />
          <Metric label="Transactions / min" value={ticker.transactionsPerMin} icon={Activity} tone="blue" isDark={isDark} />
          <Metric label="Enrôlements en attente" value={pendingEnrolments} icon={Clock} tone="amber" isDark={isDark} />
          <Metric label="Disponibilité système" value={`${ticker.uptime}%`} icon={Wifi} tone="emerald" isDark={isDark} />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
          <section className={`min-w-0 rounded-2xl border ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}`}>
            <div className={`border-b px-5 py-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Alertes à traiter</h2>
                  <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{unacknowledgedAlerts.length} alerte{unacknowledgedAlerts.length > 1 ? 's' : ''} non acquittée{unacknowledgedAlerts.length > 1 ? 's' : ''}</p>
                </div>
                <Badge variant="outline" className="text-xs">{filteredAlerts.length} affichée{filteredAlerts.length > 1 ? 's' : ''}</Badge>
              </div>
              <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter.key}
                    type="button"
                    size="sm"
                    variant={alertFilter === filter.key ? 'default' : 'ghost'}
                    onClick={() => setAlertFilter(filter.key)}
                    className={`shrink-0 gap-1.5 text-xs ${alertFilter === filter.key ? 'bg-blue-600 text-white hover:bg-blue-700' : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {filter.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${alertFilter === filter.key ? 'bg-white/20' : isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>{filterCounts[filter.key]}</span>
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="max-h-[560px] overflow-y-auto">
              <div className="space-y-3 p-4">
                {filteredAlerts.map((alert) => {
                  const config = severityConfig(alert.severity, isDark)
                  return (
                    <article key={alert.id} className={`rounded-xl border border-l-4 p-4 ${config.border} ${config.bg} ${alert.acknowledged ? 'opacity-60' : ''}`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 shrink-0">{config.icon}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{alert.title}</h3>
                              <Badge variant="outline" className={`text-[10px] ${config.badge}`}>{config.label}</Badge>
                              <Badge variant="outline" className="text-[10px]">{alert.module}</Badge>
                            </div>
                            <p className={`mt-1.5 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{alert.message}</p>
                            <p className={`mt-2 flex items-center gap-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`} title={formatTimestamp(alert.timestamp)}>
                              <Clock className="h-3 w-3" /> {timeAgo(alert.timestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 sm:pt-0.5">
                          {alert.acknowledged ? (
                            <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" /> Acquittée</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => acknowledgeAlert(alert.id)} className="h-9 w-full gap-1.5 text-xs sm:w-auto">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Acquitter
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
                {filteredAlerts.length === 0 && (
                  <BoEmptyState
                    icon={alertFilter === 'non_acquittees' ? CheckCircle2 : Shield}
                    title={alertFilter === 'non_acquittees' ? 'Tout est traité' : 'Aucune alerte trouvée'}
                    description={alertFilter === 'non_acquittees' ? 'Aucune alerte ne nécessite votre attention.' : 'Aucune alerte ne correspond à ce filtre.'}
                  />
                )}
              </div>
            </ScrollArea>
          </section>

          <HealthPanel dashboard={dashboard} isDark={isDark} />
        </div>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Activité récente</h2>
              <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dernières actions enregistrées dans le Backoffice</p>
            </div>
          </div>
          <Card className={isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}>
            <CardContent className="p-0">
              {recentActivity.length > 0 ? (
                <div className="divide-y">
                  {recentActivity.map((entry) => (
                    <div key={entry.id} className={`flex items-center gap-3 px-4 py-3.5 ${isDark ? 'divide-slate-700 hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                      <Shield className={`h-4 w-4 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.action}<span className={`font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}> · {entry.module}</span></p>
                        <p className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{entry.userName}{entry.details ? ` · ${entry.details}` : ''}</p>
                      </div>
                      <span className={`shrink-0 whitespace-nowrap text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{timeAgo(entry.timestamp)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`p-5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Aucune activité récente.</div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
