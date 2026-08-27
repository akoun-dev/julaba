'use client'

import { useState, useMemo } from 'react'
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

// ============== MOCK DATA ==============

const INITIAL_CRON_JOBS: CronJob[] = [
  {
    id: 'cron-1', name: 'Clean Sessions', description: 'Supprime les sessions expir\u00e9es',
    schedule: 'Toutes les heures', cronExpression: '0 * * * *',
    lastRun: '2026-08-27T14:00:00Z', lastDuration: '2.3s', nextRun: '2026-08-27T15:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 14,
  },
  {
    id: 'cron-2', name: 'Sync Institutions', description: 'Synchronisation des donn\u00e9es institutionnelles',
    schedule: 'Tous les jours \u00e0 6h', cronExpression: '0 6 * * *',
    lastRun: '2026-08-27T06:00:00Z', lastDuration: '45.2s', nextRun: '2026-08-28T06:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 1,
  },
  {
    id: 'cron-3', name: 'Generate Reports', description: 'G\u00e9n\u00e9ration des rapports quotidiens',
    schedule: 'Tous les jours \u00e0 23h', cronExpression: '0 23 * * *',
    lastRun: '2026-08-26T23:00:00Z', lastDuration: '12.1s', nextRun: '2026-08-27T23:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 0,
  },
  {
    id: 'cron-4', name: 'Score Recalculation', description: 'Recalcul des scores financiers',
    schedule: 'Tous les lundis \u00e0 2h', cronExpression: '0 2 * * 1',
    lastRun: '2026-08-25T02:00:00Z', lastDuration: '3m 24s', nextRun: '2026-09-01T02:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 0,
  },
  {
    id: 'cron-5', name: 'Backup Database', description: 'Sauvegarde compl\u00e8te de la base de donn\u00e9es',
    schedule: 'Tous les jours \u00e0 3h', cronExpression: '0 3 * * *',
    lastRun: '2026-08-27T03:00:00Z', lastDuration: '8m 12s', nextRun: '2026-08-28T03:00:00Z',
    status: 'error', lastResult: 'error', totalRunsToday: 1,
  },
  {
    id: 'cron-6', name: 'SMS Reminder', description: 'Rappel SMS aux marchands inactifs',
    schedule: 'Tous les mercredis \u00e0 10h', cronExpression: '0 10 * * 3',
    lastRun: '2026-08-20T10:00:00Z', lastDuration: '1m 05s', nextRun: '2026-08-27T10:00:00Z',
    status: 'paused', lastResult: 'success', totalRunsToday: 0,
  },
  {
    id: 'cron-7', name: 'Cache Warmup', description: 'Pr\u00e9-chargement du cache',
    schedule: 'Toutes les 6 heures', cronExpression: '0 */6 * * *',
    lastRun: '2026-08-27T12:00:00Z', lastDuration: '5.8s', nextRun: '2026-08-27T18:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 2,
  },
  {
    id: 'cron-8', name: 'Anomaly Detection', description: 'D\u00e9tection d\'anomalies sur les transactions',
    schedule: 'Toutes les 30 min', cronExpression: '*/30 * * * *',
    lastRun: '2026-08-27T14:30:00Z', lastDuration: '18.4s', nextRun: '2026-08-27T15:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 29,
  },
  {
    id: 'cron-9', name: 'Webhook Retry', description: 'Relance des webhooks \u00e9chou\u00e9s',
    schedule: 'Toutes les heures', cronExpression: '0 * * * *',
    lastRun: '2026-08-27T14:00:00Z', lastDuration: '1.2s', nextRun: '2026-08-27T15:00:00Z',
    status: 'active', lastResult: 'success', totalRunsToday: 14,
  },
]

function relativeTime(dateStr: string): string {
  const now = new Date('2026-08-27T14:35:00Z')
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

  const [jobs, setJobs] = useState<CronJob[]>(INITIAL_CRON_JOBS)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [runConfirm, setRunConfirm] = useState<string | null>(null)
  const [newJob, setNewJob] = useState({ name: '', cronExpression: '', description: '' })
  const [runningJob, setRunningJob] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [searchQuery, setSearchQuery] = useState('')

  const toggleStatus = (id: string) => {
    setJobs((prev) => prev.map((j) => {
      if (j.id !== id) return j
      const newStatus: CronStatus = j.status === 'active' ? 'paused' : 'active'
      return { ...j, status: newStatus }
    }))
  }

  const handleRunNow = (id: string) => {
    setRunConfirm(null)
    setRunningJob(id)
    setTimeout(() => {
      setJobs((prev) => prev.map((j) =>
        j.id === id
          ? { ...j, lastRun: new Date().toISOString(), lastDuration: '0.8s', lastResult: 'success' as const, totalRunsToday: j.totalRunsToday + 1 }
          : j
      ))
      setRunningJob(null)
    }, 2000)
  }

  const handleCreate = () => {
    const newCronJob: CronJob = {
      id: `cron-${Date.now()}`,
      name: newJob.name,
      description: newJob.description,
      schedule: 'Personnalis\u00e9',
      cronExpression: newJob.cronExpression,
      lastRun: '-',
      lastDuration: '-',
      nextRun: new Date(Date.now() + 3600000).toISOString(),
      status: 'active',
      lastResult: 'pending',
      totalRunsToday: 0,
    }
    setJobs((prev) => [...prev, newCronJob])
    setShowCreateDialog(false)
    setNewJob({ name: '', cronExpression: '', description: '' })
  }

  const stats = useMemo(() => {
    const active = jobs.filter(j => j.status === 'active').length
    const totalRunsToday = jobs.reduce((s, j) => s + j.totalRunsToday, 0)
    const durations = jobs
      .filter(j => j.lastDuration !== '-')
      .map(j => {
        const parts = j.lastDuration.match(/(\d+)m\s*(\d+)s/) || j.lastDuration.match(/(\d+\.?\d*)s/)
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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            <span className="inline-flex items-center gap-2"><Clock className="h-6 w-6" /> CRON DASHBOARD</span>
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Gestion des t\u00e2ches planifi\u00e9es et automatis\u00e9es
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Cr\u00e9er t\u00e2che
        </Button>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-100'} flex items-center justify-center`}>
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>T\u00e2ches actives</p>
              <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-sky-500/15' : 'bg-sky-100'} flex items-center justify-center`}>
              <Activity className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ex\u00e9cutions aujourd'hui</p>
              <p className="text-xl font-bold text-sky-600">{stats.totalRunsToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-amber-500/15' : 'bg-amber-100'} flex items-center justify-center`}>
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dur\u00e9e moyenne</p>
              <p className="text-xl font-bold text-amber-700">{stats.avgDuration}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 ${isDark ? 'bg-slate-800 border-slate-700 border' : 'shadow-sm'} `}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${isDark ? 'bg-red-500/15' : 'bg-red-100'} flex items-center justify-center`}>
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>\u00c9chou\u00e9es aujourd'hui</p>
              <p className="text-xl font-bold text-red-600">{stats.failedToday}</p>
            </div>
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

      {/* Jobs Table */}
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
                {filteredJobs.map((job) => {
                  const sc = statusConfig[job.status]
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
            {filteredJobs.length === 0 && (
              <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune t\u00e2che trouv\u00e9e</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
            <Button onClick={handleCreate} disabled={!newJob.name || !newJob.cronExpression}>
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