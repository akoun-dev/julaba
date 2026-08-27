'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Search,
  Eye,
  Pause,
  PlayCircle,
  Download,
  Bell,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  User,
  Calendar,
  ShieldCheck,
  StickyNote,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
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
} from '@/components/ui/dialog'
import {
  useBackofficeStore,
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
  type BoActor,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============
const ITEMS_PER_PAGE = 15

type ActorTypeFilter = 'tous' | 'marchand' | 'producteur' | 'cooperatif'
type ActorStatusFilter = 'tous' | 'actif' | 'suspendu' | 'en_attente' | 'rejete'

// ============== MAIN COMPONENT ==============

export function BoActeursScreen() {
  const { actors, updateActorStatus, searchQuery, setSearchQuery } =
    useBackofficeStore()

  // Local state
  const [typeFilter, setTypeFilter] = useState<ActorTypeFilter>('tous')
  const [statusFilter, setStatusFilter] = useState<ActorStatusFilter>('tous')
  const [zoneFilter, setZoneFilter] = useState<string>('tous')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set())
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailActor, setDetailActor] = useState<BoActor | null>(null)

  // Unique zones from data
  const zones = useMemo(() => {
    const zoneSet = new Set(actors.map((a) => a.zone))
    return Array.from(zoneSet).sort()
  }, [actors])

  // Filtered actors
  const filteredActors = useMemo(() => {
    return actors.filter((actor) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesSearch =
          actor.firstName.toLowerCase().includes(q) ||
          actor.lastName.toLowerCase().includes(q) ||
          actor.actorId.toLowerCase().includes(q) ||
          actor.phone.includes(q) ||
          actor.zone.toLowerCase().includes(q)
        if (!matchesSearch) return false
      }

      // Type filter
      if (typeFilter !== 'tous' && actor.type !== typeFilter) return false

      // Status filter
      if (statusFilter !== 'tous' && actor.status !== statusFilter) return false

      // Zone filter
      if (zoneFilter !== 'tous' && actor.zone !== zoneFilter) return false

      return true
    })
  }, [actors, searchQuery, typeFilter, statusFilter, zoneFilter])

  // Counters
  const counts = useMemo(() => {
    return {
      total: actors.length,
      marchands: actors.filter((a) => a.type === 'marchand').length,
      producteurs: actors.filter((a) => a.type === 'producteur').length,
      cooperatives: actors.filter((a) => a.type === 'cooperatif').length,
    }
  }, [actors])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredActors.length / ITEMS_PER_PAGE))
  const paginatedActors = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredActors.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredActors, currentPage])

  // Reset page when filters change
  const handleTypeFilterChange = useCallback((val: string) => {
    setTypeFilter(val as ActorTypeFilter)
    setCurrentPage(1)
    setSelectedActors(new Set())
  }, [])

  const handleStatusFilterChange = useCallback((val: string) => {
    setStatusFilter(val as ActorStatusFilter)
    setCurrentPage(1)
    setSelectedActors(new Set())
  }, [])

  const handleZoneFilterChange = useCallback((val: string) => {
    setZoneFilter(val)
    setCurrentPage(1)
    setSelectedActors(new Set())
  }, [])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
      setCurrentPage(1)
      setSelectedActors(new Set())
    },
    [setSearchQuery]
  )

  // Selection
  const toggleSelectAll = useCallback(() => {
    if (selectedActors.size === paginatedActors.length) {
      setSelectedActors(new Set())
    } else {
      setSelectedActors(new Set(paginatedActors.map((a) => a.id)))
    }
  }, [selectedActors, paginatedActors])

  const toggleSelectActor = useCallback((id: string) => {
    setSelectedActors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isAllSelected =
    paginatedActors.length > 0 && selectedActors.size === paginatedActors.length

  // Actions
  const handleViewActor = useCallback((actor: BoActor) => {
    setDetailActor(actor)
    setShowDetailModal(true)
  }, [])

  const handleSuspend = useCallback(
    (actor: BoActor) => {
      updateActorStatus(actor.id, 'suspendu')
    },
    [updateActorStatus]
  )

  const handleReactivate = useCallback(
    (actor: BoActor) => {
      updateActorStatus(actor.id, 'actif')
    },
    [updateActorStatus]
  )

  // CSV Export
  const handleExportCSV = useCallback(() => {
    const selected = actors.filter((a) => selectedActors.has(a.id))
    if (selected.length === 0) return

    const headers = [
      'ID Acteur',
      'Prénom',
      'Nom',
      'Type',
      'Téléphone',
      'Zone',
      'Statut',
      'Identificateur',
      'Validé par',
      'Date validation',
      'Date création',
    ]
    const rows = selected.map((a) => [
      a.actorId,
      a.firstName,
      a.lastName,
      ACTOR_TYPE_LABELS[a.type],
      a.phone,
      a.zone,
      STATUS_LABELS[a.status],
      a.identificateurName || '',
      a.validatedBy || '',
      a.validatedAt ? new Date(a.validatedAt).toLocaleDateString('fr-FR') : '',
      new Date(a.createdAt).toLocaleDateString('fr-FR'),
    ])
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `acteurs_export_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [actors, selectedActors])

  // Reset filters
  const resetFilters = useCallback(() => {
    setTypeFilter('tous')
    setStatusFilter('tous')
    setZoneFilter('tous')
    setSearchQuery('')
    setCurrentPage(1)
    setSelectedActors(new Set())
  }, [setSearchQuery])

  const hasActiveFilters =
    typeFilter !== 'tous' || statusFilter !== 'tous' || zoneFilter !== 'tous' || searchQuery !== ''

  // ============== RENDER ==============

  return (
    <div className="space-y-4 p-6">
      {/* ===== HEADER ===== */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: '#333333' }}
        >
          👥 GESTION DES ACTEURS
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consultez, filtrez et gérez l\'ensemble des acteurs enregistrés sur la
          plateforme Jùlaba.
        </p>
      </div>

      {/* ===== SEARCH ===== */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, téléphone, ID, zone..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* ===== FILTERS ===== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium" style={{ color: '#333333' }}>
              Filtres :
            </span>

            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="marchand">
                  🏪 Marchand(e)s
                </SelectItem>
                <SelectItem value="producteur">
                  🌾 Producteur(rice)s
                </SelectItem>
                <SelectItem value="cooperatif">
                  🤝 Coopératives
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les statuts</SelectItem>
                <SelectItem value="actif">✅ Actif</SelectItem>
                <SelectItem value="suspendu">⏸️ Suspendu</SelectItem>
                <SelectItem value="en_attente">⏳ En attente</SelectItem>
                <SelectItem value="rejete">❌ Rejeté</SelectItem>
              </SelectContent>
            </Select>

            <Select value={zoneFilter} onValueChange={handleZoneFilterChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    📍 {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===== COUNTER BAR ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-gray-100 text-lg">
              👥
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#333333' }}>
                {counts.total}
              </p>
              <p className="text-xs text-muted-foreground">Total acteurs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-orange-50 text-lg">
              🏪
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#333333' }}>
                {counts.marchands}
              </p>
              <p className="text-xs text-muted-foreground">Marchands</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-green-50 text-lg">
              🌾
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#333333' }}>
                {counts.producteurs}
              </p>
              <p className="text-xs text-muted-foreground">Producteurs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-amber-50 text-lg">
              🤝
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#333333' }}>
                {counts.cooperatives}
              </p>
              <p className="text-xs text-muted-foreground">Coopératives</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== BULK ACTIONS ===== */}
      {selectedActors.size > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: '#333333' }}>
              <strong>{selectedActors.size}</strong> acteur(s) sélectionné(s)
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCSV}>
                <Download className="size-3.5 mr-1.5" />
                Exporter CSV
              </Button>
              <Button size="sm" variant="outline">
                <Bell className="size-3.5 mr-1.5" />
                Notifier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== DATA TABLE ===== */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[620px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b">
                <tr>
                  <th className="w-10 px-3 py-3 text-left">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tout"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    ID
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Nom complet
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Type
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Zone
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Téléphone
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Identificateur
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Statut
                  </th>
                  <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedActors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <User className="size-8 opacity-30" />
                        <p>Aucun acteur trouvé</p>
                        {hasActiveFilters && (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={resetFilters}
                          >
                            Réinitialiser les filtres
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedActors.map((actor) => {
                    const isSelected = selectedActors.has(actor.id)
                    return (
                      <tr
                        key={actor.id}
                        className={`${
                          isSelected
                            ? 'bg-amber-50/60'
                            : 'hover:bg-gray-50/80'
                        } transition-colors`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectActor(actor.id)}
                            aria-label={`Sélectionner ${actor.firstName} ${actor.lastName}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs font-semibold" style={{ color: '#333333' }}>
                            {actor.actorId}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center size-7 rounded-full bg-gray-200 text-xs font-semibold text-gray-600 shrink-0">
                              {actor.firstName.charAt(0)}
                              {actor.lastName.charAt(0)}
                            </div>
                            <span className="font-medium" style={{ color: '#333333' }}>
                              {actor.firstName} {actor.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{ACTOR_TYPE_ICONS[actor.type]}</span>
                            <span className="text-xs text-muted-foreground">
                              {ACTOR_TYPE_LABELS[actor.type]}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-muted-foreground">
                            {actor.zone}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-muted-foreground">
                            {actor.phone}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-muted-foreground">
                            {actor.identificateurName || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_COLORS[actor.status] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {STATUS_LABELS[actor.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleViewActor(actor)}
                              title="Voir les détails"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {actor.status === 'actif' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => handleSuspend(actor)}
                                title="Suspendre cet acteur"
                              >
                                <Pause className="size-3.5" />
                              </Button>
                            )}
                            {actor.status === 'suspendu' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleReactivate(actor)}
                                title="Réactiver cet acteur"
                              >
                                <PlayCircle className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ===== PAGINATION ===== */}
          {filteredActors.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50/50">
              <p className="text-xs text-muted-foreground">
                Affichage de{' '}
                <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> à{' '}
                <strong>
                  {Math.min(
                    currentPage * ITEMS_PER_PAGE,
                    filteredActors.length
                  )}
                </strong>{' '}
                sur <strong>{filteredActors.length}</strong> résultat(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-3.5 mr-1" />
                  Précédent
                </Button>
                <span className="text-xs font-medium px-2" style={{ color: '#333333' }}>
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== ACTOR DETAIL DIALOG ===== */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-xl">
          {detailActor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3" style={{ color: '#333333' }}>
                  <div className="flex items-center justify-center size-10 rounded-full bg-gray-200 text-sm font-bold text-gray-600">
                    {detailActor.firstName.charAt(0)}
                    {detailActor.lastName.charAt(0)}
                  </div>
                  <div>
                    <span>
                      {detailActor.firstName} {detailActor.lastName}
                    </span>
                    <span className="ml-2 text-base font-mono font-normal text-muted-foreground">
                      {detailActor.actorId}
                    </span>
                  </div>
                </DialogTitle>
                <DialogDescription>
                  Fiche détaillée de l\'acteur
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Type & Status */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-sm">
                    {ACTOR_TYPE_ICONS[detailActor.type]}{' '}
                    {ACTOR_TYPE_LABELS[detailActor.type]}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_COLORS[detailActor.status]
                    }`}
                  >
                    {STATUS_LABELS[detailActor.status]}
                  </span>
                </div>

                <Separator />

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2.5">
                    <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Téléphone
                      </p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {detailActor.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Zone</p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {detailActor.zone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Coordonnées GPS
                      </p>
                      <p className="font-mono text-xs" style={{ color: '#333333' }}>
                        {detailActor.gpsLat && detailActor.gpsLng
                          ? `${detailActor.gpsLat.toFixed(4)}, ${detailActor.gpsLng.toFixed(4)}`
                          : 'Non disponible'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <User className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Identificateur
                      </p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {detailActor.identificateurName || 'Non assigné'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Photo placeholder */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Photo d\'identification
                  </p>
                  <div className="flex items-center justify-center h-40 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
                    <div className="text-center text-muted-foreground">
                      <User className="size-8 mx-auto mb-1 opacity-30" />
                      <p className="text-xs">
                        {detailActor.photoUrl
                          ? 'Aperçu non disponible'
                          : 'Aucune photo'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Validation info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Validé par
                      </p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {detailActor.validatedBy || 'En attente'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Date de validation
                      </p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {detailActor.validatedAt
                          ? new Date(
                              detailActor.validatedAt
                            ).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 col-span-2">
                    <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Date de création
                      </p>
                      <p className="font-medium" style={{ color: '#333333' }}>
                        {new Date(
                          detailActor.createdAt
                        ).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {detailActor.notes && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-2.5 text-sm">
                      <StickyNote className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p style={{ color: '#333333' }}>
                          {detailActor.notes}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
