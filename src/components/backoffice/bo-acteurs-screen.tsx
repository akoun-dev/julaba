'use client'

// Écran Acteurs back-office — orchestrateur (DET-001 tranche 9, MODE-995).
// La logique pure (zones distinctes, filtrage multi-critères, compteurs,
// pagination, export CSV) vit dans src/lib/backoffice/acteurs-logic.ts avec
// tests ; les sous-arbres JSX (filterbar, table, fiche détail, dialog
// suspension) vivent dans ./acteurs/*. Ce module garde l'état, les handlers
// et les états vides.

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  Store,
  Wheat,
  Handshake,
  Download,
  Bell,
  Inbox,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { useBackofficeStore, type BoActor } from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner, BoEmptyState, BoStatCard } from './bo-ui'
import {
  extractZones,
  filterActors,
  computeActorCounts,
  computeTotalPages,
  paginateActors,
  buildActorsCsv,
  type ActorTypeFilter,
  type ActorStatusFilter,
} from '@/lib/backoffice/acteurs-logic'
import { ActeursFilterBar } from './acteurs/acteurs-filterbar'
import { ActeursTable } from './acteurs/acteurs-table'
import { ActeursDetailSheet } from './acteurs/acteurs-detail-sheet'
import { ActeursSuspendDialog } from './acteurs/acteurs-suspend-dialog'

// ============== MAIN COMPONENT ==============

export function BoActeursScreen() {
  const actors = useBackofficeStore((s) => s.actors)
  const actorsTotal = useBackofficeStore((s) => s.actorsTotal)
  const fetchMoreActors = useBackofficeStore((s) => s.fetchMoreActors)
  const updateActorStatus = useBackofficeStore((s) => s.updateActorStatus)
  const updateActorCategorie = useBackofficeStore((s) => s.updateActorCategorie)
  const searchQuery = useBackofficeStore((s) => s.searchQuery)
  const setSearchQuery = useBackofficeStore((s) => s.setSearchQuery)
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const loading = useBackofficeStore((s) => s.loading)
  const errors = useBackofficeStore((s) => s.errors)
  const fetchAllData = useBackofficeStore((s) => s.fetchAllData)
  const actorDetailRequestId = useBackofficeStore((s) => s.actorDetailRequestId)
  const clearActorDetailRequest = useBackofficeStore((s) => s.clearActorDetailRequest)
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
  const zones = useMemo(() => extractZones(actors), [actors])
  // Filtered actors
  const filteredActors = useMemo(
    () => filterActors(actors, { searchQuery, typeFilter, statusFilter, zoneFilter }),
    [actors, searchQuery, typeFilter, statusFilter, zoneFilter]
  )
  // Counters
  const counts = useMemo(() => computeActorCounts(actors), [actors])
  // Pagination
  const totalPages = computeTotalPages(filteredActors.length)
  const paginatedActors = useMemo(
    () => paginateActors(filteredActors, currentPage),
    [filteredActors, currentPage]
  )
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

    const csv = buildActorsCsv(selected)
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
      <ActeursFilterBar
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        typeFilter={typeFilter}
        handleTypeFilterChange={handleTypeFilterChange}
        statusFilter={statusFilter}
        handleStatusFilterChange={handleStatusFilterChange}
        zoneFilter={zoneFilter}
        handleZoneFilterChange={handleZoneFilterChange}
        zones={zones}
        hasActiveFilters={hasActiveFilters}
        resetFilters={resetFilters}
        isDark={isDark}
      />


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
      <ActeursTable
        isDark={isDark}
        isAllSelected={isAllSelected}
        toggleSelectAll={toggleSelectAll}
        paginatedActors={paginatedActors}
        selectedActors={selectedActors}
        toggleSelectActor={toggleSelectActor}
        hasActiveFilters={hasActiveFilters}
        resetFilters={resetFilters}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        filteredActors={filteredActors}
        actors={actors}
        actorsTotal={actorsTotal}
        loading={loading}
        fetchMoreActors={fetchMoreActors}
        handleViewActor={handleViewActor}
        handleSuspend={handleSuspend}
        handleReactivate={handleReactivate}
      />


      {/* ===== ACTOR DETAIL SHEET (panneau latéral) ===== */}
      <ActeursDetailSheet
        showDetailSheet={showDetailSheet}
        setShowDetailSheet={setShowDetailSheet}
        detailActor={detailActor}
        setDetailActor={setDetailActor}
        updateActorCategorie={updateActorCategorie}
        handleSuspend={handleSuspend}
        handleReactivate={handleReactivate}
        isDark={isDark}
      />


      {/* ===== SUSPEND CONFIRMATION DIALOG ===== */}
      <ActeursSuspendDialog
        showSuspendConfirm={showSuspendConfirm}
        setShowSuspendConfirm={setShowSuspendConfirm}
        suspendActor={suspendActor}
        suspendReason={suspendReason}
        setSuspendReason={setSuspendReason}
        confirmSuspend={confirmSuspend}
        isDark={isDark}
      />

    </div>
  )
}
