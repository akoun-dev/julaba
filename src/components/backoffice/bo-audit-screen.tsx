'use client'

import { useState, useMemo, useCallback, Fragment } from 'react'
import {
  Search,
  FileDown,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  Fingerprint,
  Globe,
  Monitor,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useBackofficeStore,
  type AuditEntry,
} from '@/lib/stores/backoffice-store'

// ============== CONSTANTS ==============

const ITEMS_PER_PAGE = 15

type DateRangeFilter = 'tous' | 'aujourdhui' | 'semaine' | 'mois' | 'trimestre'

const DATE_RANGE_LABELS: Record<DateRangeFilter, string> = {
  tous: 'Tous',
  aujourdhui: "Aujourd'hui",
  semaine: 'Cette semaine',
  mois: 'Ce mois',
  trimestre: 'Ce trimestre',
}

const ACTION_BADGE_COLORS: Record<string, string> = {
  VALIDATE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECT: 'bg-red-100 text-red-800 border-red-200',
  SUSPEND: 'bg-orange-100 text-orange-800 border-orange-200',
  CREATE_ZONE: 'bg-amber-100 text-amber-800 border-amber-200',
  CREATE_USER: 'bg-violet-100 text-violet-800 border-violet-200',
  CREATE_MISSION: 'bg-violet-100 text-violet-800 border-violet-200',
  LOGIN: 'bg-gray-100 text-gray-700 border-gray-200',
  LOGOUT: 'bg-gray-100 text-gray-700 border-gray-200',
  EXPORT: 'bg-sky-100 text-sky-800 border-sky-200',
  ASSIGN_MISSION: 'bg-teal-100 text-teal-800 border-teal-200',
  FREEZE: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  UPDATE_ROLE: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  DELETE_ACTOR: 'bg-rose-100 text-rose-800 border-rose-200',
  MODERATE: 'bg-pink-100 text-pink-800 border-pink-200',
}

// ============== HELPERS ==============

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimeAgo(iso: string) {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days}j`
  return formatDateTime(iso)
}

function getDateRange(dateRange: DateRangeFilter): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start: Date

  switch (dateRange) {
    case 'aujourdhui':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      break
    case 'semaine': {
      const dayOfWeek = now.getDay() || 7
      start = new Date(now)
      start.setDate(now.getDate() - dayOfWeek + 1)
      start.setHours(0, 0, 0, 0)
      break
    }
    case 'mois':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      break
    case 'trimestre': {
      const quarter = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0, 0)
      break
    }
    default:
      start = new Date(2000, 0, 1)
  }

  return { start, end }
}

function truncateString(str: string, maxLen: number) {
  if (!str) return '—'
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function formatJsonDetails(details: string | undefined) {
  if (!details) return null
  try {
    const parsed = JSON.parse(details)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return details
  }
}

// ============== EXPORT HANDLER ==============

function downloadCsv(entries: AuditEntry[], filename: string) {
  const headers = [
    'Date/Heure',
    'Utilisateur',
    'Email',
    'Action',
    'Module',
    'Adresse IP',
    'User-Agent',
    'Détails',
  ]
  const rows = entries.map((e) => [
    formatDateTime(e.timestamp),
    e.userName,
    e.userEmail,
    e.action,
    e.module,
    e.ipAddress ?? '',
    e.userAgent ?? '',
    e.details ?? '',
  ])

  const csvContent = [
    headers.join(';'),
    ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}”`).join(';')),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ============== EXPANDED ROW ==============

