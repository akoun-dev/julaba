'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  Camera,
  MapPin,
  Phone,
  User,
  FileText,
  ChevronLeft,
  ChevronRight,
  Inbox,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

import {
  useBackofficeStore,
  STATUS_LABELS,
  STATUS_COLORS,
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
  type BoEnrolment,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============

const ITEMS_PER_PAGE = 10

const PREDEFINED_REASONS = [
  'Photo illisible',
  'Données incomplètes',
  'GPS absent',
  'Téléphone invalide',
  'Autre',
]

type FilterStatus = 'all' | 'en_attente' | 'valide' | 'rejete' | 'info_demandee'
type DateRange = 'aujourdhui' | 'semaine' | 'mois' | 'tous'

const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'valide', label: 'Validés' },
  { key: 'rejete', label: 'Rejetés' },
  { key: 'info_demandee', label: 'Info demandée' },
  { key: 'all', label: 'Tous' },
]

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'tous', label: 'Tous' },
  { value: 'aujourdhui', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois' },
]

// ============== HELPERS ==============

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() + 1)
  startOfWeek.setHours(0, 0, 0, 0)
  return d >= startOfWeek
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function matchesDateRange(dateStr: string, range: DateRange): boolean {
  switch (range) {
    case 'aujourdhui':
      return isToday(dateStr)
    case 'semaine':
      return isThisWeek(dateStr)
    case 'mois':
      return isThisMonth(dateStr)
    case 'tous':
    default:
      return true
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ============== MAIN COMPONENT ==============

export function BoEnrolementScreen() {
  const { enrolments, validateEnrolment, rejectEnrolment, boUser } =
    useBackofficeStore()

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

  // Zones list (unique)
  const zones = useMemo(
    () => [...new Set(enrolments.map((e) => e.zone))].sort(),
    [enrolments]
  )

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      en_attente: 0,
      valide: 0,
      rejete: 0,
      info_demandee: 0,
    }
    for (const e of enrolments) {
      counts[e.status] = (counts[e.status] || 0) + 1
    }
    return counts
  }, [enrolments])

  // Today's stats
  const todayStats = useMemo(() => {
    const todayValidated = enrolments.filter(
      (e) => e.status === 'valide' && e.validatedAt && isToday(e.validatedAt)
    ).length
    const todayRejected = enrolments.filter(
      (e) => e.status === 'rejete' && e.validatedAt && isToday(e.validatedAt)
    ).length
    const totalProcessed = todayValidated + todayRejected
    const rate =
      totalProcessed > 0
        ? Math.round((todayValidated / totalProcessed) * 100)
        : 0
    return {
      validated: todayValidated,
      rejected: todayRejected,
      avgTime: '2.3 min',
      rate,
    }
  }, [enrolments])

  // Filtered enrolments
  const filteredEnrolments = useMemo(() => {
    return enrolments.filter((e) => {
      // Status filter
      if (activeFilter !== 'all' && e.status !== activeFilter) return false
      // Zone filter
      if (zoneFilter !== 'all' && e.zone !== zoneFilter) return false
      // Date range filter
      if (!matchesDateRange(e.submittedAt, dateRange)) return false
      return true
    })
  }, [enrolments, activeFilter, zoneFilter, dateRange])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEnrolments.length / ITEMS_PER_PAGE))
  const paginatedEnrolments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredEnrolments.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredEnrolments, currentPage])

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

  // Actions
  const handleValidate = useCallback(
    (enrolment: BoEnrolment) => {
      if (!boUser) return
      validateEnrolment(enrolment.id, boUser.name)
      toast.success('Enrôlement validé', {
        description: `${enrolment.actorName} — ${enrolment.dossierId}`,
      })
    },
    [boUser, validateEnrolment]
  )

  const handleOpenReject = useCallback((enrolment: BoEnrolment) => {
    setRejectTarget(enrolment)
    setRejectReason('')
    setSelectedPreset('')
    setRejectDialogOpen(true)
  }, [])

  const handleConfirmReject = useCallback(() => {
    if (!rejectTarget || !rejectReason.trim() || !boUser) return
    rejectEnrolment(rejectTarget.id, rejectReason.trim(), boUser.name)
    toast.error('Enrôlement rejeté', {
      description: `${rejectTarget.actorName} — ${rejectTarget.dossierId}`,
    })
    setRejectDialogOpen(false)
    setRejectTarget(null)
    setRejectReason('')
    setSelectedPreset('')
  }, [rejectTarget, rejectReason, boUser, rejectEnrolment])

  const handleRequestInfo = useCallback(
    (enrolment: BoEnrolment) => {
      if (!boUser) return
      // Directly update status to info_demandee via store setState
      useBackofficeStore.setState((state) => ({
        enrolments: state.enrolments.map((e) =>
          e.id === enrolment.id
            ? {
                ...e,
                status: 'info_demandee' as const,
                validatedBy: boUser.name,
                validatedAt: new Date().toISOString(),
              }
            : e
        ),
      }))
      toast.info('Information demandée', {
        description: `${enrolment.actorName} — ${enrolment.dossierId}`,
      })
    },
    [boUser]
  )

  const handlePresetReason = useCallback((reason: string) => {
    setSelectedPreset(reason)
    setRejectReason(reason)
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6 text-slate-900">
      {/* ===== TITLE ===== */}
      <div className="flex items-center gap-3">
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900"
        >
          VALIDATION DES ENRÔLEMENTS
        </h1>
      </div>

      {/* ===== FILTER TABS ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? enrolments.length
              : statusCounts[tab.key] || 0
          const isActive = activeFilter === tab.key
          return (
            <Button
              key={tab.key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange(tab.key)}
              className={
                isActive
                  ? 'bg-[#333333] text-white hover:bg-[#333333]/90'
                  : 'text-[#333333] hover:bg-[#333333]/5'
              }
            >
              {tab.label}
              <Badge
                variant="secondary"
                className={
                  isActive
                    ? 'ml-1.5 bg-white/20 text-white hover:bg-white/20'
                    : 'ml-1.5 bg-[#333333]/10 text-[#333333]'
                }
              >
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>

      {/* ===== ADDITIONAL FILTERS ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#333333]/70">
            Zone :
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
          <span className="text-sm font-medium text-[#333333]/70">
            Période :
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-0 py-4">
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#333333]/60">
                Validés aujourd&apos;hui
              </p>
              <p className="text-xl font-bold text-[#333333]">
                {todayStats.validated}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-4">
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#333333]/60">
                Rejetés aujourd&apos;hui
              </p>
              <p className="text-xl font-bold text-[#333333]">
                {todayStats.rejected}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-4">
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#333333]/60">
                ⏱️ Temps moyen
              </p>
              <p className="text-xl font-bold text-[#333333]">
                {todayStats.avgTime}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-4">
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#333333]/60">
                Taux validation
              </p>
              <p className="text-xl font-bold text-[#333333]">
                {todayStats.rate}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* ===== ENROLMENT CARDS LIST ===== */}
      <div className="flex flex-col gap-4">
        {paginatedEnrolments.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#333333]/5">
              <Inbox className="h-8 w-8 text-[#333333]/40" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#333333]">
                Aucun enrôlement trouvé
              </p>
              <p className="mt-1 text-sm text-[#333333]/50">
                Aucun enrôlement ne correspond aux filtres sélectionnés.
              </p>
            </div>
          </div>
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

      {/* ===== PAGINATION ===== */}
      {filteredEnrolments.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-[#333333]/60">
            Affichage {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredEnrolments.length)}
            {' '}sur {filteredEnrolments.length} enrôlements
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="text-[#333333]"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Précédent
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first, last, and pages around current
                  if (page === 1 || page === totalPages) return true
                  if (Math.abs(page - currentPage) <= 1) return true
                  return false
                })
                .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                  if (idx > 0) {
                    const prev = arr[idx - 1]
                    if (page - prev > 1) {
                      acc.push('ellipsis')
                    }
                  }
                  acc.push(page)
                  return acc
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 text-[#333333]/40"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={currentPage === item ? 'default' : 'outline'}
                      size="sm"
                      className={
                        currentPage === item
                          ? 'h-8 w-8 bg-[#333333] text-white hover:bg-[#333333]/90 p-0'
                          : 'h-8 w-8 p-0 text-[#333333]'
                      }
                      onClick={() => setCurrentPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="text-[#333333]"
            >
              Suivant
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== REJECT DIALOG ===== */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#333333]">
              Rejeter l&apos;enrôlement
            </DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  <span className="font-medium text-[#333333]">
                    {rejectTarget.actorName}
                  </span>{' '}
                  — {rejectTarget.dossierId}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Predefined reasons */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-[#333333]">
                Raison prédéfinie
              </Label>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    variant={selectedPreset === reason ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePresetReason(reason)}
                    className={
                      selectedPreset === reason
                        ? 'bg-[#333333] text-white hover:bg-[#333333]/90'
                        : 'text-[#333333]'
                    }
                  >
                    {reason}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom reason */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-[#333333]">
                Raison du rejet <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Décrivez la raison du rejet..."
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              className="text-[#333333]"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={!rejectReason.trim()}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============== ENROLMENT CARD ==============

interface EnrolmentCardProps {
  enrolment: BoEnrolment
  onValidate: (enrolment: BoEnrolment) => void
  onReject: (enrolment: BoEnrolment) => void
  onRequestInfo: (enrolment: BoEnrolment) => void
}

function EnrolmentCard({
  enrolment,
  onValidate,
  onReject,
  onRequestInfo,
}: EnrolmentCardProps) {
  const isPending = enrolment.status === 'en_attente'
  const isProcessed = !isPending

  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
      {/* Header row */}
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Dossier ID badge */}
            <Badge
              variant="secondary"
              className="bg-[#333333] text-white font-mono text-xs"
            >
              {enrolment.dossierId}
            </Badge>

            {/* Actor name */}
            <span className="text-base font-bold text-[#333333]">
              {enrolment.actorName}
            </span>

            {/* Actor type */}
            <span className="inline-flex items-center gap-1 text-sm text-[#333333]/70">
              <span>{ACTOR_TYPE_ICONS[enrolment.actorType]}</span>
              <span>{ACTOR_TYPE_LABELS[enrolment.actorType]}</span>
            </span>
          </div>

          {/* Zone + Status badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[#333333]/60 text-xs">
              <MapPin className="mr-1 h-3 w-3" />
              {enrolment.zone}
            </Badge>
            <Badge className={STATUS_COLORS[enrolment.status]}>
              {STATUS_LABELS[enrolment.status]}
            </Badge>
          </div>
        </div>

        {/* Subheader: identificateur, date, phone */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#333333]/60">
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {enrolment.identificateurName}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {formatDate(enrolment.submittedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {enrolment.phone}
          </span>
        </div>

        {/* Badges: Photo & GPS */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              enrolment.hasPhoto
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            <Camera className="h-3 w-3" />
            Photo {enrolment.hasPhoto ? '✓' : '✗'}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              enrolment.hasGps
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            <MapPin className="h-3 w-3" />
            GPS {enrolment.hasGps ? '✓' : '✗'}
          </span>
        </div>
      </CardHeader>

      <Separator />

      {/* Footer */}
      <CardFooter className="gap-3 py-3">
        {isPending ? (
          /* Action buttons for pending enrolments */
          <>
            <Button
              size="sm"
              onClick={() => onValidate(enrolment)}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Valider
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(enrolment)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Rejeter
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRequestInfo(enrolment)}
              className="text-[#333333]"
            >
              <Info className="mr-1.5 h-4 w-4" />
              Demander info
            </Button>
          </>
        ) : (
          /* Status info for processed enrolments */
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#333333]/70">
            <Badge className={STATUS_COLORS[enrolment.status]}>
              {STATUS_LABELS[enrolment.status]}
            </Badge>
            {enrolment.validatedBy && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Par {enrolment.validatedBy}
              </span>
            )}
            {enrolment.validatedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(enrolment.validatedAt)}
              </span>
            )}
            {enrolment.rejectReason && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {enrolment.rejectReason}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
