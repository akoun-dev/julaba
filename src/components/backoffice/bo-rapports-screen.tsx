'use client'

import { useState, useCallback } from 'react'
import {
  BarChart3,
  Calendar,
  Clock,
  FileDown,
  FileJson,
  TrendingUp,
  ArrowRight,
  Users,
  Activity,
  AlertTriangle,
  MapPin,
  BarChart2,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useBackofficeStore, type BoActor, type BoEnrolment } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

interface ReportPeriod {
  id: string
  name: string
  frequencyLabel: string
  description: string
  days: number | null // null = toutes les données
  icon: React.ReactNode
}

// A report here is generated on demand from the real acteurs/dossiers data,
// filtered to this period — not a scheduled job. This screen used to show
// four "scheduled" report cards with hardcoded past/future timestamps and a
// live countdown to a generation that never actually happened, plus
// PDF/Excel export buttons that were no-ops — all of it fabricated, none of
// it backed by a real report-generation backend. Rather than fake that
// infrastructure, this generates real exports (CSV/JSON) from live data at
// click time.
const REPORT_PERIODS: ReportPeriod[] = [
  {
    id: 'quotidien',
    name: 'Quotidien',
    frequencyLabel: "Aujourd'hui",
    description: "Acteurs et dossiers créés aujourd'hui.",
    days: 1,
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    id: 'hebdomadaire',
    name: 'Hebdomadaire',
    frequencyLabel: '7 derniers jours',
    description: 'Acteurs et dossiers des 7 derniers jours.',
    days: 7,
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    id: 'mensuel',
    name: 'Mensuel',
    frequencyLabel: '30 derniers jours',
    description: 'Acteurs et dossiers des 30 derniers jours.',
    days: 30,
    icon: <BarChart2 className="h-5 w-5" />,
  },
  {
    id: 'complet',
    name: 'Complet',
    frequencyLabel: 'Toutes les données',
    description: 'Ensemble des acteurs et dossiers enregistrés.',
    days: null,
    icon: <BarChart3 className="h-5 w-5" />,
  },
]

// Reports are generated from a fresh, complete fetch rather than the
// in-memory store — bo-acteurs-screen/bo-enrolement-screen only keep the
// currently-loaded page(s) in memory (client-side pagination), and a report
// silently covering just the first page would misrepresent the real
// totals. The API caps `limit` at 100 server-side regardless of what's
// requested, so fetchAllPages below walks every page rather than trusting
// one large request to return everything — capped at 20 pages (2000
// records) as a sanity ceiling, not real infinite-scroll pagination.
const PAGE_LIMIT = 100
const MAX_PAGES = 20

async function fetchAllPages<T>(url: string, key: string): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${url}?limit=${PAGE_LIMIT}&page=${page}`)
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    const data = await res.json()
    const batch: T[] = data[key] || []
    items.push(...batch)
    if (batch.length < PAGE_LIMIT || items.length >= (data.total ?? Infinity)) break
  }
  return items
}

function withinPeriod(iso: string, days: number | null): boolean {
  if (days === null) return true
  const cutoff = Date.now() - days * 86400000
  return new Date(iso).getTime() >= cutoff
}

function toCSV(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))
  }
  return lines.join('\n')
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
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

// ============== COMPONENT ==============

export function BoRapportsScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedReport((prev) => (prev === id ? null : id))
  }, [])

  const generateReport = useCallback(async (period: ReportPeriod, format: 'csv' | 'json') => {
    setGeneratingId(`${period.id}-${format}`)
    setError(null)
    try {
      const [allActors, allEnrolments] = await Promise.all([
        fetchAllPages<BoActor>('/api/backoffice/actors', 'actors'),
        fetchAllPages<BoEnrolment>('/api/backoffice/enrolments', 'enrolments'),
      ])

      const actors = allActors.filter((a) => withinPeriod(a.createdAt, period.days))
      const enrolments = allEnrolments.filter((e) => withinPeriod(e.submittedAt, period.days))

      const stamp = new Date().toISOString().slice(0, 10)
      const filenameBase = `julaba_rapport_${period.id}_${stamp}`

      if (format === 'json') {
        const payload = {
          periode: period.name,
          genereLe: new Date().toISOString(),
          acteurs: actors,
          dossiers: enrolments,
        }
        download(JSON.stringify(payload, null, 2), `${filenameBase}.json`, 'application/json')
      } else {
        const actorRows = actors.map((a) => ({
          type: 'acteur',
          id: a.actorId,
          nom: `${a.firstName} ${a.lastName}`,
          categorie: a.type,
          zone: a.zone,
          statut: a.status,
          telephone: a.phone,
          date: a.createdAt,
        }))
        const enrolmentRows = enrolments.map((e) => ({
          type: 'dossier',
          id: e.dossierId,
          nom: e.actorName,
          categorie: e.actorType,
          zone: e.zone,
          statut: e.status,
          telephone: '',
          date: e.submittedAt,
        }))
        download(toCSV([...actorRows, ...enrolmentRows]), `${filenameBase}.csv`, 'text/csv')
      }

      setLastGenerated((prev) => ({ ...prev, [period.id]: Date.now() }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération du rapport')
    } finally {
      setGeneratingId(null)
    }
  }, [])

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* ── TITLE ── */}
      <BoPageHeader
        title="Rapports"
        description="Export à la demande des acteurs et dossiers, par période — généré depuis les données réelles."
      />

      {error && <BoErrorBanner message={error} />}

      {/* ── REPORT PERIOD CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REPORT_PERIODS.map((period) => {
          const isExpanded = expandedReport === period.id
          const lastGen = lastGenerated[period.id]

          return (
            <Card key={period.id} className={`overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center h-10 w-10 rounded-lg text-white ${isDark ? 'bg-blue-500' : 'bg-[#0F172A]'}`}
                    >
                      {period.icon}
                    </div>
                    <div>
                      <CardTitle
                        className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                      >
                        {period.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {period.frequencyLabel}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {period.description}
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Dernier export (cet appareil)</span>
                  <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {lastGen ? new Date(lastGen).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais'}
                  </span>
                </div>

                {/* ── LIVE PREVIEW ── */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleExpand(period.id)}
                >
                  {isExpanded ? 'Masquer' : 'Afficher'} les indicateurs globaux
                  <ArrowRight
                    className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </Button>

                {isExpanded && <LivePreview />}

                {/* ── EXPORT BUTTONS ── */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground mr-1">Générer :</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={generatingId !== null}
                    onClick={() => generateReport(period, 'csv')}
                  >
                    {generatingId === `${period.id}-csv` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={generatingId !== null}
                    onClick={() => generateReport(period, 'json')}
                  >
                    {generatingId === `${period.id}-json` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileJson className="h-3 w-3" />}
                    JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