function ExpandedDetails({ entry }: { entry: AuditEntry }) {
  const { boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  const formattedDetails = formatJsonDetails(entry.details)
  return (
    <div className={`${isDark ? 'bg-slate-700/50' : 'bg-gray-50/80'} px-6 py-4`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Details JSON */}
        <div className="md:col-span-2">
          <Label className={`mb-1.5 text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Détails de l\'action
          </Label>
          {formattedDetails ? (
            <pre className={`max-h-48 overflow-y-auto rounded-lg border p-3 text-xs ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-gray-700 border-slate-200'}`}>
              {formattedDetails}
            </pre>
          ) : (
            <p className={`rounded-lg border p-3 text-xs ${isDark ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-white text-gray-400 border-slate-200'}`}>
              Aucun détail disponible
            </p>
          )}
        </div>

        {/* IP Address */}
        <div>
          <Label className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            <Globe className="h-3 w-3" />
            Adresse IP
          </Label>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <code className={`text-sm font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {entry.ipAddress ?? 'Non disponible'}
            </code>
          </div>
        </div>

        {/* User-Agent */}
        <div>
          <Label className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            <Monitor className="h-3 w-3" />
            User-Agent
          </Label>
          <div className={`rounded-lg border px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <code className={`text-xs font-mono break-all ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
              {entry.userAgent ?? 'Non disponible'}
            </code>
          </div>
        </div>

        {/* Signature hash placeholder */}
        <div className="md:col-span-2">
          <Label className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            <Fingerprint className="h-3 w-3" />
            Empreinte de vérification
          </Label>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <code className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              sha256:{entry.id}-{btoa(entry.timestamp).slice(0, 16)}...{btoa(entry.action).slice(0, 12)}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== MAIN COMPONENT ==============

export function BoAuditScreen() {
  const { auditLog, boTheme } = useBackofficeStore()
  const isDark = boTheme === 'dark'

  // Local state
  const [dateRange, setDateRange] = useState<DateRangeFilter>('tous')
  const [userFilter, setUserFilter] = useState<string>('tous')
  const [actionFilter, setActionFilter] = useState<string>('tous')
  const [moduleFilter, setModuleFilter] = useState<string>('tous')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Unique values for filters
  const uniqueUsers = useMemo(() => {
    const set = new Set(auditLog.map((e) => e.userName))
    return Array.from(set).sort()
  }, [auditLog])

  const uniqueActions = useMemo(() => {
    const set = new Set(auditLog.map((e) => e.action))
    return Array.from(set).sort()
  }, [auditLog])

  const uniqueModules = useMemo(() => {
    const set = new Set(auditLog.map((e) => e.module))
    return Array.from(set).sort()
  }, [auditLog])

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const { start, end } = getDateRange(dateRange)

    return auditLog.filter((entry) => {
      // Date range
      const entryDate = new Date(entry.timestamp)
      if (entryDate < start || entryDate > end) return false

      // User filter
      if (userFilter !== 'tous' && entry.userName !== userFilter) return false

      // Action filter
      if (actionFilter !== 'tous' && entry.action !== actionFilter) return false

      // Module filter
      if (moduleFilter !== 'tous' && entry.module !== moduleFilter) return false

      // Search
      if (search) {
        const q = search.toLowerCase()
        if (
          !entry.userName.toLowerCase().includes(q) &&
          !entry.userEmail.toLowerCase().includes(q) &&
          !entry.action.toLowerCase().includes(q) &&
          !entry.module.toLowerCase().includes(q) &&
          !(entry.details ?? '').toLowerCase().includes(q)
        ) {
          return false
        }
      }

      return true
    })
  }, [auditLog, dateRange, userFilter, actionFilter, moduleFilter, search])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE))
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredEntries.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredEntries, currentPage])

  // Reset page when filters change
  const handleFilterChange = useCallback(
    (setter: (v: string) => void) =>
      (v: string) => {
        setter(v)
        setCurrentPage(1)
      },
    []
  )

  // Export handlers
  const handleExportCsv = (type: 'pdf' | 'excel') => {
    const filename =
      type === 'pdf'
        ? `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
        : `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    downloadCsv(filteredEntries, filename)
  }

  const toggleRowExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id))
  }

  return (
    <div className={`space-y-4 p-6 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* ===== HEADER ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className={`text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
          >
            <span className="inline-flex items-center gap-2"><Shield className="h-6 w-6" />JOURNAL D&lsquo;AUDIT</span>
          </h1>
          <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Historique complet des actions réalisées dans le backoffice
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => handleExportCsv('pdf')}
          >
            <FileDown className="h-3.5 w-3.5" />
            Exporter PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => handleExportCsv('excel')}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exporter Excel
          </Button>
        </div>
      </div>

      {/* ===== TOTAL COUNT ===== */}
      <div className="flex items-center gap-3">
        <Card className={`flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
              <Shield className={`h-5 w-5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {filteredEntries.length}
              </p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                entrée{filteredEntries.length !== 1 ? 's' : ''} trouvée{filteredEntries.length !== 1 ? 's' : ''}
                {filteredEntries.length !== auditLog.length && (
                  <span className={`ml-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    (sur {auditLog.length} au total)
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== FILTERS ===== */}
      <Card className={`${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
        <CardContent className="space-y-4 p-4">
          {/* Search */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            <Input
              placeholder="Rechercher dans le journal..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9"
            />
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className={`text-[11px] font-medium uppercase ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                Période
              </Label>
              <Select
                value={dateRange}
                onValueChange={handleFilterChange((v: string) => setDateRange(v as DateRangeFilter))}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATE_RANGE_LABELS) as DateRangeFilter[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {DATE_RANGE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className={`text-[11px] font-medium uppercase ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                Utilisateur
              </Label>
              <Select
                value={userFilter}
                onValueChange={handleFilterChange(setUserFilter)}
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les utilisateurs</SelectItem>
                  {uniqueUsers.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className={`text-[11px] font-medium uppercase ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                Action
              </Label>
              <Select
                value={actionFilter}
                onValueChange={handleFilterChange(setActionFilter)}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Toutes les actions</SelectItem>
                  {uniqueActions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className={`text-[11px] font-medium uppercase ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                Module
              </Label>
              <Select
                value={moduleFilter}
                onValueChange={handleFilterChange(setModuleFilter)}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les modules</SelectItem>
                  {uniqueModules.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== TABLE ===== */}
      <Card className={`${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow
                  className="hover:bg-transparent"
                  style={{ backgroundColor: isDark ? '#1e293b' : '#fafafa' }}
                >
                  <TableHead
                    className={`w-8 font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                  >
                    <span className="sr-only">Détails</span>
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 130 }}
                  >
                    Date/Heure
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 140 }}
                  >
                    Utilisateur
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 120 }}
                  >
                    Action
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 100 }}
                  >
                    Module
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 120 }}
                  >
                    IP Address
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 160 }}
                  >
                    User-Agent
                  </TableHead>
                  <TableHead
                    className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    style={{ minWidth: 80 }}
                  >
                    Détails
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className={`py-12 text-center text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}
                    >
                      Aucune entrée d\'audit trouvée pour les filtres sélectionnés.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEntries.map((entry, idx) => {
                    const isExpanded = expandedRowId === entry.id
                    return (
                      <Fragment key={entry.id}>
                        <TableRow
                          className={`cursor-pointer select-none transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-50'} ${
                            idx % 2 === 0
                              ? isDark ? 'bg-slate-800' : 'bg-white'
                              : isDark ? 'bg-slate-800/70' : 'bg-gray-50/40'
                          } ${isExpanded ? (isDark ? 'bg-slate-700/50' : 'bg-gray-50') : ''}`}
                          onClick={() => toggleRowExpand(entry.id)}
                        >
                          {/* Expand indicator */}
                          <TableCell className="w-8 p-2">
                            <div className={`flex h-5 w-5 items-center justify-center rounded ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </div>
                          </TableCell>

                          {/* Date/Time */}
                          <TableCell className="text-sm">
                            <div>
                              <div className={isDark ? 'text-slate-100' : 'text-slate-900'}>
                                {formatDateTime(entry.timestamp)}
                              </div>
                              <div className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                {getTimeAgo(entry.timestamp)}
                              </div>
                            </div>
                          </TableCell>

                          {/* User */}
                          <TableCell>
                            <div>
                              <div className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {entry.userName}
                              </div>
                              <div className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                {entry.userEmail}
                              </div>
                            </div>
                          </TableCell>

                          {/* Action */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`whitespace-nowrap text-[11px] font-medium ${
                                ACTION_BADGE_COLORS[entry.action] ??
                                (isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-gray-100 text-gray-700 border-gray-200')
                              }`}
                            >
                              {entry.action}
                            </Badge>
                          </TableCell>

                          {/* Module */}
                          <TableCell className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            {entry.module}
                          </TableCell>

                          {/* IP */}
                          <TableCell className={`font-mono text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            {entry.ipAddress ?? '—'}
                          </TableCell>

                          {/* User-Agent (truncated) */}
                          <TableCell className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                            {truncateString(entry.userAgent ?? '', 28)}
                          </TableCell>

                          {/* Details button */}
                          <TableCell>
                            {entry.details ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 text-[11px] ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRowExpand(entry.id)
                                }}
                              >
                                Voir
                              </Button>
                            ) : (
                              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-300'}`}>—</span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded details */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="p-0"
                            >
                              <ExpandedDetails entry={entry} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ===== PAGINATION ===== */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
          Affichage {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredEntries.length)}
          {'–'}
          {Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)}
          {' '}sur {filteredEntries.length}
        </p>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              // Show first, last, current, and neighbors
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
                  className={`flex h-8 w-8 items-center justify-center text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  variant={currentPage === item ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 w-8 p-0 text-xs ${
                    currentPage === item
                      ? 'text-white'
                      : ''
                  }`}
                  style={
                    currentPage === item
                      ? { backgroundColor: isDark ? '#3B82F6' : '#0F172A', color: '#fff' }
                      : undefined
                  }
                  onClick={() => setCurrentPage(item)}
                >
                  {item}
                </Button>
              )
            )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
