'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import {
  CheckCircle2,
  CloudOff,
  Clock,
  FileText,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
  Building2,
  Droplets,
  UsersRound,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type ActorType, type Dossier, type DossierStatus } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

type FilterKey = DossierStatus | 'tous'

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillon', label: 'Brouillons' },
  { key: 'en_attente', label: 'En attente' },
]

const STATUS_FILTERS: { key: DossierStatus | 'tous'; label: string; icon: typeof Clock }[] = [
  { key: 'tous', label: 'Tous les statuts', icon: Clock },
  { key: 'brouillon', label: 'Brouillons', icon: FileText },
  { key: 'en_attente', label: 'En attente', icon: Clock },
  { key: 'valide', label: 'Validés', icon: CheckCircle2 },
  { key: 'rejete', label: 'Rejetés', icon: XCircle },
]

const TYPE_FILTERS: { key: ActorType | 'tous'; label: string; icon: typeof Building2 }[] = [
  { key: 'tous', label: 'Tous les types', icon: UsersRound },
  { key: 'marchand', label: 'Marchands', icon: Building2 },
  { key: 'producteur', label: 'Producteurs', icon: Droplets },
  { key: 'cooperative', label: 'Coopératives', icon: UsersRound },
]

const ZONES = [
  'Adjamé', 'Cocody', 'Plateau', 'Abobo', 'Yopougon',
  'Bouaké', 'Daloa', 'San Pedro', 'Korhogo', 'Man',
  'Gagnoa', 'Divo', 'Soubré', 'Aboisso', 'Anyama',
]

function statusBadge(status: DossierStatus) {
  if (status === 'en_attente') return { label: 'En attente', className: 'bg-yellow-50 text-yellow-700' }
  if (status === 'valide') return { label: 'Validé', className: 'bg-green-50 text-green-700' }
  if (status === 'rejete') return { label: 'Rejeté', className: 'bg-red-50 text-red-600' }
  return { label: 'Brouillon', className: 'bg-stone-100 text-stone-600' }
}

