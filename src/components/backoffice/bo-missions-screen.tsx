'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Target,
  Plus,
  MapPin,
  User,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  PauseCircle,
  Loader2,
  RefreshCw,
  Eye,
  Search,
  Shield,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  type BoMission,
  type BoIdentificateur,
} from '@/lib/stores/backoffice-store'
import {
  BoPageHeader,
  BoEmptyState,
  BoStatCard,
} from './bo-ui'

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

function formatDate(d: string) {
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

// ============== MISSION CARD ==============

function MissionCard({
  mission,
  onClose,
  onViewDetails,
}: {
  mission: BoMission
  onClose: (id: string) => void
  onViewDetails: (id: string) => void
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const progress =
    mission.targetCount > 0
      ? Math.min((mission.currentCount / mission.targetCount) * 100, 100)
      : 0

  return (
    <Card className={`${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'} transition-shadow ${isDark ? '' : 'hover:shadow-sm'}`}>
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
          {mission.teamName && (
            <span className="flex items-center gap-1.5">
              <Shield className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              {mission.teamName}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <User className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            {mission.assignees.length > 0 ? (
              mission.assignees.length === 1
                ? mission.assignees[0].name
                : `${mission.assignees.length} identificateurs`
            ) : (
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
              Enrôlements réalisés
            </span>
            <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {mission.currentCount}/{mission.targetCount} ({Math.round(progress)}%)
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(mission.id)}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Voir détails
          </Button>
          {mission.status === 'en_cours' && (
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => onClose(mission.id)}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Clôturer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============== CREATE MISSION DIALOG ==============

function CreateMissionDialog({
  open,
  onOpenChange,
  zones,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  zones: string[]
}) {
  const { boTheme, teams, identificateurs, errors, createMission, createTeam, loading } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [zone, setZone] = useState('')
  const [targetCount, setTargetCount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [teamId, setTeamId] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [identSearch, setIdentSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamZone, setNewTeamZone] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const filteredIdentificateurs = useMemo(() => {
    const q = identSearch.trim().toLowerCase()
    if (!q) return identificateurs
    return identificateurs.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.zone || '').toLowerCase().includes(q)
    )
  }, [identificateurs, identSearch])

  const toggleIdentificateur = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleTeamChange = (value: string) => {
    setTeamId(value)
    if (!value) return
    // Assigning a team pre-checks its current members as a shortcut — the
    // admin can still add or remove individual identificateurs afterwards.
    const memberIds = identificateurs.filter((i) => i.teamId === value).map((i) => i.id)
    setSelectedIds((prev) => new Set([...prev, ...memberIds]))
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    setCreatingTeam(true)
    const team = await createTeam({ name: newTeamName.trim(), zone: newTeamZone || undefined })
    setCreatingTeam(false)
    if (team) {
      setTeamId(team.id)
      setShowNewTeam(false)
      setNewTeamName('')
      setNewTeamZone('')
    }
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setZone('')
    setTargetCount('')
    setStartDate('')
    setEndDate('')
    setTeamId('')
    setSelectedIds(new Set())
    setIdentSearch('')
    setShowNewTeam(false)
    setNewTeamName('')
    setNewTeamZone('')
  }

  const canSubmit =
    title.trim().length > 0 &&
    zone.length > 0 &&
    targetCount.length > 0 &&
    startDate.length > 0 &&
    !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const created = await createMission({
      title: title.trim(),
      description: description.trim(),
      zone,
      targetCount: parseInt(targetCount) || 0,
      startDate,
      endDate: endDate || undefined,
      teamId: teamId || undefined,
      identificateurIds: Array.from(selectedIds),
    })
    setSubmitting(false)
    if (created) {
      resetForm()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Créer une nouvelle mission
          </DialogTitle>
          <DialogDescription>
            Définissez un objectif d'enrôlement pour une zone et assignez l'équipe qui le réalisera.
          </DialogDescription>
          {errors.missions && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.missions}
            </p>
          )}
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

          {/* Team assignment */}
          <div className="space-y-2">
            <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Équipe (optionnel)
            </Label>
            {!showNewTeam ? (
              <div className="flex gap-2">
                <Select value={teamId || '__none__'} onValueChange={(v) => handleTeamChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger className={`w-full ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <SelectValue placeholder="Aucune équipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune équipe</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.memberCount} membre{t.memberCount > 1 ? 's' : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewTeam(true)} className="shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                  Équipe
                </Button>
              </div>
            ) : (
              <div className={`space-y-2 rounded-lg border p-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <Input
                  placeholder="Nom de l'équipe (ex: Équipe Nord)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className={isDark ? 'border-slate-700' : 'border-slate-200'}
                />
                <Select value={newTeamZone || '__none__'} onValueChange={(v) => setNewTeamZone(v === '__none__' ? '' : v)}>
                  <SelectTrigger className={`w-full ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <SelectValue placeholder="Zone (optionnel)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune zone</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewTeam(false)}>
                    Annuler
                  </Button>
                  <Button type="button" size="sm" className="text-white" disabled={!newTeamName.trim() || creatingTeam} onClick={handleCreateTeam}>
                    {creatingTeam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Créer l'équipe
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Identificateurs multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Identificateurs assignés
              </Label>
              {selectedIds.size > 0 && (
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <Input
                placeholder="Rechercher un identificateur..."
                value={identSearch}
                onChange={(e) => setIdentSearch(e.target.value)}
                className={`pl-8 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
              />
            </div>
            <ScrollArea className={`h-40 rounded-lg border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="p-2 space-y-1">
                {loading && identificateurs.length === 0 ? (
                  <p className={`p-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement...</p>
                ) : filteredIdentificateurs.length === 0 ? (
                  <p className={`p-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Aucun identificateur trouvé. Le registre se remplit automatiquement dès qu'un agent soumet un dossier.
                  </p>
                ) : (
                  filteredIdentificateurs.map((ident: BoIdentificateur) => (
                    <label
                      key={ident.id}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
                    >
                      <Checkbox
                        checked={selectedIds.has(ident.id)}
                        onCheckedChange={() => toggleIdentificateur(ident.id)}
                      />
                      <span className={`text-sm flex-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        {ident.name}
                      </span>
                      {ident.zone && (
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{ident.zone}</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
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
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Créer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============== MISSION DETAIL DIALOG ==============

interface MissionDetailAssignee {
  id: string
  name: string
  zone: string | null
  enrolmentCount: number
}

interface MissionDetailEnrolment {
  id: string
  actor_name: string
  status: string
  submitted_at: string
  identificateur_name: string
}

interface MissionDetail {
  id: string
  title: string
  description: string | null
  zone: string
  status: BoMission['status']
  target_count: number
  current_count: number
  start_date: string
  end_date: string | null
  team: { id: string; name: string } | null
  assignees: MissionDetailAssignee[]
  recent_enrolments: MissionDetailEnrolment[]
}

function MissionDetailDialog({
  missionId,
  onOpenChange,
}: {
  missionId: string | null
  onOpenChange: (v: boolean) => void
}) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!missionId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/backoffice/missions/${missionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json()
      })
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [missionId])

  const progress = detail && detail.target_count > 0
    ? Math.min((detail.current_count / detail.target_count) * 100, 100)
    : 0

  return (
    <Dialog open={!!missionId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Détails de la mission</DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : detail ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle className={`text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {detail.title}
                </DialogTitle>
                <Badge className={`text-[11px] font-medium border ${STATUS_BADGE_STYLES[detail.status] || ''}`}>
                  {STATUS_LABELS[detail.status]}
                </Badge>
              </div>
              {detail.description && (
                <DialogDescription>{detail.description}</DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-5">
              <div className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{detail.zone}</span>
                {detail.team && <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{detail.team.name}</span>}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(detail.start_date)}{detail.end_date ? ` — ${formatDate(detail.end_date)}` : ''}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
                    <Target className="inline h-3 w-3 mr-1" />
                    Progression vers l'objectif
                  </span>
                  <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {detail.current_count}/{detail.target_count} ({Math.round(progress)}%)
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className={`flex items-center gap-1.5 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Users className="h-4 w-4" />
                  Identificateurs assignés ({detail.assignees.length})
                </h4>
                {detail.assignees.length === 0 ? (
                  <p className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun identificateur assigné.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.assignees.map((a) => (
                      <div key={a.id} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${isDark ? 'bg-slate-700/40' : 'bg-slate-50'}`}>
                        <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                          {a.name}
                          {a.zone && <span className={`ml-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>· {a.zone}</span>}
                        </span>
                        <Badge variant="outline" className={isDark ? 'border-slate-600 text-slate-300' : ''}>
                          {a.enrolmentCount} enrôlement{a.enrolmentCount > 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Enrôlements récents de la mission
                </h4>
                {detail.recent_enrolments.length === 0 ? (
                  <p className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun enrôlement encore soumis pour cette mission.</p>
                ) : (
                  <ScrollArea className="h-48 rounded-lg border">
                    <div className="divide-y">
                      {detail.recent_enrolments.map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{e.actor_name}</p>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {e.identificateur_name} · {formatDate(e.submitted_at)}
                            </p>
                          </div>
                          <Badge className={`text-[11px] shrink-0 ${STATUS_BADGE_STYLES[e.status] || (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}`}>
                            {STATUS_LABELS[e.status] || e.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ============== MAIN COMPONENT ==============

export function BoMissionsScreen() {
  const { missions, zones, boTheme, loading, fetchAllData, updateMissionStatus } = useBackofficeStore()
  const isDark = boTheme === 'dark'
  const [statusFilter, setStatusFilter] = useState<MissionStatusFilter>('toutes')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailMissionId, setDetailMissionId] = useState<string | null>(null)

  // Available zones for the create form
  const zoneNames = useMemo(() => zones.map((z) => z.name), [zones])

  // Filtered missions
  const filteredMissions = useMemo(
    () =>
      statusFilter === 'toutes'
        ? missions
        : missions.filter((m) => m.status === statusFilter),
    [missions, statusFilter]
  )

  // Summary
  const summary = useMemo(() => {
    const total = missions.length
    const enCours = missions.filter((m) => m.status === 'en_cours').length
    const missionsWithProgress = missions.filter((m) => m.targetCount > 0)
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
  }, [missions])

  const handleCloseMission = (id: string) => {
    updateMissionStatus(id, 'terminee')
  }

  return (
    <div className={'p-6 space-y-4 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
      {/* Title */}
      <BoPageHeader
        title="Missions"
        description="Suivi des missions d'enrôlement par zone"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="text-white">
            <Plus className="mr-1.5 h-4 w-4" />
            Créer mission
          </Button>
        }
      />

      {missions.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement des missions...</p>
        </div>
      ) : missions.length === 0 && !loading ? (
        <BoEmptyState
          icon={Target}
          title="Aucune mission"
          description="Créez une première mission pour commencer."
          action={
            <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          }
        />
      ) : (
        <>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => {
          const Icon = STATUS_TAB_ICONS[opt.value]
          const isActive = statusFilter === opt.value
          const count =
            opt.value === 'toutes'
              ? missions.length
              : missions.filter((m) => m.status === opt.value).length
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
        <BoStatCard
          icon={Target}
          label="Total missions"
          value={summary.total.toLocaleString('fr-FR')}
          hint={`${summary.enCours} en cours`}
        />
        <BoStatCard
          icon={Clock}
          label="En cours"
          value={summary.enCours.toLocaleString('fr-FR')}
          hint="actives actuellement"
          tone="blue"
        />
        <BoStatCard
          icon={CheckCircle2}
          label="Taux accomplissement moyen"
          value={`${summary.avgProgress}%`}
          hint="toutes missions confondues"
          tone="emerald"
        />
      </div>

      {/* Mission list */}
      <div className="space-y-3">
        {filteredMissions.length === 0 ? (
          <BoEmptyState
            icon={Target}
            title="Aucune mission trouvée"
            description={
              statusFilter !== 'toutes'
                ? `Aucune mission avec le statut « ${STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label} »`
                : 'Créez une première mission pour commencer'
            }
            action={
              statusFilter !== 'toutes' ? (
                <Button variant="outline" onClick={() => setStatusFilter('toutes')}>
                  Réinitialiser les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          filteredMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClose={handleCloseMission}
              onViewDetails={setDetailMissionId}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <CreateMissionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        zones={zoneNames}
      />

      {/* Detail dialog */}
      <MissionDetailDialog
        missionId={detailMissionId}
        onOpenChange={(v) => { if (!v) setDetailMissionId(null) }}
      />
        </>
      )}
    </div>
  )
}
