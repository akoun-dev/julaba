'use client'

import { useState, useMemo } from 'react'
import {
  Target,
  Plus,
  MapPin,
  User,
  Calendar,
  CheckCircle2,
  Clock,
  PauseCircle,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useBackofficeStore,
  STATUS_LABELS,
  STATUS_COLORS,
  type BoMission,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============

type MissionStatusFilter = 'toutes' | BoMission['status']

const STATUS_FILTER_OPTIONS: { value: MissionStatusFilter; label: string }[] = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'terminee', label: 'Terminées' },
  { value: 'suspendue', label: 'Suspendues' },
]

const STATUS_TAB_ICONS: Record<string, React.ElementType> = {
  toutes: Target,
  en_cours: Clock,
  terminee: CheckCircle2,
  suspendue: PauseCircle,
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  en_cours: 'bg-blue-100 text-blue-800 border-blue-200',
  terminee: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  suspendue: 'bg-amber-100 text-amber-800 border-amber-200',
}

// ============== SUMMARY CARD ==============

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  return (
    <Card className={isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'}>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}
        >
          <Icon className={`h-5 w-5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'} truncate`}>{label}</p>
          <p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
          </p>
          {sub && <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'} truncate`}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ============== MISSION CARD ==============

function MissionCard({
  mission,
  onClose,
}: {
  mission: BoMission
  onClose: (id: string) => void
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const progress =
    mission.targetCount > 0
      ? Math.min((mission.currentCount / mission.targetCount) * 100, 100)
      : 0

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return d
    }
  }

  return (
    <Card className={`${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'} transition-all ${isDark ? '' : 'hover:shadow-sm'}`}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-bold text-base ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
            >
              {mission.title}
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-1 line-clamp-2`}>
              {mission.description}
            </p>
          </div>
          <Badge
            className={`shrink-0 text-[11px] font-medium border ${STATUS_BADGE_STYLES[mission.status] || (isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-600 border-slate-200')}`}
          >
            {STATUS_LABELS[mission.status]}
          </Badge>
        </div>

        {/* Meta row */}
        <div className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <span className="flex items-center gap-1.5">
            <MapPin className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {mission.zone}
          </span>
          <span className="flex items-center gap-1.5">
            <User className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {mission.assigneeName || (
              <span className={`italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Non assignée</span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {formatDate(mission.startDate)}
            {mission.endDate ? ` — ${formatDate(mission.endDate)}` : ''}
          </span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
              <Target className="inline h-3 w-3 mr-1" />
              Progression
            </span>
            <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {mission.currentCount}/{mission.targetCount} ({Math.round(progress)}%)
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Action */}
        {mission.status === 'en_cours' && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => onClose(mission.id)}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Clôturer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============== CREATE MISSION DIALOG ==============

function CreateMissionDialog({
  open,
  onOpenChange,
  onSubmit,
  zones,
  operators,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (mission: Omit<BoMission, 'id' | 'currentCount' | 'status'>) => void
  zones: string[]
  operators: string[]
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [zone, setZone] = useState('')
  const [assignee, setAssignee] = useState('')
  const [targetCount, setTargetCount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const canSubmit =
    title.trim().length > 0 &&
    zone.length > 0 &&
    targetCount.length > 0 &&
    startDate.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      zone,
      assigneeName: assignee || undefined,
      targetCount: parseInt(targetCount) || 0,
      startDate,
      endDate: endDate || undefined,
    })
    setTitle('')
    setDescription('')
    setZone('')
    setAssignee('')
    setTargetCount('')
    setStartDate('')
    setEndDate('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Créer une nouvelle mission
          </DialogTitle>
          <DialogDescription>
            Définissez un objectif d'enrôlement pour une zone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Titre
            </Label>
            <Input
              placeholder="Ex: Enrôlement Cocody Q4"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={isDark ? 'border-slate-700' : 'border-slate-200'}
            />
          </div>

          <div className="space-y-2">
            <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Description
            </Label>
            <Textarea
              placeholder="Description de la mission..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${isDark ? 'border-slate-700' : 'border-slate-200'} min-h-[80px] resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Zone
              </Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger className={`w-full ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Assigné
              </Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className={`w-full ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <SelectValue placeholder="Non assignée" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Objectif (nombre)
            </Label>
            <Input
              type="number"
              placeholder="Ex: 500"
              value={targetCount}
              onChange={(e) => setTargetCount(e.target.value)}
              className={isDark ? 'border-slate-700' : 'border-slate-200'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Date début
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={isDark ? 'border-slate-700' : 'border-slate-200'}
              />
            </div>
            <div className="space-y-2">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Date fin
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={isDark ? 'border-slate-700' : 'border-slate-200'}
              />
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className={isDark ? 'border-slate-700' : 'border-slate-200'}
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="text-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Créer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============== MAIN COMPONENT ==============

export function BoMissionsScreen() {
  const { missions, zones, actors, boTheme, loading, fetchAllData } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [localMissions, setLocalMissions] = useState<BoMission[]>(missions)
  const [statusFilter, setStatusFilter] = useState<MissionStatusFilter>('toutes')
  const [createOpen, setCreateOpen] = useState(false)

  // Available zones and operators for the create form
  const zoneNames = useMemo(() => zones.map((z) => z.name), [zones])
  const operatorNames = useMemo(
    () =>
      Array.from(new Set(actors.filter((a) => a.status === 'actif').map((a) => `${a.firstName} ${a.lastName}`))).sort(),
    [actors]
  )

  // Filtered missions
  const filteredMissions = useMemo(
    () =>
      statusFilter === 'toutes'
        ? localMissions
        : localMissions.filter((m) => m.status === statusFilter),
    [localMissions, statusFilter]
  )

  // Summary
  const summary = useMemo(() => {
    const total = localMissions.length
    const enCours = localMissions.filter((m) => m.status === 'en_cours').length
    const missionsWithProgress = localMissions.filter((m) => m.targetCount > 0)
    const avgProgress =
      missionsWithProgress.length > 0
        ? Math.round(
            missionsWithProgress.reduce(
              (acc, m) => acc + (m.currentCount / m.targetCount) * 100,
              0
            ) / missionsWithProgress.length
          )
        : 0
    return { total, enCours, avgProgress }
  }, [localMissions])

  // Actions
  const handleCloseMission = (id: string) => {
    setLocalMissions((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status: 'terminee' as const } : m
      )
    )
  }

  const handleCreateMission = (
    data: Omit<BoMission, 'id' | 'currentCount' | 'status'>
  ) => {
    const newMission: BoMission = {
      ...data,
      id: `m-${Date.now()}`,
      currentCount: 0,
      status: 'en_cours',
    }
    setLocalMissions((prev) => [newMission, ...prev])
  }

  return (
    <div className={'p-6 space-y-4 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            MISSIONS
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
            Suivi des missions d'enrôlement par zone
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="text-white self-start"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Créer mission
        </Button>
      </div>

      {localMissions.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement des missions...</p>
        </div>
      ) : localMissions.length === 0 && !loading ? (
        <div className={`flex flex-col items-center justify-center min-h-[300px] gap-4 rounded-2xl border border-dashed p-12 ${isDark ? 'border-slate-700 bg-slate-800/30' : 'border-slate-300 bg-white'}`}>
          <Target className={`h-12 w-12 ${isDark ? 'text-slate-700' : 'text-slate-200'}`} />
          <div className="text-center">
            <p className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Aucune mission</p>
            <p className={`mt-1 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Créez une première mission pour commencer.</p>
          </div>
          <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      ) : (
        <>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => {
          const Icon = STATUS_TAB_ICONS[opt.value]
          const isActive = statusFilter === opt.value
          const count =
            opt.value === 'toutes'
              ? localMissions.length
              : localMissions.filter((m) => m.status === opt.value).length
          return (
            <Button
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className={
                isActive
                  ? 'text-white'
                  : `${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`
              }
              onClick={() => setStatusFilter(opt.value)}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {opt.label}
              <span
                className={`ml-1.5 text-[11px] rounded-full px-1.5 py-0.5 ${
                  isActive ? 'bg-white/20 text-white' : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')
                }`}
              >
                {count}
              </span>
            </Button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          icon={Target}
          label="Total missions"
          value={summary.total}
          sub={`${summary.enCours} en cours`}
        />
        <SummaryCard
          icon={Clock}
          label="En cours"
          value={summary.enCours}
          sub="actives actuellement"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Taux accomplissement moyen"
          value={`${summary.avgProgress}%`}
          sub="toutes missions confondues"
        />
      </div>

      {/* Mission list */}
      <div className="space-y-3">
        {filteredMissions.length === 0 ? (
          <Card className={isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'}>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Target className={`h-12 w-12 ${isDark ? 'text-slate-700' : 'text-slate-200'} mb-3`} />
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Aucune mission trouvée
              </p>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'} mt-1`}>
                {statusFilter !== 'toutes'
                  ? `Aucune mission avec le statut « ${STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label} »`
                  : 'Créez une première mission pour commencer'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClose={handleCloseMission}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <CreateMissionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateMission}
        zones={zoneNames}
        operators={operatorNames}
      />
        </>
      )}
    </div>
  )
}
