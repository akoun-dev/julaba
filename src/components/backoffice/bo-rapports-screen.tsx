'use client'

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  BarChart3,
  Calendar,
  Clock,
  FileSpreadsheet,
  FileText,
  FileJson,
  FileDown,
  Timer,
  TrendingUp,
  ArrowRight,
  Users,
  Activity,
  AlertTriangle,
  MapPin,
  BarChart2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader } from './bo-ui'

// ============== TYPES ==============

interface ReportType {
  id: string
  name: string
  frequency: string
  frequencyLabel: string
  description: string
  lastGenerated: string
  nextGeneration: string
  status: 'generated' | 'scheduled' | 'manual'
  icon: React.ReactNode
}

// ============== REPORT TYPE DEFINITIONS ==============

const REPORT_TYPES: ReportType[] = [
  {
    id: 'quotidien',
    name: 'Quotidien',
    frequency: '6h00',
    frequencyLabel: 'Auto — Tous les jours à 6h00',
    description: 'Synthèse journalière des opérations, performances et incidents.',
    lastGenerated: '2026-08-27T06:00:00Z',
    nextGeneration: '2026-08-28T06:00:00Z',
    status: 'generated',
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    id: 'hebdomadaire',
    name: 'Hebdomadaire',
    frequency: 'lundi 7h00',
    frequencyLabel: 'Auto — Chaque lundi à 7h00',
    description: 'Analyse hebdomadaire des tendances et comparaisons inter-périodes.',
    lastGenerated: '2026-08-25T07:00:00Z',
    nextGeneration: '2026-09-01T07:00:00Z',
    status: 'generated',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    id: 'mensuel',
    name: 'Mensuel',
    frequency: '1er du mois',
    frequencyLabel: 'Auto — Le 1er de chaque mois à 6h00',
    description: 'Rapport mensuel complet : tendances, impact social, inclusion financière.',
    lastGenerated: '2026-08-01T06:00:00Z',
    nextGeneration: '2026-09-01T06:00:00Z',
    status: 'scheduled',
    icon: <BarChart2 className="h-5 w-5" />,
  },
  {
    id: 'trimestriel',
    name: 'Trimestriel',
    frequency: 'manuel',
    frequencyLabel: 'Manuel — Généré sur demande',
    description: 'Évaluation trimestrielle des objectifs, ROI et recommandations stratégiques.',
    lastGenerated: '2026-06-30T10:00:00Z',
    nextGeneration: '—',
    status: 'manual',
    icon: <BarChart3 className="h-5 w-5" />,
  },
]

// ============== HELPERS ==============