function groupByDate(dossiers: Dossier[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000

  const todayItems: Dossier[] = []
  const yesterdayItems: Dossier[] = []
  const olderItems: Dossier[] = []

  for (const d of dossiers) {
    if (d.updatedAt >= today) todayItems.push(d)
    else if (d.updatedAt >= yesterday) yesterdayItems.push(d)
    else olderItems.push(d)
  }

  const groups: { label: string; items: Dossier[] }[] = []
  if (todayItems.length) groups.push({ label: "Aujourd'hui", items: todayItems })
  if (yesterdayItems.length) groups.push({ label: 'Hier', items: yesterdayItems })
  if (olderItems.length) groups.push({ label: 'Plus tôt', items: olderItems })
  return groups
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

export function IdentSuiviScreen() {
  const { navigate, soleilMode, merchantId } = useAppStore()
  const { dossiers, setCurrentDraftId, identDarkMode, dossiersFilterIntent, setDossiersFilterIntent, dossiersZoneIntent, setDossiersZoneIntent, syncDossiersFromServer } = useIdentificateurStore()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<DossierStatus | 'tous'>(() => dossiersFilterIntent ?? 'tous')
  const [activeZone, setActiveZone] = useState<string | null>(() => dossiersZoneIntent)
  const [showFilterSheet, setShowFilterSheet] = useState(false)

  // Advanced filter state
  const [filterStatus, setFilterStatus] = useState<DossierStatus | 'tous'>('tous')
  const [filterType, setFilterType] = useState<ActorType | 'tous'>('tous')
  const [filterZone, setFilterZone] = useState<string | null>(null)

  useEffect(() => {
    if (dossiersFilterIntent) setDossiersFilterIntent(null)
    if (dossiersZoneIntent) setDossiersZoneIntent(null)
  }, [])

  useEffect(() => {
    if (merchantId) syncDossiersFromServer(merchantId)
  }, [merchantId, syncDossiersFromServer])

  const counts = useMemo(() => ({
    tous: dossiers.length,
    brouillon: dossiers.filter((d) => d.status === 'brouillon').length,
    en_attente: dossiers.filter((d) => d.status === 'en_attente').length,
    valide: dossiers.filter((d) => d.status === 'valide').length,
    rejete: dossiers.filter((d) => d.status === 'rejete').length,
  }), [dossiers])

  const filteredDossiers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase()
    return dossiers.filter((d) => {
      // Tab filter
      if (activeTab !== 'tous' && d.status !== activeTab) return false
      // Advanced status filter (overrides tab when sheet is used)
      if (filterStatus !== 'tous' && d.status !== filterStatus) return false
      // Type filter
      if (filterType !== 'tous' && d.actorType !== filterType) return false
      // Zone filter (from sheet or from chip)
      const zone = filterZone || activeZone
      if (zone && d.zone !== zone) return false
      // Search
      if (!q) return true
      return [d.firstName, d.lastName, d.phone, d.dossierNumber, d.zone]
        .join(' ').toLocaleLowerCase().includes(q)
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeTab, activeZone, filterStatus, filterType, filterZone, searchQuery, dossiers])

  const groups = useMemo(() => groupByDate(filteredDossiers), [filteredDossiers])
  const exportReady = dossiers.filter((d) => d.status === 'en_attente').length

  // Count active advanced filters
  const activeFilterCount = [
    filterStatus !== 'tous',
    filterType !== 'tous',
    filterZone !== null,
  ].filter(Boolean).length

  const handleCardClick = (dossier: Dossier) => {
    setCurrentDraftId(dossier.id)
    navigate('ident-dossier-detail')
  }

  const applyFilters = () => {
    setFilterStatus(filterStatus)
    setFilterType(filterType)
    setFilterZone(filterZone)
    setShowFilterSheet(false)
  }

  const resetFilters = () => {
    setFilterStatus('tous')
    setFilterType('tous')
    setFilterZone(null)
    setActiveZone(null)
    setActiveTab('tous')
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedTextClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#E7E0D8] bg-[#FAFAF7]/80 px-4 pb-4 pt-4 backdrop-blur-lg" style={identDarkMode ? { backgroundColor: 'rgba(28,25,23,0.8)', borderColor: 'rgb(68 64 60)' } : undefined}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className={cn('text-lg font-bold', textClass)}>Dossiers</h1>
              <span className="flex items-center gap-1 text-[10px] text-[#78716C]">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Synchronisé il y a 2 min
              </span>
            </div>
          </div>
          <span className="rounded-full bg-[#F5F0EB] px-3 py-1 text-[11px] font-semibold text-[#6B584C]">
            {filteredDossiers.length} dossier{filteredDossiers.length > 1 ? 's' : ''}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#78716C]">
          Gestion et suivi de vos dossiers d&apos;enrôlement
        </p>
      </header>

      {/* Cache banner */}
      <div className="mx-4 mb-3 rounded-xl bg-[#F5F0EB] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 shrink-0 text-[#9F8170]" />
          <p className="text-xs text-[#6B584C]">
            Tous dossiers sauvegardés localement · {counts.tous} en cache
          </p>
        </div>
      </div>

      <main className="px-4 pb-4">
        {/* Tabs */}
        <div className="mb-3 flex gap-1.5" role="tablist">
          {TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveTab(tab.key); setFilterStatus('tous') }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.97]',
                  active
                    ? 'bg-[#9F8170] text-white'
                    : 'bg-white text-[#57534E] border border-[#E7E0D8]'
                )}
              >
                {tab.label}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-white/20' : 'bg-[#F5F0EB]')}>
                  {counts[tab.key as keyof typeof counts]}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            aria-label={`Filtrer${activeFilterCount > 0 ? ` (${activeFilterCount} actif${activeFilterCount > 1 ? 's' : ''})` : ''}`}
            onClick={() => setShowFilterSheet(true)}
            className={cn(
              'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
              activeFilterCount > 0 ? 'border-[#9F8170] bg-[#9F8170] text-white' : 'border-[#E7E0D8] bg-white text-[#78716C]'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
          <Input
            aria-label="Rechercher un dossier"
            placeholder="Rechercher par nom, téléphone, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 rounded-xl border-0 bg-white pl-[38px] text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50"
          />
        </div>

        {/* Active filter chips */}
        {(activeZone || filterStatus !== 'tous' || filterType !== 'tous') && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {filterStatus !== 'tous' && (
              <button
                type="button"
                onClick={() => setFilterStatus('tous')}
                className="flex items-center gap-1 rounded-full bg-[#9F8170] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {STATUS_FILTERS.find((f) => f.key === filterStatus)?.label}
                <X className="h-3 w-3" />
              </button>
            )}
            {filterType !== 'tous' && (
              <button
                type="button"
                onClick={() => setFilterType('tous')}
                className="flex items-center gap-1 rounded-full bg-[#9F8170] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {TYPE_FILTERS.find((f) => f.key === filterType)?.label}
                <X className="h-3 w-3" />
              </button>
            )}
            {(activeZone || filterZone) && (
              <button
                type="button"
                onClick={() => { setActiveZone(null); setFilterZone(null) }}
                className="flex items-center gap-1 rounded-full bg-[#9F8170] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                <MapPin className="h-3 w-3" />
                {activeZone || filterZone}
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600"
            >
              Tout effacer
            </button>
          </div>
        )}

        {/* Dossier groups */}
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className={cn('mb-2 text-[11px] font-bold uppercase tracking-wide', mutedTextClass)}>
                {group.label}
                <span className="ml-1.5 text-[10px] font-normal normal-case tracking-normal">· {group.items.length} dossier{group.items.length > 1 ? 's' : ''}</span>
              </h3>
              <div className="space-y-2">
                {group.items.map((dossier) => {
                  const badge = statusBadge(dossier.status)
                  const initials = `${dossier.firstName.charAt(0)}${dossier.lastName.charAt(0)}`.trim() || '?'
                  return (
                    <div
                      key={dossier.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleCardClick(dossier)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(dossier) } }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border p-3 transition-all duration-150 ease-out active:scale-[0.98]',
                        identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'
                      )}
                    >
                      {/* Avatar */}
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#9F8170] text-sm font-bold text-white">
                        {dossier.photoBase64 ? (
                          <img src={dossier.photoBase64} alt="" className="h-11 w-11 rounded-full object-cover" />
                        ) : initials}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('truncate text-sm font-bold', textClass)}>
                            {dossier.firstName} {dossier.lastName}
                          </span>
                          <Badge className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium', badge.className)}>
                            {badge.label}
                          </Badge>
                        </div>
                        <p className={cn('mt-0.5 truncate text-xs', mutedTextClass)}>
                          {dossier.activite || dossier.actorType} · {dossier.zone || 'Zone non renseignée'}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#78716C]">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{dossier.phone || '—'}</span>
                          <span className="ml-1">·</span>
                          <span className="ml-1">{timeAgo(dossier.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Correction badge for rejected */}
                      {dossier.status === 'rejete' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setCurrentDraftId(dossier.id); navigate('ident-identification') }}
                          className="shrink-0 gap-1 border-red-200 text-xs text-red-600 hover:bg-red-50"
                        >
                          Corriger
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {filteredDossiers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F0EB] text-[#9F8170]">
                <FileText className="h-6 w-6" />
              </span>
              <p className={cn('mt-3 text-sm', mutedTextClass)}>
                {searchQuery || activeTab !== 'tous' || activeZone || filterStatus !== 'tous' || filterType !== 'tous' ? 'Aucun dossier trouvé' : 'Aucun dossier'}
              </p>
              {(searchQuery || activeTab !== 'tous' || activeZone || filterStatus !== 'tous' || filterType !== 'tous') && (
                <button type="button" onClick={resetFilters} className="mt-2 text-xs font-semibold text-[#9F8170]">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}
        </div>

        {/* Export ready banner */}
        {exportReady > 0 && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              <div>
                <p className="text-xs font-semibold text-green-800">
                  {exportReady} dossier{exportReady > 1 ? 's' : ''} prêt{exportReady > 1 ? 's' : ''} à l&apos;export
                </p>
                <p className="text-[11px] text-green-600">
                  Synchronisation automatique dès le retour d&apos; réseau.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Filter bottom sheet */}
      <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <SheetContent side="bottom" className={cn('rounded-t-2xl', identDarkMode ? 'bg-stone-900' : '')}>
          <SheetHeader className="pb-4">
            <SheetTitle className={cn('text-base', textClass)}>Filtrer les dossiers</SheetTitle>
            <SheetDescription className={cn('text-xs', mutedTextClass)}>
              Affinez votre recherche par statut, type ou zone
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 pb-6">
            {/* Status filter */}
            <div>
              <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Statut</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => {
                  const Icon = filter.icon
                  const active = filterStatus === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setFilterStatus(filter.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-150 ease-out active:scale-[0.97]',
                        active
                          ? 'border-[#9F8170] bg-[#9F8170] text-white'
                          : 'border-[#E7E0D8] bg-white text-[#57534E]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actor type filter */}
            <div>
              <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Type d&apos;acteur</p>
              <div className="flex flex-wrap gap-2">
                {TYPE_FILTERS.map((filter) => {
                  const Icon = filter.icon
                  const active = filterType === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setFilterType(filter.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-150 ease-out active:scale-[0.97]',
                        active
                          ? 'border-[#9F8170] bg-[#9F8170] text-white'
                          : 'border-[#E7E0D8] bg-white text-[#57534E]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Zone filter */}
            <div>
              <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', mutedTextClass)}>Zone</p>
              <div className="flex flex-wrap gap-2">
                {ZONES.map((zone) => {
                  const active = filterZone === zone
                  return (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setFilterZone(active ? null : zone)}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-150 ease-out active:scale-[0.97]',
                        active
                          ? 'border-[#9F8170] bg-[#9F8170] text-white'
                          : 'border-[#E7E0D8] bg-white text-[#57534E]'
                      )}
                    >
                      <MapPin className="h-3 w-3" />
                      {zone}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-[#E7E0D8] pt-4 pb-[env(safe-area-inset-bottom)]">
            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              className="flex-1 rounded-xl border-[#E7E0D8] text-sm font-semibold"
            >
              Réinitialiser
            </Button>
            <Button
              type="button"
              onClick={applyFilters}
              className="flex-1 rounded-xl bg-[#9F8170] text-sm font-semibold text-white hover:bg-[#8A6E5E]"
            >
              Appliquer{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
