'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Ban,
  UserX,
  AlertOctagon,
  ShieldAlert,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Flag,
  User,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type ReportSeverity = 'critique' | 'haute' | 'moyenne' | 'basse'
type ReportStatus = 'en_attente' | 'traitee' | 'ignoree'

interface ModerationReport {
  id: string
  reporterName: string
  reporterRole: string
  actorName: string
  actorId: string
  actorType: string
  reason: string
  description: string
  severity: ReportSeverity
  status: ReportStatus
  createdAt: string
  resolvedAt?: string
  resolutionNote?: string
}

// ============== CONSTANTS ==============

function getSeverityConfig(isDark: boolean): Record<ReportSeverity, { label: string; color: string; dotColor: string; icon: React.ReactNode }> {
  return {
    critique: { label: 'Critique', color: isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200', dotColor: 'bg-red-500', icon: <AlertOctagon className="h-3.5 w-3.5" /> },
    haute: { label: 'Haute', color: isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200', dotColor: 'bg-orange-500', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    moyenne: { label: 'Moyenne', color: isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    basse: { label: 'Basse', color: isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-gray-50 border-gray-200', dotColor: isDark ? 'bg-slate-500' : 'bg-gray-400', icon: <Eye className="h-3.5 w-3.5" /> },
  }
}

const SEVERITY_BADGE: Record<ReportSeverity, string> = {
  critique: 'bg-red-100 text-red-700',
  haute: 'bg-orange-100 text-orange-700',
  moyenne: 'bg-amber-100 text-amber-700',
  basse: 'bg-gray-100 text-gray-600',
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; icon: React.ReactNode }> = {
  en_attente: { label: 'En attente', color: 'bg-amber-100 text-amber-600', icon: <Clock className="h-3 w-3" /> },
  traitee: { label: 'Traitée', color: 'bg-emerald-100 text-emerald-600', icon: <CheckCircle2 className="h-3 w-3" /> },
  ignoree: { label: 'Ignorée', color: 'bg-gray-100 text-gray-500', icon: <Eye className="h-3 w-3" /> },
}

// ============== MAIN COMPONENT ==============

export function BoModerationScreen() {
  const { searchQuery, setSearchQuery, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const SEVERITY_CONFIG = getSeverityConfig(isDark)

  const [severityFilter, setSeverityFilter] = useState<string>('tous')
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [reports, setReports] = useState<ModerationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/moderation')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setReports(data.reports)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchSearch = !searchQuery ||
        r.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.actorId.toLowerCase().includes(searchQuery.toLowerCase())
      const matchSev = severityFilter === 'tous' || r.severity === severityFilter
      const matchStatus = statusFilter === 'tous' || r.status === statusFilter
      return matchSearch && matchSev && matchStatus
    })
  }, [reports, searchQuery, severityFilter, statusFilter])

  const stats = useMemo(() => ({
    total: reports.length,
    nouveaux: reports.filter((r) => r.status === 'en_attente').length,
    enCours: reports.filter((r) => r.status === 'traitee').length,
    resolus: reports.filter((r) => r.status === 'traitee').length,
    critiques: reports.filter((r) => r.severity === 'critique' && r.status !== 'traitee').length,
  }), [reports])

  const handleTraiter = (id: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? { ...r, status: 'traitee' as const } : r))
  }

  const handleResoudre = (id: string, note?: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? {
      ...r, status: 'traitee' as const, resolvedAt: new Date().toISOString(), resolutionNote: note || '',
    } : r))
    setNoteTarget(null)
    setNoteText('')
    setShowNoteDialog(false)
  }

  const handleSuspendre = (id: string) => {
    setReports((prev) => prev.map((r) => r.id === id ? {
      ...r, status: 'traitee' as const, resolvedAt: new Date().toISOString(), resolutionNote: 'Acteur suspendu suite au signalement.',
    } : r))
    setSuspendTarget(null)
  }

  const openNoteDialog = (id: string) => {
    setNoteTarget(id)
    setNoteText('')
    setShowNoteDialog(true)
  }

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`p-6 space-y-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <BoPageHeader
        title="Modération"
        description="Signalements et gestion des comportements inappropriés"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Total</p>
                {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{stats.total}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <Flag className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Nouveaux</p>
                {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-red-600">{stats.nouveaux}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>En cours</p>
                {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-amber-600">{stats.enCours}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Résolus</p>
                {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.resolus}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Critiques</p>
                {loading ? <Skeleton className="h-8 w-8 mt-1" /> : <p className="text-2xl font-bold mt-1 text-red-700">{stats.critiques}</p>}
              </div>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                <AlertOctagon className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <Input
                placeholder="Rechercher par acteur, rapporteur, motif..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Sévérité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes sévérités</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
                <SelectItem value="haute">Haute</SelectItem>
                <SelectItem value="moyenne">Moyenne</SelectItem>
                <SelectItem value="basse">Basse</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="traitee">Traitée</SelectItem>
                <SelectItem value="ignoree">Ignorée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Loading State */}
      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className={`border-l-4 ${isDark ? 'bg-slate-800 border-slate-700' : ''} ${isDark ? '' : 'shadow-sm'}`}>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-2.5">
                    <div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-20" /></div>
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-full max-w-lg" />
                    <Skeleton className="h-4 w-4" />
                    <div className="flex gap-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-32" /></div>
                  </div>
                  <div className="flex gap-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-24" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reports List */}
      {!loading && !error && (
        <div className="space-y-3">
          {filtered.map((report) => {
            const sevConfig = SEVERITY_CONFIG[report.severity] ?? { label: report.severity, color: isDark ? 'border-slate-600' : 'border-gray-300' }
            const statusConfig = STATUS_CONFIG[report.status] ?? { label: report.status, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600', icon: <AlertTriangle className="h-3 w-3" /> }
            const isExpanded = expandedId === report.id
            return (
              <Card key={report.id} className={`border-l-4 ${isDark ? '' : 'shadow-sm'} ${isDark ? 'bg-slate-800 border-slate-700' : ''} transition-all ${sevConfig.color}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Left: Report info */}
                    <div className="flex-1 space-y-2.5">
                      {/* Top badges row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${SEVERITY_BADGE[report.severity]}`}>
                          {sevConfig.icon}
                          <span className="ml-1">{sevConfig.label}</span>
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${statusConfig.color}`}>
                          {statusConfig.icon}
                          <span className="ml-1">{statusConfig.label}</span>
                        </Badge>
                        <span className={`text-[11px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>#{report.id}</span>
                      </div>

                      {/* Reason title */}
                      <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{report.reason}</p>

                      {/* Collapsible description */}
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-gray-600'} ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {report.description}
                      </p>
                      <button
                        className={`text-[11px] flex items-center gap-1 transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                        onClick={() => setExpandedId(isExpanded ? null : report.id)}
                      >
                        {isExpanded ? <><ChevronUp className="h-3 w-3" /> Réduire</> : <><ChevronDown className="h-3 w-3" /> Voir plus</>}
                      </button>

                      {/* Meta row */}
                      <div className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          <span>Signalé par <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>{report.reporterName}</strong></span>
                          <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>({report.reporterRole})</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          <span>Acteur : <strong className={isDark ? 'text-slate-300' : 'text-gray-700'}>{report.actorName}</strong></span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{report.actorId}</Badge>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(report.createdAt)}
                        </span>
                      </div>

                      {/* Resolution note */}
                      {report.status === 'traitee' && report.resolutionNote && (
                        <div className={`mt-2 p-2.5 rounded-lg border ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                          <p className="text-[11px] font-medium text-emerald-700 mb-0.5">Résolution</p>
                          <p className="text-xs text-emerald-600">{report.resolutionNote}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col gap-2 shrink-0 lg:ml-4">
                      {report.status === 'en_attente' && (
                        <>
                          <Button size="sm" className={`text-xs h-8 ${isDark ? '' : 'shadow-sm'}`} onClick={() => handleTraiter(report.id)}>
                            <Eye className="h-3 w-3 mr-1.5" />
                            Prendre en charge
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openNoteDialog(report.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1.5" />
                            Résoudre
                          </Button>
                          <Button
                            size="sm" variant="destructive" className="text-xs h-8"
                            onClick={() => setSuspendTarget(report.id)}
                          >
                            <UserX className="h-3 w-3 mr-1.5" />
                            Suspendre
                          </Button>
                        </>
                      )}
                      {report.status === 'traitee' && (
                        <>
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openNoteDialog(report.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1.5" />
                            Résoudre avec note
                          </Button>
                          <Button
                            size="sm" variant="destructive" className="text-xs h-8"
                            onClick={() => setSuspendTarget(report.id)}
                          >
                            <Ban className="h-3 w-3 mr-1.5" />
                            Suspendre l'acteur
                          </Button>
                        </>
                      )}
                      {report.status === 'traitee' && report.resolvedAt && (
                        <div className={`flex items-center gap-2 text-xs py-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <div>
                            <p className="font-medium text-emerald-600">Résolu</p>
                            <p>{formatDate(report.resolvedAt)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {filtered.length === 0 && (
            <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <ShieldAlert className="h-14 w-14 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">Aucun signalement trouvé</p>
              <p className="text-xs mt-1">Modifiez vos filtres pour voir plus de résultats</p>
            </div>
          )}
        </div>
      )}

      {/* Suspend Dialog */}
      <AlertDialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              Suspendre l&apos;acteur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L&apos;acteur ne pourra plus accéder à la plateforme jusqu&apos;à réactivation manuelle par un administrateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => suspendTarget && handleSuspendre(suspendTarget)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Confirmer la suspension
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve with Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              Résoudre le signalement
            </DialogTitle>
            <DialogDescription>Ajoutez une note de résolution pour documenter la décision.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Note de résolution</Label>
              <Textarea
                placeholder="Décrivez la résolution du signalement..."
                rows={4}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Annuler</Button>
            <Button onClick={() => noteTarget && handleResoudre(noteTarget, noteText)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Résoudre
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
