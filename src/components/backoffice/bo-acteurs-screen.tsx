'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
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
  Users,
  Store,
  Wheat,
  Handshake,
  Calendar,
  ShieldCheck,
  StickyNote,
  X,
  Hourglass,
  Loader2,
  Inbox,
  RefreshCw,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useBackofficeStore,
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
  type BoActor,
} from '@/lib/stores/backoffice-store'
import { MARCHAND_CATEGORIES, MARCHAND_CATEGORIES_META, type MarchandCategorie } from '@/lib/marchand-categories'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BoPageHeader,
  BoFilterBar,
  BoErrorBanner,
  BoEmptyState,
  BoStatCard,
} from './bo-ui'

// ============== CONSTANTS ==============
const ITEMS_PER_PAGE = 15

type ActorTypeFilter = 'tous' | 'marchand' | 'producteur' | 'cooperatif'
type ActorStatusFilter = 'tous' | 'actif' | 'suspendu' | 'en_attente' | 'rejete'

// ============== MAIN COMPONENT ==============

export function BoActeursScreen() {
  const {
    actors, actorsTotal, fetchMoreActors, updateActorStatus, updateActorCategorie, searchQuery, setSearchQuery, boTheme, loading,
    errors, fetchAllData, actorDetailRequestId, clearActorDetailRequest,
  } = useBackofficeStore()
  const error = errors.actors ?? null
  const isDark = boTheme === 'dark'

  // Local state
  const [typeFilter, setTypeFilter] = useState<ActorTypeFilter>('tous')
  const [statusFilter, setStatusFilter] = useState<ActorStatusFilter>('tous')
  const [zoneFilter, setZoneFilter] = useState<string>('tous')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set())
  const [showDetailSheet, setShowDetailSheet] = useState(false)
  const [detailActor, setDetailActor] = useState<BoActor | null>(null)
  const [suspendActor, setSuspendActor] = useState<BoActor | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false)

  // Ouverture de la fiche acteur depuis la recherche globale (Ctrl+K)
  useEffect(() => {
    if (!actorDetailRequestId) return
    const actor = actors.find((a) => a.id === actorDetailRequestId || a.actorId === actorDetailRequestId)
    if (actor) {
      setDetailActor(actor)
      setShowDetailSheet(true)
    }
    clearActorDetailRequest()
  }, [actorDetailRequestId, actors, clearActorDetailRequest])

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
    setShowDetailSheet(true)
  }, [])

  const handleSuspend = useCallback(
    (actor: BoActor) => {
      setSuspendActor(actor)
      setSuspendReason('')
      setShowSuspendConfirm(true)
    },
    []
  )

  const confirmSuspend = useCallback(() => {
    if (suspendActor) {
      updateActorStatus(suspendActor.id, 'suspendu')
      setShowSuspendConfirm(false)
      setSuspendActor(null)
      setSuspendReason('')
    }
  }, [suspendActor, updateActorStatus])

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

  if (actors.length === 0 && loading) {
    return (
      <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
        <BoPageHeader
          title="Gestion des acteurs"
          description="Consultez, filtrez et gérez l'ensemble des acteurs enregistrés sur la plateforme Jùlaba."
        />
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement des acteurs...</p>
        </div>
      </div>
    )
  }

  if (actors.length === 0 && !loading) {
    return (
      <div className={'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')}>
        <BoPageHeader
          title="Gestion des acteurs"
          description="Consultez, filtrez et gérez l'ensemble des acteurs enregistrés sur la plateforme Jùlaba."
        />
        {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}
        <BoEmptyState
          icon={Inbox}
          title="Aucun acteur"
          description="Aucun acteur n'est encore enregistré sur la plateforme."
          action={
            <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div
      className={
        'p-6 space-y-6 ' + (isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]')
      }
    >
      {/* ===== HEADER ===== */}
      <BoPageHeader
        title="Gestion des acteurs"
        description="Consultez, filtrez et gérez l'ensemble des acteurs enregistrés sur la plateforme Jùlaba."
      />

      {/* ===== ERROR BANNER ===== */}
      {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BoStatCard icon={Users} label="Total acteurs" value={counts.total} />
        <BoStatCard icon={Store} label="Marchands" value={counts.marchands} tone="orange" />
        <BoStatCard icon={Wheat} label="Producteurs" value={counts.producteurs} tone="emerald" />
        <BoStatCard icon={Handshake} label="Coopératives" value={counts.cooperatives} tone="amber" />
      </div>

      {/* ===== SEARCH + FILTERS ===== */}
      <BoFilterBar>
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, téléphone, ID, zone..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9 h-9"
              />
            </div>

            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

            {/* Filters */}
            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="marchand">Marchand(e)s</SelectItem>
                <SelectItem value="producteur">Producteur(rice)s</SelectItem>
                <SelectItem value="cooperatif">Coopératives</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les statuts</SelectItem>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="suspendu">Suspendu</SelectItem>
                <SelectItem value="en_attente"><span className="flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> En attente</span></SelectItem>
                <SelectItem value="rejete">Rejeté</SelectItem>
              </SelectContent>
            </Select>

            <Select value={zoneFilter} onValueChange={handleZoneFilterChange}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Réinitialiser
              </Button>
            )}
      </BoFilterBar>

      {/* ===== BULK ACTIONS ===== */}
      {selectedActors.size > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <span className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
      <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
        <CardContent className="p-0">
          <div className="max-h-[620px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-700/50' : 'bg-gray-50'} border-b`}>
                <tr>
                  <th className="w-10 px-3 py-3 text-left">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tout"
                      className="relative after:absolute after:-inset-3 after:content-['']"
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
              <tbody className={`${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
                {paginatedActors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <User className="size-8 opacity-30" />
                        {hasActiveFilters ? (
                          <>
                            <p className="font-medium">Aucun acteur ne correspond à vos filtres</p>
                            <p className="text-xs">Essayez de modifier vos critères de recherche.</p>
                          </>
                        ) : (
                          <p>Aucun acteur enregistré</p>
                        )}
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
                            ? 'bg-amber-500/10'
                            : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50/80'
                        } transition-colors`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectActor(actor.id)}
                            aria-label={`Sélectionner ${actor.firstName} ${actor.lastName}`}
                            className="relative after:absolute after:-inset-3 after:content-['']"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`font-mono text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {actor.actorId}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center size-7 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'} text-xs font-semibold shrink-0`}>
                              {actor.firstName.charAt(0)}
                              {actor.lastName.charAt(0)}
                            </div>
                            <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                              {actor.firstName} {actor.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{(() => { const Icon = ACTOR_TYPE_ICONS[actor.type]; return Icon ? <Icon className="h-4 w-4" /> : null })()}</span>
                            <span className="text-xs text-muted-foreground">
                              {ACTOR_TYPE_LABELS[actor.type]}
                            </span>
                            {actor.categorieMarchand && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MARCHAND_CATEGORIES_META[actor.categorieMarchand as MarchandCategorie]?.badgeClass ?? 'bg-slate-100 text-slate-700'}`}>
                                {MARCHAND_CATEGORIES_META[actor.categorieMarchand as MarchandCategorie]?.label ?? actor.categorieMarchand}
                              </span>
                            )}
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
                              STATUS_COLORS[actor.status] || (isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-800')
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
            <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 ${isDark ? 'bg-slate-800/50' : 'bg-gray-50/50'}`}>
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
                <span className={`text-xs font-medium px-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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

          {/* More records exist on the server than are currently loaded */}
          {actors.length < actorsTotal && (
            <div className={`flex items-center justify-between gap-3 border-t px-4 py-3 text-xs ${isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-gray-50/50 text-slate-500'}`}>
              <span>{actors.length} acteurs chargés sur {actorsTotal} au total</span>
              <Button size="sm" variant="outline" disabled={loading} onClick={() => fetchMoreActors()}>
                Charger plus
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== ACTOR DETAIL SHEET (panneau latéral) ===== */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {detailActor && (
            <>
              <SheetHeader className="border-b pb-4">
                <SheetTitle className={`flex items-center gap-3 pr-8 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  <div className={`flex items-center justify-center size-10 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'} text-sm font-bold`}>
                    {detailActor.firstName.charAt(0)}
                    {detailActor.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate">
                      {detailActor.firstName} {detailActor.lastName}
                    </span>
                    <span className="block text-sm font-mono font-normal text-muted-foreground">
                      {detailActor.actorId}
                    </span>
                  </div>
                </SheetTitle>
                <SheetDescription>
                  Fiche détaillée de l'acteur
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4 pb-6">
                {/* Type & Status */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-md ${isDark ? 'bg-slate-700' : 'bg-gray-100'} px-2.5 py-1 text-sm`}>
                    {(() => { const Icon = ACTOR_TYPE_ICONS[detailActor.type]; return Icon ? <Icon className="h-4 w-4" /> : null })()}{' '}
                    {ACTOR_TYPE_LABELS[detailActor.type]}
                  </span>
                  {detailActor.categorieMarchand && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${MARCHAND_CATEGORIES_META[detailActor.categorieMarchand as MarchandCategorie]?.badgeClass ?? 'bg-slate-100 text-slate-700'}`}>
                      {MARCHAND_CATEGORIES_META[detailActor.categorieMarchand as MarchandCategorie]?.label ?? detailActor.categorieMarchand}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_COLORS[detailActor.status]
                    }`}
                  >
                    {STATUS_LABELS[detailActor.status]}
                  </span>
                </div>

                {/* Classification marchand éditable (jusque-là en lecture
                    seule alors que la nomenclature est collectée à
                    l'enrôlement) — marchands uniquement. */}
                {detailActor.type === 'marchand' && (
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      Classification
                    </span>
                    <Select
                      value={detailActor.categorieMarchand || 'non_classe'}
                      onValueChange={(value) => {
                        const categorie = value === 'non_classe' ? null : value
                        setDetailActor({ ...detailActor, categorieMarchand: categorie })
                        updateActorCategorie(detailActor.id, categorie)
                      }}
                    >
                      <SelectTrigger className="h-8 w-[190px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non_classe">Non classé</SelectItem>
                        {MARCHAND_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {MARCHAND_CATEGORIES_META[cat].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator />

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-2.5">
                    <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Téléphone
                      </p>
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {detailActor.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Zone</p>
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                      <p className={`font-mono text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {detailActor.identificateurName || 'Non assigné'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Photo — l'URL stockée (bucket actor-photos) était jamais
                    rendue : on l'affiche dès qu'elle existe, sinon le
                    placeholder « aucune photo ». */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Photo d&apos;identification
                  </p>
                  {detailActor.photoUrl ? (
                    <img
                      src={detailActor.photoUrl}
                      alt={`Photo de ${detailActor.firstName}`}
                      className={`h-40 w-full rounded-lg border-2 border-dashed object-cover ${isDark ? 'border-slate-700' : 'border-gray-200'}`}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className={`flex items-center justify-center h-40 rounded-lg border-2 border-dashed ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="text-center text-muted-foreground">
                        <User className="size-8 mx-auto mb-1 opacity-30" />
                        <p className="text-xs">Aucune photo</p>
                      </div>
                    </div>
                  )}
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
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                      <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
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
                        <p className={isDark ? 'text-slate-100' : 'text-slate-900'}>
                          {detailActor.notes}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Actions rapides */}
                <div className="flex gap-2">
                  {detailActor.status === 'actif' && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      onClick={() => {
                        handleSuspend(detailActor)
                        setShowDetailSheet(false)
                      }}
                    >
                      <Pause className="size-4" />
                      Suspendre
                    </Button>
                  )}
                  {detailActor.status === 'suspendu' && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        handleReactivate(detailActor)
                        setShowDetailSheet(false)
                      }}
                    >
                      <PlayCircle className="size-4" />
                      Réactiver
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ===== SUSPEND CONFIRMATION DIALOG ===== */}
      <Dialog open={showSuspendConfirm} onOpenChange={setShowSuspendConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isDark ? 'text-slate-100' : 'text-slate-900'}>
              Suspendre l'acteur ?
            </DialogTitle>
            <DialogDescription>
              Cette action est réversible. L'acteur ne pourra plus se connecter pendant la suspension.
            </DialogDescription>
          </DialogHeader>
          {suspendActor && (
            <div className="space-y-4">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center size-10 rounded-full ${isDark ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'} text-sm font-bold`}>
                    {suspendActor.firstName.charAt(0)}{suspendActor.lastName.charAt(0)}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {suspendActor.firstName} {suspendActor.lastName}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {suspendActor.actorId} · {suspendActor.zone}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  Motif de suspension
                </label>
                <Input
                  placeholder="Indiquez la raison de la suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSuspendConfirm(false)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmSuspend}
                  disabled={!suspendReason.trim()}
                >
                  Suspendre l'acteur
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