function formatDate(ts: string) {
  if (ts === '—') return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusConfig(status: ReportType['status'], isDark: boolean) {
  switch (status) {
    case 'generated':
      return { label: 'Généré', variant: 'default' as const, className: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-800' }
    case 'scheduled':
      return { label: 'Planifié', variant: 'outline' as const, className: isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-800' }
    case 'manual':
      return { label: 'Manuel', variant: 'secondary' as const, className: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-800' }
  }
}

function computeCountdown(targetDate: string): string {
  if (targetDate === '—') return '—'
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return 'En cours…'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (d > 0) return `${d}j ${h}h ${m}min`
  if (h > 0) return `${h}h ${m}min ${s}s`
  return `${m}min ${s}s`
}

function useCountdown(targetDate: string) {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (targetDate === '—') return () => {}
    const id = setInterval(onStoreChange, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return useSyncExternalStore(
    subscribe,
    () => computeCountdown(targetDate),
    () => computeCountdown(targetDate)
  )
}

function downloadCSV() {
  const headers = ['Type', 'Fréquence', 'Statut', 'Dernière génération', 'Prochaine génération']
  const rows = REPORT_TYPES.map((r) => [
    r.name,
    r.frequency,
    r.status,
    formatDate(r.lastGenerated),
    formatDate(r.nextGeneration),
  ])
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `julaba_rapports_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============== LIVE PREVIEW ==============

function LivePreview() {
  const { dashboard, actors, enrolments, zones, alerts, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const totalActors = dashboard?.totalActors ?? actors.length
  const activeActors = dashboard?.activeActors ?? actors.filter(a => a.status === 'actif').length
  const pendingEnrolments = dashboard?.pendingEnrolments ?? enrolments.filter(e => e.status === 'en_attente').length
  const totalZones = dashboard?.totalZones ?? zones.length
  const activeMissions = dashboard?.activeMissions ?? 0
  const unackAlerts = dashboard?.unacknowledgedAlerts ?? alerts.filter(a => !a.acknowledged).length
  const dataQuality = dashboard?.dataQuality

  const rows = [
    { label: 'Total acteurs', value: totalActors.toLocaleString('fr-FR'), icon: <Users className="h-3 w-3 text-emerald-600" /> },
    { label: 'Acteurs actifs', value: activeActors.toLocaleString('fr-FR'), icon: <Activity className="h-3 w-3 text-emerald-600" /> },
    { label: 'Dossiers en attente', value: pendingEnrolments.toLocaleString('fr-FR'), icon: pendingEnrolments > 0 ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : <Activity className="h-3 w-3 text-emerald-600" /> },
    { label: 'Zones couvertes', value: `${totalZones}`, icon: <MapPin className="h-3 w-3 text-blue-600" /> },
    { label: 'Missions actives', value: `${activeMissions}`, icon: <Activity className="h-3 w-3 text-emerald-600" /> },
    { label: 'Alertes non acquittées', value: `${unackAlerts}`, icon: unackAlerts > 0 ? <AlertTriangle className="h-3 w-3 text-red-500" /> : <Activity className="h-3 w-3 text-emerald-600" /> },
  ]

  if (dataQuality) {
    rows.push(
      { label: 'Photos valides', value: `${dataQuality.photos}%`, icon: <Activity className="h-3 w-3 text-emerald-600" /> },
      { label: 'GPS précis', value: `${dataQuality.gps}%`, icon: <Activity className="h-3 w-3 text-emerald-600" /> },
      { label: 'Téléphones vérifiés', value: `${dataQuality.phones}%`, icon: <Activity className="h-3 w-3 text-emerald-600" /> },
    )
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-muted/30 border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Données en temps réel
        </p>
        <span className={`inline-flex h-1.5 w-1.5 rounded-full ${isDark ? 'bg-emerald-400' : 'bg-emerald-500'} animate-pulse`} />
      </div>
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between py-1.5 border-b last:border-b-0"
        >
          <span className="text-xs text-muted-foreground">
            {row.label}
          </span>
          <span className={`text-xs font-medium flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {row.value}
            {row.icon}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============== SUB-COMPONENTS ==============

function ScheduledReportCard({ report }: { report: ReportType }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const countdown = useCountdown(report.nextGeneration)
  return (
    <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`flex items-center justify-center h-8 w-8 rounded-lg text-white ${isDark ? 'bg-blue-500' : 'bg-[#0F172A]'}`}
          >
            {report.icon}
          </div>
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {report.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {report.frequency}
            </p>
          </div>
        </div>
        <Separator className="mb-3" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prochaine exécution</span>
            <span className={`text-xs font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {formatDate(report.nextGeneration)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Compte à rebours</span>
            <span className="text-xs font-mono font-bold text-emerald-600">
              {countdown}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============== COMPONENT ==============

export function BoRapportsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedReport((prev) => (prev === id ? null : id))
  }, [])

  const scheduledReports = REPORT_TYPES.filter((r) => r.status !== 'manual')

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* ── TITLE ── */}
      <BoPageHeader
        title="Rapports"
        description="Génération et consultation des rapports Jùlaba"
      />

      {/* ── 1. REPORT TYPE CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REPORT_TYPES.map((report) => {
          const statusCfg = getStatusConfig(report.status, isDark)
          const isExpanded = expandedReport === report.id

          return (
            <Card key={report.id} className={`overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center h-10 w-10 rounded-lg text-white ${isDark ? 'bg-blue-500' : 'bg-[#0F172A]'}`}
                    >
                      {report.icon}
                    </div>
                    <div>
                      <CardTitle
                        className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                      >
                        {report.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {report.frequencyLabel}
                      </p>
                    </div>
                  </div>
                  <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {report.description}
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Dernière génération</span>
                  <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {formatDate(report.lastGenerated)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Prochaine génération</span>
                  <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {formatDate(report.nextGeneration)}
                  </span>
                </div>

                {/* ── LIVE PREVIEW ── */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleExpand(report.id)}
                >
                  {isExpanded ? 'Masquer' : 'Afficher'} les indicateurs
                  <ArrowRight
                    className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </Button>

                {isExpanded && <LivePreview />}

                {/* ── EXPORT BUTTONS ── */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground mr-1">Exporter :</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {}}
                  >
                    <FileText className="h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {}}
                  >
                    <FileSpreadsheet className="h-3 w-3" />
                    Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={downloadCSV}
                  >
                    <FileDown className="h-3 w-3" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {}}
                  >
                    <FileJson className="h-3 w-3" />
                    JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── 4. SCHEDULE MANAGEMENT ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Prochains rapports planifiés
          </h2>
          <Badge variant="outline" className="text-xs">
            <Timer className="h-3 w-3 mr-1" />
            Mise à jour en temps réel
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scheduledReports.map((report) => (
            <ScheduledReportCard key={report.id} report={report} />
          ))}
        </div>
      </div>
    </div>
  )
}
