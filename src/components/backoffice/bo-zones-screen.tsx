'use client'

import { useState, useMemo } from 'react'
import {
  MapPin,
  Users,
  UserCheck,
  Plus,
  Target,
  X,
  Map,
  CheckCircle2,
  XCircle,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useBackofficeStore,
  BO_COLOR,
  type BoZone,
  type BoActor,
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============

const REGIONS = ['Abidjan', 'Centre', 'Ouest', 'Nord', 'Sud', 'Est'] as const

type RegionType = (typeof REGIONS)[number]

const REGION_COLORS: Record<string, string> = {
  Abidjan: 'bg-amber-100 text-amber-800',
  Centre: 'bg-emerald-100 text-emerald-800',
  Ouest: 'bg-sky-100 text-sky-800',
  Nord: 'bg-orange-100 text-orange-800',
  Sud: 'bg-teal-100 text-teal-800',
  Est: 'bg-rose-100 text-rose-800',
}

// ============== MOCK DATA FOR DETAIL ==============

function generateMockIdentificateurs(zoneName: string, count: number) {
  const names = [
    'Kouadio Jean',
    'Bamba Fatou',
    'Diaby Ibrahim',
    'Soro Marie',
    'Traoré Moussa',
    'Koné Aminata',
    'Ouattara Yao',
    'Camara Awa',
  ]
  return names.slice(0, count).map((name, i) => ({
    id: `id-${zoneName}-${i}`,
    name,
    enrolledToday: Math.floor(Math.random() * 8) + 1,
    totalEnrolled: Math.floor(Math.random() * 300) + 50,
  isActive: Math.random() > 0.2,
  }))
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
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${BO_COLOR}0F` }}
        >
          <Icon className="h-5 w-5" style={{ color: BO_COLOR }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="text-xl font-bold" style={{ color: BO_COLOR }}>
            {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
          </p>
          {sub && (
            <p className="text-xs text-slate-400 truncate">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============== ZONE CARD ==============

function ZoneCard({
  zone,
  onClick,
}: {
  zone: BoZone
  onClick: () => void
}) {
  const progress = zone.target > 0 ? Math.min((zone.actorCount / zone.target) * 100, 100) : 0

  return (
    <Card
      className="border-slate-200 cursor-pointer transition-all hover:shadow-md hover:border-slate-300 group"
      onClick={onClick}
    >
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className="font-bold text-base truncate group-hover:underline"
              style={{ color: BO_COLOR }}
            >
              {zone.name}
            </h3>
            <Badge
              variant="secondary"
              className={`mt-1.5 text-[11px] font-medium ${REGION_COLORS[zone.region] || 'bg-slate-100 text-slate-700'}`}
            >
              <MapPin className="mr-1 h-3 w-3" />
              {zone.region}
            </Badge>
          </div>
          <Badge
            variant="secondary"
            className={`shrink-0 text-[11px] font-medium ${zone.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {zone.isActive ? (
              <CheckCircle2 className="mr-1 h-3 w-3" />
            ) : (
              <XCircle className="mr-1 h-3 w-3" />
            )}
            {zone.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 text-slate-400">
              <UserCheck className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Identificateurs</span>
            </div>
            <p className="mt-1 text-lg font-bold" style={{ color: BO_COLOR }}>
              {zone.identificateurCount}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Acteurs</span>
            </div>
            <p className="mt-1 text-lg font-bold" style={{ color: BO_COLOR }}>
              {zone.actorCount.toLocaleString('fr-FR')}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Objectif</span>
            <span className="font-semibold" style={{ color: BO_COLOR }}>
              {zone.actorCount}/{zone.target} ({Math.round(progress)}%)
            </span>
          </div>
          <Progress
            value={progress}
            className="h-2"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ============== DETAIL DIALOG ==============

function ZoneDetailDialog({
  zone,
  actors,
  open,
  onOpenChange,
}: {
  zone: BoZone | null
  actors: BoActor[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!zone) return null

  const zoneActors = actors.filter((a) => a.zone === zone.name)
  const identificateurs = generateMockIdentificateurs(zone.name, zone.identificateurCount)

  const typeBreakdown = zoneActors.reduce(
    (acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const progress = zone.target > 0 ? Math.min((zone.actorCount / zone.target) * 100, 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl" style={{ color: BO_COLOR }}>
            {zone.name}
          </DialogTitle>
          <DialogDescription>
            Détails de la zone — {zone.region}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Map placeholder */}
          <div className="relative w-full h-48 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-2 overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="w-full h-full" style={{
                backgroundImage: 'radial-gradient(circle, #999 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }} />
            </div>
            <Map className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400 font-medium">
              Carte de la zone — {zone.name}
            </p>
            <p className="text-xs text-slate-300">
              {zone.actorCount} acteurs répertoriés
            </p>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {zone.actorCount}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Acteurs</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {zone.identificateurCount}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Identificateurs</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: BO_COLOR }}>
                {Math.round(progress)}%
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Objectif</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-600">Progression objectif</span>
              <span className="font-semibold" style={{ color: BO_COLOR }}>
                {zone.actorCount} / {zone.target}
              </span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          <Separator />

          {/* Actor breakdown */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: BO_COLOR }}>
              Répartition par type d'acteur
            </h4>
            <div className="space-y-2.5">
              {(['marchand', 'producteur', 'cooperatif'] as const).map((type) => {
                const count = typeBreakdown[type] || 0
                const pct = zoneActors.length > 0 ? Math.round((count / zoneActors.length) * 100) : 0
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{ACTOR_TYPE_ICONS[type]}</span>
                    <span className="text-sm text-slate-600 w-28">{ACTOR_TYPE_LABELS[type]}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: BO_COLOR,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-14 text-right" style={{ color: BO_COLOR }}>
                      {count} <span className="text-slate-400 font-normal">({pct}%)</span>
                      </span>
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Identificateurs list */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: BO_COLOR }}>
              Identificateurs ({zone.identificateurCount})
            </h4>
            <ScrollArea className="h-48 rounded-lg border border-slate-200">
              <div className="p-2 space-y-1">
                {identificateurs.map((id) => (
                  <div
                    key={id.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`h-2 w-2 rounded-full ${id.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      />
                      <span className="text-sm font-medium text-slate-700">{id.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold" style={{ color: BO_COLOR }}>
                        {id.totalEnrolled}
                      </p>
                      <p className="text-[10px] text-slate-400">aujourd'hui: {id.enrolledToday}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============== CREATE ZONE DIALOG ==============

function CreateZoneDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (zone: Omit<BoZone, 'id' | 'identificateurCount' | 'actorCount'>) => void
}) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState<RegionType | ''>('')
  const [target, setTarget] = useState('1500')

  const canSubmit = name.trim().length > 0 && region !== ''

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      region,
      isActive: true,
      target: parseInt(target) || 1500,
    })
    setName('')
    setRegion('')
    setTarget('1500')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg" style={{ color: BO_COLOR }}>
            Créer une nouvelle zone
          </DialogTitle>
          <DialogDescription>
            Ajoutez un nouveau territoire de couverture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium" style={{ color: BO_COLOR }}>
              Nom de la zone
            </Label>
            <Input
              placeholder="Ex: Marcory, Koumassi..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-200"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" style={{ color: BO_COLOR }}>
              Région
            </Label>
            <Select value={region} onValueChange={(v) => setRegion(v as RegionType)}>
              <SelectTrigger className="w-full border-slate-200">
                <SelectValue placeholder="Sélectionner une région" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" style={{ color: BO_COLOR }}>
              Objectif (cible acteurs)
            </Label>
            <Input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              className="border-slate-200"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="text-white"
              style={{ backgroundColor: BO_COLOR }}
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

export function BoZonesScreen() {
  const { zones, actors } = useBackofficeStore()
  const [localZones, setLocalZones] = useState<BoZone[]>(zones)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailZone, setDetailZone] = useState<BoZone | null>(null)

  // Sync from store (initial load)
  const zonesData = localZones

  const summary = useMemo(
    () => ({
      total: zonesData.length,
      active: zonesData.filter((z) => z.isActive).length,
      totalIdentificateurs: zonesData.reduce((s, z) => s + z.identificateurCount, 0),
      totalActors: zonesData.reduce((s, z) => s + z.actorCount, 0),
    }),
    [zonesData]
  )

  const handleCreateZone = (data: Omit<BoZone, 'id' | 'identificateurCount' | 'actorCount'>) => {
    const newZone: BoZone = {
      ...data,
      id: `zone-${Date.now()}`,
      identificateurCount: 0,
      actorCount: 0,
    }
    setLocalZones((prev) => [...prev, newZone])
  }

  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
            🗺️ ZONES & TERRITOIRES
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion des zones de couverture et territoires d'intervention
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="text-white self-start"
          style={{ backgroundColor: BO_COLOR }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Créer zone
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={MapPin}
          label="Total zones"
          value={summary.total}
          sub={`${summary.active} actives`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Zones actives"
          value={summary.active}
          sub={`${summary.total - summary.active} inactives`}
        />
        <SummaryCard
          icon={UserCheck}
          label="Total identificateurs"
          value={summary.totalIdentificateurs}
          sub="sur toutes les zones"
        />
        <SummaryCard
          icon={Users}
          label="Total acteurs"
          value={summary.totalActors}
          sub="enrôlés au total"
        />
      </div>

      {/* Zone grid */}
      <div>
        <h2 className="text-base font-semibold mb-4" style={{ color: BO_COLOR }}>
          Liste des zones ({zonesData.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zonesData.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onClick={() => setDetailZone(zone)}
            />
          ))}
        </div>
      </div>

      {/* Create dialog */}
      <CreateZoneDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateZone}
      />

      {/* Detail dialog */}
      <ZoneDetailDialog
        zone={detailZone}
        actors={actors}
        open={!!detailZone}
        onOpenChange={(v) => !v && setDetailZone(null)}
      />
    </div>
  )
}