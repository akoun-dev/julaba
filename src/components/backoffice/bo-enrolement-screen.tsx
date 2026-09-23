'use client'

// Écran Enrôlement back-office — orchestrateur (DET-001 tranche 12, MODE-1001).
// La logique pure (bornes de dates, zones, compteurs, stats du jour,
// filtrage combiné, pagination, barre de pages à ellipses) vit dans
// src/lib/backoffice/enrolement-logic.ts avec tests ; les sous-arbres JSX
// (carte dossier, dialog de rejet, dialog de demande d'info, pagination)
// vivent dans ./enrolement/*. Ce module garde l'état, les handlers d'action
// et l'assemblage.

import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Inbox,
  TrendingUp,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useBackofficeStore,
  type BoEnrolment,
} from '@/lib/stores/backoffice-store'
import { BoPageHeader, BoErrorBanner, BoEmptyState, BoStatCard } from './bo-ui'
import {
  extractZones,
  computeStatusCounts,
  computeTodayStats,
  filterEnrolments,
  computeTotalPages,
  paginateEnrolments,
  enrolmentTabCount,
  FILTER_TABS,
  DATE_RANGE_OPTIONS,
  type FilterStatus,
  type DateRange,
} from '@/lib/backoffice/enrolement-logic'
import { EnrolementPagination } from './enrolement/enrolement-pagination'
import { RejectDialog, InfoRequestDialog } from './enrolement/enrolement-dialogs'
import { EnrolmentCard } from './enrolement/enrolment-card'

// ============== MAIN COMPONENT ==============

