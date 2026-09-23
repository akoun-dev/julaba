'use client'

// Dialog de création de mission de l'écran Missions back-office (DET-001
// tranche 11, MODE-1000) — JSX verbatim depuis bo-missions-screen.tsx :
// formulaire titre/description/zone/objectif/dates, sélection d'équipe
// (existante ou création rapide), multi-select d'identificateurs actifs.
// La logique de filtrage/pré-coche/payload vit dans missions-logic.ts.

import { useState, useMemo } from 'react'
import { Plus, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
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
import { useBackofficeStore } from '@/lib/stores/backoffice-store'
import {
  filterAssignableIdentificateurs,
  toggleSetMember,
  teamMemberIdsToPrecheck,
  canSubmitMission,
  buildMissionPayload,
} from '@/lib/backoffice/missions-logic'
import type { BoIdentificateur } from '@/lib/backoffice/bo-models'

export function CreateMissionDialog({
  open,
  onOpenChange,
  zones,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  zones: string[]
}) {
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const teams = useBackofficeStore((s) => s.teams)
  const identificateurs = useBackofficeStore((s) => s.identificateurs)
  const errors = useBackofficeStore((s) => s.errors)
  const createMission = useBackofficeStore((s) => s.createMission)
  const createTeam = useBackofficeStore((s) => s.createTeam)
  const loading = useBackofficeStore((s) => s.loading)
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

  const filteredIdentificateurs = useMemo(
    () => filterAssignableIdentificateurs(identificateurs, identSearch),
    [identificateurs, identSearch]
  )

  const toggleIdentificateur = (id: string) => {
    setSelectedIds((prev) => toggleSetMember(prev, id))
  }

  const handleTeamChange = (value: string) => {
    setTeamId(value)
    if (!value) return
    // Assigning a team pre-checks its current members as a shortcut — the
    // admin can still add or remove individual identificateurs afterwards.
    // Inactive agents are never pre-checked.
    const memberIds = teamMemberIdsToPrecheck(identificateurs, value)
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

  const canSubmit = canSubmitMission({ title, zone, targetCount, startDate }, submitting)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const payload = buildMissionPayload(
      { title, description, zone, targetCount, startDate, endDate, teamId },
      selectedIds
    )
    const created = await createMission(payload)
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
