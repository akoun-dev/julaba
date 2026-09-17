'use client'

/**
 * Objectifs du mois — pilotage depuis le back-office.
 *
 * Un objectif = quantité de dossiers attendue, pour un identificateur ou
 * pour une zone entière, sur un mois donné. C'est la source de vérité de
 * la « mission mensuelle » de l'app identificateur : ce que le BO fixe ici
 * est lu par l'agent via GET /api/identificateur/mission (boucle complète).
 * La progression est calculée côté API depuis les enrôlements réels.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Flag,
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin,
  Target,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Copy,
  Loader2,
  Trash2,
  Pencil,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { toast } from 'sonner'
import {
  useBackofficeStore,
  type BoObjectif,
} from '@/lib/stores/backoffice-store'
import {
  MONTHS_FR,
  monthLabel,
  objectifStatus,
  objectifProgressPct,
  type ObjectifStatus as Status,
} from '@/lib/objectifs'
import { BoPageHeader, BoEmptyState, BoStatCard, BoErrorBanner, BoFilterBar } from './bo-ui'

const STATUS_BADGES: Record<Status, { label: string; className: string }> = {
  atteint: { label: 'Atteint', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  en_avance: { label: 'En avance', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  conforme: { label: 'Conforme', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  en_retard: { label: 'En retard', className: 'bg-red-100 text-red-800 border-red-200' },
  a_venir: { label: 'À venir', className: 'bg-amber-100 text-amber-800 border-amber-200' },
}

export function BoObjectifsScreen() {
  const {
    objectifs,
    objectifsPeriode,
    objectifsMigrationPending,
    identificateurs,
    fetchObjectifs,
    fetchIdentificateurs,
    upsertObjectif,
    deleteObjectif,
    errors,
    setDomainError,
  } = useBackofficeStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BoObjectif | null>(null)
  const [scope, setScope] = useState<'identificateur' | 'zone'>('identificateur')
  const [cibleId, setCibleId] = useState('')
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const [tab, setTab] = useState<'identificateur' | 'zone'>('identificateur')

  const periode = objectifsPeriode ?? { month: new Date().getMonth(), year: new Date().getFullYear() }

  useEffect(() => {
    fetchObjectifs()
    if (identificateurs.length === 0) fetchIdentificateurs()
     
  }, [])

  // Zones proposées pour les objectifs de zone : celles du roster.
  const zones = useMemo(() => {
    const set = new Set<string>()
    for (const ident of identificateurs) {
      const z = ident.zone?.trim()
      if (z) set.add(z)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [identificateurs])

  const now = new Date()
  const visible = useMemo(() => objectifs.filter((o) => o.scope === tab), [objectifs, tab])
  const stats = useMemo(() => {
    const totalTarget = objectifs.reduce((sum, o) => sum + o.target, 0)
    const totalCurrent = objectifs.reduce((sum, o) => sum + o.current, 0)
    const atteints = objectifs.filter((o) => objectifStatus({ month: o.month, year: o.year }, o.target, o.current, now) === 'atteint').length
    const sansObjectif = identificateurs.filter(
      (i) => i.isActive && i.zone && !objectifs.some((o) => o.scope === 'identificateur' && o.cibleId === i.id)
    )
    return { totalTarget, totalCurrent, atteints, sansObjectif }
     
  }, [objectifs, identificateurs])

  const shiftMonth = (delta: number) => {
    const d = new Date(periode.year, periode.month + delta, 1)
    fetchObjectifs(d.getMonth(), d.getFullYear())
  }

  const openCreate = () => {
    setEditing(null)
    setScope('identificateur')
    setCibleId('')
    setTarget('')
    setDialogOpen(true)
  }

  const openEdit = (o: BoObjectif) => {
    setEditing(o)
    setScope(o.scope)
    setCibleId(o.scope === 'zone' ? o.cibleLabel : o.cibleId)
    setTarget(String(o.target))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const parsedTarget = Number(target)
    if (!cibleId) {
      toast.error('Sélectionnez une cible (identificateur ou zone).')
      return
    }
    if (!Number.isInteger(parsedTarget) || parsedTarget <= 0) {
      toast.error('La cible doit être un nombre entier positif.')
      return
    }
    const cibleLabel =
      scope === 'identificateur'
        ? identificateurs.find((i) => i.id === cibleId)?.name || cibleId
        : cibleId
    setSaving(true)
    const created = await upsertObjectif({
      scope, cibleId, cibleLabel,
      month: periode.month, year: periode.year, target: parsedTarget,
    })
    setSaving(false)
    if (created) {
      toast.success(editing ? 'Objectif mis à jour' : 'Objectif défini', {
        description: `${cibleLabel} · ${parsedTarget} dossiers · ${monthLabel(periode)}`,
      })
      setDialogOpen(false)
    } else {
      toast.error('Enregistrement impossible — voir le message en haut de la page.')
    }
  }

  const handleDelete = async (o: BoObjectif) => {
    setDeletingId(o.id)
    const ok = await deleteObjectif(o.id)
    setDeletingId(null)
    if (ok) toast.success(`Objectif supprimé (${o.cibleLabel})`)
    else toast.error('Suppression impossible — voir le message en haut de la page.')
  }

  const duplicatePrevious = async () => {
    setDuplicating(true)
    try {
      const prev = new Date(periode.year, periode.month - 1, 1)
      const res = await fetch(`/api/backoffice/objectifs?month=${prev.getMonth()}&year=${prev.getFullYear()}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const previous: BoObjectif[] = ((data.objectifs as Record<string, unknown>[]) || []).map((o) => ({
        id: o.id as string,
        scope: o.scope as BoObjectif['scope'],
        cibleId: (o.cible_id ?? o.cibleId) as string,
        cibleLabel: (o.cible_label ?? o.cibleLabel) as string,
        month: o.month as number,
        year: o.year as number,
        target: o.target as number,
        current: 0,
        createdAt: '',
        updatedAt: '',
      }))
      if (previous.length === 0) {
        toast.info(`Aucun objectif à dupliquer depuis ${monthLabel({ month: prev.getMonth(), year: prev.getFullYear() })}.`)
        return
      }
      let copied = 0
      for (const o of previous) {
        const created = await upsertObjectif({
          scope: o.scope, cibleId: o.cibleId, cibleLabel: o.cibleLabel,
          month: periode.month, year: periode.year, target: o.target,
        })
        if (created) copied++
      }
      toast.success(`${copied} objectif(s) dupliqué(s) depuis ${monthLabel({ month: prev.getMonth(), year: prev.getFullYear() })}.`)
    } catch {
      toast.error('Duplication impossible — voir le message en haut de la page.')
    } finally {
      setDuplicating(false)
    }
  }

  const error = errors.objectifs ?? null

  return (
    <div className="space-y-6">
      <BoPageHeader
        title="Objectifs"
        description="Objectifs mensuels de dossiers par identificateur ou par zone — la mission mensuelle de l'app en découle automatiquement."
        actions={
          <>
            <Button type="button" variant="outline" onClick={duplicatePrevious} disabled={duplicating} className="gap-1.5">
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Dupliquer le mois précédent
            </Button>
            <Button type="button" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouvel objectif
            </Button>
          </>
        }
      />

      {error && <BoErrorBanner message={error} onRetry={() => { setDomainError('objectifs', null); fetchObjectifs(periode.month, periode.year) }} />}

      {objectifsMigrationPending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          La table des objectifs n’existe pas encore sur la base (migration 20260917140000 en attente d’application).
        </div>
      )}

      {/* Navigation par mois */}
      <BoFilterBar>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10.5rem] text-center text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
            {monthLabel(periode)}
          </span>
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </BoFilterBar>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BoStatCard icon={Flag} label="Objectifs définis" value={objectifs.length} tone="blue" />
        <BoStatCard icon={Target} label="Dossiers attendus" value={stats.totalTarget} hint="cumul des cibles" />
        <BoStatCard icon={TrendingUp} label="Dossiers réalisés" value={stats.totalCurrent} tone="emerald" hint="soumis ce mois" />
        <BoStatCard
          icon={AlertTriangle}
          label="Agents sans objectif"
          value={stats.sansObjectif.length}
          tone={stats.sansObjectif.length > 0 ? 'amber' : 'emerald'}
          hint="identificateurs actifs"
        />
      </div>

      {/* Onglets identificateur / zone */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'identificateur' | 'zone')}>
        <TabsList>
          <TabsTrigger value="identificateur" className="gap-1.5">
            <Users className="h-4 w-4" />
            Par identificateur
          </TabsTrigger>
          <TabsTrigger value="zone" className="gap-1.5">
            <MapPin className="h-4 w-4" />
            Par zone
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Liste */}
      {visible.length === 0 ? (
        <BoEmptyState
          icon={Flag}
          title={`Aucun objectif ${tab === 'zone' ? 'de zone' : 'individuel'} pour ${monthLabel(periode)}`}
          description="Fixez la quantité de dossiers attendue — elle devient la mission mensuelle affichée à l'agent sur l'app."
          action={
            <Button type="button" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Définir un objectif
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((o) => {
            const status = objectifStatus({ month: o.month, year: o.year }, o.target, o.current, now)
            const pct = objectifProgressPct(o.target, o.current)
            const badge = STATUS_BADGES[status]
            return (
              <Card key={o.id} className="bg-white dark:bg-slate-800 dark:border-slate-700">
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {o.scope === 'zone' ? (
                          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <Users className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <h3 className="truncate font-bold text-slate-900 dark:text-slate-100">{o.cibleLabel}</h3>
                        <Badge variant="outline" className="text-[11px] capitalize">{o.scope}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {monthLabel(o)} · mis à jour le{' '}
                        {new Date(o.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`border ${badge.className}`}>{badge.label}</Badge>
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(o)} aria-label={`Modifier ${o.cibleLabel}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(o)}
                        disabled={deletingId === o.id}
                        aria-label={`Supprimer ${o.cibleLabel}`}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        {deletingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {o.current}
                      <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> / {o.target} dossiers</span>
                    </p>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{pct} %</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  {status === 'atteint' && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Objectif atteint — mission mensuelle à 100 % sur l'app.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Rappel des agents sans objectif */}
      {tab === 'identificateur' && stats.sansObjectif.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {stats.sansObjectif.length} identificateur(s) actif(s) sans objectif individuel ce mois
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {stats.sansObjectif.map((i) => i.name).join(', ')} — sans objectif, l'app de l'agent conserve une cible par défaut.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l’objectif' : 'Nouvel objectif'}</DialogTitle>
            <DialogDescription>
              {monthLabel(periode)} — la cible devient la mission mensuelle de l'agent sur l'app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Portée</Label>
              <Select
                value={scope}
                onValueChange={(v) => { setScope(v as 'identificateur' | 'zone'); setCibleId('') }}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="identificateur">Un identificateur</SelectItem>
                  <SelectItem value="zone">Une zone entière</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{scope === 'identificateur' ? 'Identificateur' : 'Zone'}</Label>
              {scope === 'identificateur' ? (
                <Select value={cibleId} onValueChange={setCibleId} disabled={Boolean(editing)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {identificateurs.filter((i) => i.isActive).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}{i.agentCode ? ` · ${i.agentCode}` : ''}{i.zone ? ` (${i.zone})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={cibleId} onValueChange={setCibleId} disabled={Boolean(editing)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="objectif-target">Dossiers attendus</Label>
              <Input
                id="objectif-target"
                type="number"
                min={1}
                step={1}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="ex. 40"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Enregistrer' : 'Définir l’objectif'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