export function BoEnrolementScreen() {
  const enrolments = useBackofficeStore((s) => s.enrolments)
  const enrolmentsTotal = useBackofficeStore((s) => s.enrolmentsTotal)
  const fetchMoreEnrolments = useBackofficeStore((s) => s.fetchMoreEnrolments)
  const validateEnrolment = useBackofficeStore((s) => s.validateEnrolment)
  const rejectEnrolment = useBackofficeStore((s) => s.rejectEnrolment)
  const requestInfoEnrolment = useBackofficeStore((s) => s.requestInfoEnrolment)
  const boUser = useBackofficeStore((s) => s.boUser)
  const boTheme = useBackofficeStore((s) => s.boTheme)
  const loading = useBackofficeStore((s) => s.loading)
  const errors = useBackofficeStore((s) => s.errors)
  const fetchAllData = useBackofficeStore((s) => s.fetchAllData)
  const error = errors.enrolments ?? null
  const isDark = boTheme === 'dark'

  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('en_attente')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [dateRange, setDateRange] = useState<DateRange>('tous')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<BoEnrolment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')

  // Info-request dialog state (« Demander info » — persisté côté serveur)
  const [infoDialogOpen, setInfoDialogOpen] = useState(false)
  const [infoTarget, setInfoTarget] = useState<BoEnrolment | null>(null)
  const [infoMessage, setInfoMessage] = useState('')
  const [selectedInfoPreset, setSelectedInfoPreset] = useState('')

  // Zones list (unique)
  const zones = useMemo(() => extractZones(enrolments), [enrolments])

  // Count by status
  const statusCounts = useMemo(() => computeStatusCounts(enrolments), [enrolments])

  // Today's stats
  const todayStats = useMemo(() => computeTodayStats(enrolments), [enrolments])

  // Filtered enrolments
  const filteredEnrolments = useMemo(
    () => filterEnrolments(enrolments, { activeFilter, zoneFilter, dateRange }),
    [enrolments, activeFilter, zoneFilter, dateRange]
  )

  // Pagination
  const totalPages = computeTotalPages(filteredEnrolments.length)
  const paginatedEnrolments = useMemo(
    () => paginateEnrolments(filteredEnrolments, currentPage),
    [filteredEnrolments, currentPage]
  )

  // Reset to page 1 on filter change
  const handleFilterChange = useCallback((filter: FilterStatus) => {
    setActiveFilter(filter)
    setCurrentPage(1)
  }, [])

  const handleZoneChange = useCallback((value: string) => {
    setZoneFilter(value)
    setCurrentPage(1)
  }, [])

  const handleDateRangeChange = useCallback((value: string) => {
    setDateRange(value as DateRange)
    setCurrentPage(1)
  }, [])

  const resetFilters = useCallback(() => {
    setActiveFilter('en_attente')
    setZoneFilter('all')
    setDateRange('tous')
    setCurrentPage(1)
  }, [])

  // Actions
  const handleValidate = useCallback(
    async (enrolment: BoEnrolment) => {
      if (!boUser) return
      try {
        await validateEnrolment(enrolment.id, boUser.name)
        toast.success('Enrôlement validé', {
          description: `${enrolment.actorName} — ${enrolment.dossierId}`,
        })
      } catch {
        toast.error('Échec de la validation', {
          description: `${enrolment.actorName} — ${enrolment.dossierId}`,
        })
      }
    },
    [boUser, validateEnrolment]
  )

  const handleOpenReject = useCallback((enrolment: BoEnrolment) => {
    setRejectTarget(enrolment)
    setRejectReason('')
    setSelectedPreset('')
    setRejectDialogOpen(true)
  }, [])

  const handleConfirmReject = useCallback(async () => {
    if (!rejectTarget || !rejectReason.trim() || !boUser) return
    try {
      await rejectEnrolment(rejectTarget.id, rejectReason.trim(), boUser.name)
      toast.error('Enrôlement rejeté', {
        description: `${rejectTarget.actorName} — ${rejectTarget.dossierId}`,
      })
      setRejectDialogOpen(false)
      setRejectTarget(null)
      setRejectReason('')
      setSelectedPreset('')
    } catch {
      toast.error('Échec du rejet', {
        description: `${rejectTarget.actorName} — ${rejectTarget.dossierId}`,
      })
    }
  }, [rejectTarget, rejectReason, boUser, rejectEnrolment])

  const handleRequestInfo = useCallback(
    (enrolment: BoEnrolment) => {
      setInfoTarget(enrolment)
      setInfoMessage('')
      setSelectedInfoPreset('')
      setInfoDialogOpen(true)
    },
    []
  )

  const handleConfirmRequestInfo = useCallback(async () => {
    if (!infoTarget || !boUser) return
    try {
      await requestInfoEnrolment(infoTarget.id, boUser.name, infoMessage.trim() || undefined)
      toast.info('Information demandée', {
        description: `${infoTarget.actorName} — ${infoTarget.dossierId}`,
      })
      setInfoDialogOpen(false)
      setInfoTarget(null)
      setInfoMessage('')
      setSelectedInfoPreset('')
    } catch {
      toast.error('Échec de la demande d\'information', {
        description: `${infoTarget.actorName} — ${infoTarget.dossierId}`,
      })
    }
  }, [infoTarget, infoMessage, boUser, requestInfoEnrolment])

  const handlePresetReason = useCallback((reason: string) => {
    setSelectedPreset(reason)
    setRejectReason(reason)
  }, [])

  return (
    <div className={`flex min-h-full flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <BoPageHeader
        title="Enrôlement"
        description="Examinez les dossiers, demandez les informations manquantes et validez les acteurs."
      />

      {error && <BoErrorBanner message={error} onRetry={() => fetchAllData()} />}

      {enrolments.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chargement des enrôlements...</p>
        </div>
      ) : enrolments.length === 0 && !loading ? (
        <BoEmptyState
          icon={Inbox}
          title="Aucun enrôlement"
          description="Aucun enrôlement n'est encore disponible."
          action={
            <Button variant="outline" onClick={() => fetchAllData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          }
        />
      ) : (
        <>
      {/* ===== FILTER TABS ===== */}
       <div className={`overflow-x-auto rounded-2xl border p-2 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}`}>
       <div className="flex min-w-max items-center gap-1">
        {FILTER_TABS.map((tab) => {
          const count = enrolmentTabCount(enrolments.length, statusCounts, tab.key)
          const isActive = activeFilter === tab.key
          return (
            <Button
              key={tab.key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange(tab.key)}
              className={
                isActive
                   ? 'bg-blue-600 text-white hover:bg-blue-700'
                   : `${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {tab.label}
              <Badge
                variant="secondary"
                className={
                  isActive
                     ? 'ml-1.5 bg-white/20 text-white hover:bg-white/20'
                     : `ml-1.5 ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`
                }
              >
                {count}
              </Badge>
            </Button>
          )
        })}
        </div>
        </div>

      {/* ===== ADDITIONAL FILTERS ===== */}
       <div className={`flex flex-wrap items-end gap-3 rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm'}`}>
        <div className="flex items-center gap-2">
           <span className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
             Zone
          </span>
          <Select value={zoneFilter} onValueChange={handleZoneChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Toutes les zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les zones</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
           <span className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
             Période
          </span>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ===== STATS BAR ===== */}
       <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BoStatCard
          icon={CheckCircle2}
          label="Validés aujourd'hui"
          value={todayStats.validated}
          tone="emerald"
        />

        <BoStatCard
          icon={XCircle}
          label="Rejetés aujourd'hui"
          value={todayStats.rejected}
          tone="red"
        />

        <BoStatCard
          icon={TrendingUp}
          label="Taux validation"
          value={`${todayStats.rate}%`}
          tone="amber"
        />
      </div>

       <div className="flex items-end justify-between gap-3 pt-1">
         <div>
           <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Dossiers</h2>
           <p className={`mt-0.5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{filteredEnrolments.length} résultat{filteredEnrolments.length > 1 ? 's' : ''}</p>
         </div>
         <span className={`hidden text-xs sm:block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Triés par date de soumission</span>
       </div>

      {/* ===== ENROLMENT CARDS LIST ===== */}
       <div className="flex flex-col gap-5">
        {paginatedEnrolments.length === 0 ? (
          /* Empty State */
          <BoEmptyState
            icon={Inbox}
            title="Aucun enrôlement trouvé"
            description="Aucun enrôlement ne correspond aux filtres sélectionnés."
            action={
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                Réinitialiser les filtres
              </Button>
            }
          />
        ) : (
          paginatedEnrolments.map((enrolment) => (
            <EnrolmentCard
              key={enrolment.id}
              enrolment={enrolment}
              onValidate={handleValidate}
              onReject={handleOpenReject}
              onRequestInfo={handleRequestInfo}
            />
          ))
       )}
       </div>

      <EnrolementPagination
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        filteredEnrolments={filteredEnrolments}
        isDark={isDark}
        enrolments={enrolments}
        enrolmentsTotal={enrolmentsTotal}
        loading={loading}
        fetchMoreEnrolments={fetchMoreEnrolments}
      />

      <RejectDialog
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        rejectTarget={rejectTarget}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        selectedPreset={selectedPreset}
        handlePresetReason={handlePresetReason}
        handleConfirmReject={handleConfirmReject}
        isDark={isDark}
      />

      <InfoRequestDialog
        infoDialogOpen={infoDialogOpen}
        setInfoDialogOpen={setInfoDialogOpen}
        infoTarget={infoTarget}
        infoMessage={infoMessage}
        setInfoMessage={setInfoMessage}
        selectedInfoPreset={selectedInfoPreset}
        setSelectedInfoPreset={setSelectedInfoPreset}
        handleConfirmRequestInfo={handleConfirmRequestInfo}
        isDark={isDark}
      />
        </>
       )}
       </div>
  )
}
