'use client'

import { useState, useCallback, useSyncExternalStore } from 'react'
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
  AlertTriangle,
  BarChart2,
  ArrowRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BO_COLOR } from '@/lib/stores/backoffice-store'

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
  preview: ReportPreviewRow[]
}

interface ReportPreviewRow {
  label: string
  value: string
  type?: 'text' | 'number' | 'trend_up' | 'trend_down' | 'warning'
}

// ============== MOCK DATA ==============

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
    preview: [
      { label: 'CA du jour', value: '4 280 000 FCFA', type: 'number' },
      { label: 'Volume ventes', value: '347 transactions', type: 'trend_up' },
      { label: 'Stocks critiques', value: '12 produits', type: 'warning' },
      { label: 'Incidents', value: '3 incidents (1 critique)', type: 'warning' },
      { label: 'Performance', value: '98.4% disponibilité', type: 'trend_up' },
    ],
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
    preview: [
      { label: 'Tendances', value: '+12% ventes vs S-1', type: 'trend_up' },
      { label: 'Comparaison périodes', value: 'S32 vs S31: +8%', type: 'trend_up' },
      { label: 'Nouveaux acteurs', value: '156 enrôlements', type: 'number' },
      { label: 'Zones actives', value: '10/12 zones', type: 'text' },
      { label: 'Adoption numérique', value: '67% des marchands actifs', type: 'trend_up' },
    ],
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
    preview: [
      { label: 'Analyse tendances', value: 'Croissance +18% sur 3 mois', type: 'trend_up' },
      { label: 'Impact social', value: '2 340 foyers touchés', type: 'number' },
      { label: 'Inclusion financière', value: '89% premiers accès bancaires', type: 'trend_up' },
      { label: 'Couverture zones', value: '78% objectif Q3 atteint', type: 'text' },
      { label: 'Taux rétention', value: '94.2% (vs 91% objectif)', type: 'trend_up' },
    ],
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
    preview: [
      { label: 'Évaluation objectifs', value: '82% KPIs atteints Q2', type: 'trend_up' },
      { label: 'ROI', value: '3.2x retour sur investissement', type: 'trend_up' },
      { label: 'Recommandations', value: '5 actions priorisées', type: 'text' },
      { label: 'Budget consommé', value: '68% (en ligne avec prévision)', type: 'text' },
      { label: 'Satisfaction', value: '4.3/5 (enquête terrain)', type: 'trend_up' },
    ],
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

function getStatusConfig(status: ReportType['status']) {
  switch (status) {
    case 'generated':
      return { label: 'Généré', variant: 'default' as const, className: 'bg-emerald-100 text-emerald-800' }
    case 'scheduled':
      return { label: 'Planifié', variant: 'outline' as const, className: 'bg-blue-100 text-blue-800' }
    case 'manual':
      return { label: 'Manuel', variant: 'secondary' as const, className: 'bg-gray-100 text-gray-800' }
  }
}

function PreviewValueIcon({ type }: { type?: string }) {
  if (type === 'trend_up') return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
  if (type === 'trend_down') return <TrendingUp className="h-3.5 w-3.5 text-red-500 rotate-180" />
  if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
  return null
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

// ============== SUB-COMPONENTS ==============

function ScheduledReportCard({ report }: { report: ReportType }) {
  const countdown = useCountdown(report.nextGeneration)
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex items-center justify-center h-8 w-8 rounded-lg text-white"
            style={{ backgroundColor: BO_COLOR }}
          >
            {report.icon}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: BO_COLOR }}>
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
            <span className="text-xs font-medium" style={{ color: BO_COLOR }}>
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
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedReport((prev) => (prev === id ? null : id))
  }, [])

  const scheduledReports = REPORT_TYPES.filter((r) => r.status !== 'manual')

  return (
    <div className="p-6 space-y-6">
      {/* ── TITLE ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-xl"
            style={{ backgroundColor: BO_COLOR }}
          >
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
              📊 RAPPORTS
            </h1>
            <p className="text-sm text-muted-foreground">
              Génération et consultation des rapports Jùlaba
            </p>
          </div>
        </div>
      </div>

      {/* ── 1. REPORT TYPE CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REPORT_TYPES.map((report) => {
          const statusCfg = getStatusConfig(report.status)
          const isExpanded = expandedReport === report.id

          return (
            <Card key={report.id} className="overflow-hidden">
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center h-10 w-10 rounded-lg text-white"
                      style={{ backgroundColor: BO_COLOR }}
                    >
                      {report.icon}
                    </div>
                    <div>
                      <CardTitle
                        className="text-base font-bold"
                        style={{ color: BO_COLOR }}
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
                  <span className="font-medium" style={{ color: BO_COLOR }}>
                    {formatDate(report.lastGenerated)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Prochaine génération</span>
                  <span className="font-medium" style={{ color: BO_COLOR }}>
                    {formatDate(report.nextGeneration)}
                  </span>
                </div>

                {/* ── 2. PREVIEW SECTION ── */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleExpand(report.id)}
                >
                  {isExpanded ? 'Masquer' : 'Afficher'} l'aperçu
                  <ArrowRight
                    className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </Button>

                {isExpanded && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Aperçu du contenu
                    </p>
                    {report.preview.map((row, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1.5 border-b last:border-b-0"
                      >
                        <span className="text-xs text-muted-foreground">
                          {row.label}
                        </span>
                        <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: BO_COLOR }}>
                          {row.value}
                          <PreviewValueIcon type={row.type} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 3. EXPORT BUTTONS ── */}
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
          <h2 className="text-lg font-semibold" style={{ color: BO_COLOR }}>
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
