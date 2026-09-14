'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Clock,
  Plus,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Timer,
  Zap,
  TrendingDown,
  Activity,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Textarea } from '@/components/ui/textarea'
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner } from './bo-ui'

// ============== TYPES ==============

type CronStatus = 'active' | 'paused' | 'error'

interface CronJob {
  id: string
  name: string
  description: string
  schedule: string
  cronExpression: string
  lastRun: string
  lastDuration: string
  nextRun: string
  status: CronStatus
  lastResult: 'success' | 'error' | 'pending'
  totalRunsToday: number
}

function relativeTime(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'à l\'instant'
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `il y a ${diffD}j`
}

// ============== MAIN COMPONENT ==============

export function BoCronScreen() {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [runConfirm, setRunConfirm] = useState<string | null>(null)
  const [newJob, setNewJob] = useState({ name: '', cronExpression: '', description: '' })
  const [runningJob, setRunningJob] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/cron')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setJobs(Array.isArray(data) ? data : data.jobs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const statusConfig: Record<CronStatus, { label: string; color: string }> = {
    active: { label: 'Active', color: isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'En pause', color: isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700' },
    error: { label: 'Erreur', color: isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700' },
  }

  const resultConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    success: { label: 'Succ\u00e8s', icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
    error: { label: 'Erreur', icon: <AlertCircle className="h-3 w-3 text-red-500" /> },
    pending: { label: 'En attente', icon: <Timer className={`h-3 w-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} /> },
  }

  const toggleStatus = async (id: string) => {
    const job = jobs.find((j) => j.id === id)
    if (!job) return
    const newStatus: CronStatus = job.status === 'active' ? 'paused' : 'active'
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)))
    try {
      const res = await fetch('/api/backoffice/cron', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
    } catch (err) {
      setJobs((prev) => prev.map((j) => (j.id === id ? job : j)))
      setError(err instanceof Error ? err.message : 'Erreur de mise \u00e0 jour')
    }
  }

  const handleRunNow = async (id: string) => {
    setRunConfirm(null)
    setRunningJob(id)
    try {
      const res = await fetch('/api/backoffice/cron', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'run' }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const updated: CronJob = await res.json()
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d\'ex\u00e9cution')
    } finally {
      setRunningJob(null)
    }
  }

  const [creatingJob, setCreatingJob] = useState(false)

  const handleCreate = async () => {
    if (!newJob.name || !newJob.cronExpression) return
    setCreatingJob(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newJob.name,
          cronExpression: newJob.cronExpression,
          description: newJob.description,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.erreur || `Erreur ${res.status}`)
      }
      const created: CronJob = await res.json()
      setJobs((prev) => [...prev, created])
      setShowCreateDialog(false)
      setNewJob({ name: '', cronExpression: '', description: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de cr\u00e9ation')
    } finally {
      setCreatingJob(false)
    }
  }

  const stats = useMemo(() => {
    const active = jobs.filter(j => j.status === 'active').length
    const totalRunsToday = jobs.reduce((s, j) => s + j.totalRunsToday, 0)
    const durations = jobs
      .filter(j => j.lastDuration && j.lastDuration !== '-')
      .map(j => {
        const dur = String(j.lastDuration)
        const parts = dur.match(/(\d+)m\s*(\d+)s/) || dur.match(/(\d+\.?\d*)s/)
        if (parts?.[1] && parts?.[2]) return parseFloat(parts[1]) * 60 + parseFloat(parts[2])
        if (parts?.[1]) return parseFloat(parts[1])
        return 0
      })
    const avgDuration = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) + 's' : '-'
    const failedToday = jobs.filter(j => j.status === 'error').length
    return { active, totalRunsToday, avgDuration, failedToday }
  }, [jobs])

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      const matchStatus = statusFilter === 'tous' || j.status === statusFilter
      const matchSearch = !searchQuery ||
        j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.cronExpression.includes(searchQuery)
      return matchStatus && matchSearch
    })
  }, [jobs, statusFilter, searchQuery])

  const formatTime = (d: string) => {
    if (d === '-') return '-'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Header */}
      <BoPageHeader
        title="Cron Dashboard"
        description="Gestion des t\u00e2ches planifi\u00e9es et automatis\u00e9es"
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Cr\u00e9er t\u00e2che
          </Button>
        }
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-100'} flex items-center justify-center`}>
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            {loading ? (
              <div className="space-y-2 flex-1">
                <Skeleton className={`h-3 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <div>
                <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>T\u00e2ches actives</p>
                <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-sky-500/15' : 'bg-sky-100'} flex items-center justify-center`}>
              <Activity className="h-5 w-5 text-sky-600" />
            </div>
            {loading ? (
              <div className="space-y-2 flex-1">
                <Skeleton className={`h-3 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <div>
                <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ex\u00e9cutions aujourd'hui</p>
                <p className="text-xl font-bold text-sky-600">{stats.totalRunsToday}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-amber-500/15' : 'bg-amber-100'} flex items-center justify-center`}>
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            {loading ? (
              <div className="space-y-2 flex-1">
                <Skeleton className={`h-3 w-24 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <div>
                <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dur\u00e9e moyenne</p>
                <p className="text-xl font-bold text-amber-700">{stats.avgDuration}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-red-500/15' : 'bg-red-100'} flex items-center justify-center`}>
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            {loading ? (
              <div className="space-y-2 flex-1">
                <Skeleton className={`h-3 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
                <Skeleton className={`h-5 w-10 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
              </div>
            ) : (
              <div>
                <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>\u00c9chou\u00e9es aujourd'hui</p>
                <p className="text-xl font-bold text-red-600">{stats.failedToday}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <Input
            placeholder="Rechercher une t\u00e2che..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">En pause</SelectItem>
            <SelectItem value="error">Erreur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && <BoErrorBanner message={error} onRetry={fetchData} />}

      {/* Jobs Table */}
      {!error && (
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              <Clock className="h-4 w-4" />
              T\u00e2ches planifi\u00e9es
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Planification</TableHead>
                    <TableHead className="text-xs font-mono">Expression</TableHead>
                    <TableHead className="text-xs">Dernier run</TableHead>
                    <TableHead className="text-xs">Prochain run</TableHead>
                    <TableHead className="text-xs">Dur\u00e9e</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-32 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-28 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-4 w-12 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-5 w-16 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                      <TableCell className="py-3"><Skeleton className={`h-7 w-20 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} /></TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredJobs.map((job) => {
                    const sc = statusConfig[job.status] ?? { label: job.status, color: isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600' }
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="text-xs py-3">
                          <div>
                            <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{job.name}</p>
                            <p className={`text-[11px] mt-0.5 max-w-[200px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{job.description}</p>
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{job.schedule}</TableCell>
                        <TableCell className={`text-xs py-3 font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{job.cronExpression}</TableCell>
                        <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`} title={formatTime(job.lastRun)}>{job.lastRun === '-' ? '-' : relativeTime(job.lastRun)}</TableCell>
                        <TableCell className={`text-xs py-3 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatTime(job.nextRun)}</TableCell>
                        <TableCell className={`text-xs py-3 font-mono whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{job.lastDuration}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={job.status === 'active'}
                              onCheckedChange={() => toggleStatus(job.id)}
                              disabled={job.status === 'error'}
                              className="scale-75"
                            />
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>{sc.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setRunConfirm(job.id)}
                            disabled={runningJob === job.id}
                          >
                            {runningJob === job.id ? (
                              <span className={`h-3 w-3 border-2 rounded-full animate-spin ${isDark ? 'border-slate-600/30 border-t-slate-300' : 'border-gray-400/30 border-t-gray-600'}`} />
                            ) : (
                              <><Play className="h-3 w-3 mr-1" /> Run now</>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {!loading && filteredJobs.length === 0 && (
                <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune t\u00e2che trouv\u00e9e</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cr\u00e9er une t\u00e2che planifi\u00e9e</DialogTitle>
            <DialogDescription>D\u00e9finissez une nouvelle t\u00e2che automatis\u00e9e.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom de la t\u00e2che</Label>
              <Input
                placeholder="Ex: Clean Temp Files"
                value={newJob.name}
                onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Expression Cron</Label>
              <Input
                placeholder="Ex: */30 * * * *"
                value={newJob.cronExpression}
                onChange={(e) => setNewJob({ ...newJob, cronExpression: e.target.value })}
              />
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Format : min heure jour mois jour_semaine</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Description de la t\u00e2che"
                rows={3}
                value={newJob.description}
                onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!newJob.name || !newJob.cronExpression || creatingJob}>
              <Plus className="h-4 w-4 mr-2" />
              Cr\u00e9er
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Confirm Alert */}
      <AlertDialog open={!!runConfirm} onOpenChange={() => setRunConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ex\u00e9cuter la t\u00e2che maintenant ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cela ex\u00e9cutera la t\u00e2che imm\u00e9diatement en dehors de la planification normale.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => runConfirm && handleRunNow(runConfirm)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Ex\u00e9cuter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}