'use client'

/**
 * Liste des dossiers identificateur — maquette « vues du menu » : bannière
 * cache hors-ligne, recherche + filtres avancés escamotables, puces de
 * statut (brouillons inclus), sections par jour (AUJOURD'HUI / HIER / …),
 * cartes photo + badge, bannière d'export.
 */

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudUpload,
  Database,
  Droplets,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type ActorType, type Dossier, type DossierStatus } from '@/lib/stores/identificateur-store'
import { IdentTopBar } from '@/components/identificateur/ident-top-bar'
import { dayGroupOf, formatRelativeTime, type DayGroupInfo } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

type FilterKey = 'tous' | 'brouillons' | DossierStatus

const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const ACTOR_TYPE_FILTERS: { key: ActorType; label: string; icon: typeof Building2 }[] = [
  { key: 'marchand', label: 'Marchands', icon: Building2 },
  { key: 'producteur', label: 'Producteurs', icon: Droplets },
  { key: 'cooperative', label: 'Coopératives', icon: UsersRound },
]

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'en_attente', label: 'En attente' },
  { key: 'valide', label: 'Validés' },
  { key: 'rejete', label: 'Rejetés' },
]

function statusBadge(status: DossierStatus) {
  if (status === 'en_attente') return { label: 'En attente', className: 'bg-blue-50 text-blue-600' }
  if (status === 'valide') return { label: 'Validé', className: 'bg-green-50 text-green-600' }
  if (status === 'rejete') return { label: 'Rejeté', className: 'bg-red-50 text-red-600' }
  return { label: 'Brouillon', className: 'bg-[#F5F0EB] text-[#78716C]' }
}

interface DossierGroup {
  label: string
  right: string
  items: Dossier[]
}

function groupByDay(dossiers: Dossier[]): DossierGroup[] {
  const groups = new Map<string, { info: DayGroupInfo; zones: string[]; items: Dossier[] }>()
  for (const dossier of dossiers) {
    const info = dayGroupOf(dossier.updatedAt) ?? { key: 'older' as const, label: 'PLUS ANCIENS' }
    const entry = groups.get(info.label) ?? { info, zones: [], items: [] }
    if (dossier.zone && !entry.zones.includes(dossier.zone)) entry.zones.push(dossier.zone)
    entry.items.push(dossier)
    groups.set(info.label, entry)
  }
  return [...groups.values()].map(({ info, zones, items }) => ({
    label: info.label,
    right: info.key === 'today' ? `${items.length} récent${items.length > 1 ? 's' : ''}` : zones.slice(0, 2).join(' & '),
    items,
  }))
}

export function IdentSuiviScreen() {
  const { navigate, soleilMode, merchantId } = useAppStore()
  const {
    dossiers,
    agentZone,
    identDarkMode,
    dossiersFilterIntent,
    setDossiersFilterIntent,
    dossiersZoneIntent,
    setDossiersZoneIntent,
    setDossierDetailId,
    setCurrentDraftId,
    syncDossiersFromServer,
  } = useIdentificateurStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>(() => dossiersFilterIntent ?? 'tous')
  const [activeType, setActiveType] = useState<ActorType | 'tous'>('tous')
  const [showTypeFilters, setShowTypeFilters] = useState(false)
  // Zone imposée par l'écran Missions (« Voir la liste des dossiers de la
  // zone ») : filtre actif jusqu'à ce que l'agent le retire avec la puce.
  const [activeZone, setActiveZone] = useState<string | null>(() => dossiersZoneIntent)

  // Consume the Home screen's shortcut intent once so a later visit via
  // the bottom bar starts back on "Tous".
  useEffect(() => {
    if (dossiersFilterIntent) setDossiersFilterIntent(null)
    if (dossiersZoneIntent) setDossiersZoneIntent(null)
  }, [])

  // Submission only ever wrote to the server — this screen used to show
  // whatever local status a dossier had at the moment it was sent, never
  // learning that a backoffice admin later validated or rejected it.
  useEffect(() => {
    if (merchantId) syncDossiersFromServer(merchantId)
  }, [merchantId, syncDossiersFromServer])

  const brouillons = useMemo(() => dossiers.filter((d) => d.status === 'brouillon'), [dossiers])
  const submittedDossiers = useMemo(() => dossiers.filter((d) => d.status !== 'brouillon'), [dossiers])
  const counts = useMemo(() => ({
    tous: submittedDossiers.length,
    brouillons: brouillons.length,
    en_attente: submittedDossiers.filter((d) => d.status === 'en_attente').length,
    valide: submittedDossiers.filter((d) => d.status === 'valide').length,
    rejete: submittedDossiers.filter((d) => d.status === 'rejete').length,
  }), [brouillons, submittedDossiers])

  const filteredDossiers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase()
    const pool = activeFilter === 'brouillons' ? brouillons : submittedDossiers
    return pool
      .filter((dossier) => (activeFilter === 'tous' || activeFilter === 'brouillons' ? true : dossier.status === activeFilter))
      .filter((dossier) => (activeType === 'tous' ? true : dossier.actorType === activeType))
      .filter((dossier) => (activeZone ? dossier.zone === activeZone : true))
      .filter((dossier) => {
        if (!q) return true
        return [dossier.firstName, dossier.lastName, dossier.phone, dossier.dossierNumber, dossier.zone]
          .join(' ').toLocaleLowerCase().includes(q)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeFilter, activeType, activeZone, brouillons, searchQuery, submittedDossiers])

  const groups = useMemo(() => groupByDay(filteredDossiers), [filteredDossiers])

  const openDetail = (dossier: Dossier) => {
    setDossierDetailId(dossier.id)
    navigate('ident-dossier-detail')
  }

  const handleCorrect = (event: React.MouseEvent, dossier: Dossier) => {
    event.stopPropagation()
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const textClass = identDarkMode ? 'text-stone-100' : soleilMode ? 'text-black' : ''
  const mutedClass = identDarkMode ? 'text-stone-400' : 'text-[#78716C]'
  const cardClass = identDarkMode ? 'border-stone-700 bg-stone-900' : 'border-[#E7E0D8] bg-white'

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-[calc(6rem+env(safe-area-inset-bottom))]', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <IdentTopBar title="Dossiers" />

      <main className="px-4 pt-3">
        {/* Bannière cache hors-ligne */}
        <div className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5', cardClass)}>
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>
            <Database className="h-4 w-4" />
          </span>
          <p className={cn('min-w-0 flex-1 truncate text-xs', mutedClass)}>
            Tous les dossiers sauvegardés localement, consultables hors connexion
          </p>
          <span className={cn('shrink-0 text-xs font-bold', textClass)}>{dossiers.length} en cache</span>
        </div>

        {/* Titre + zone */}
        <div className="mt-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className={cn('text-xl font-bold', textClass)}>Dossiers</h1>
            <p className={cn('mt-0.5 truncate text-xs', mutedClass)}>{counts.tous} dossiers · Secteur {agentZone}</p>
          </div>
          {activeZone ? (
            <button
              type="button"
              aria-label={`Retirer le filtre zone ${activeZone}`}
              onClick={() => setActiveZone(null)}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]"
              style={{ backgroundColor: IDENT_COLOR }}
            >
              <MapPin className="h-3 w-3" />
              Zone {activeZone}
              <X className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Filtrer sur la zone ${agentZone}`}
              onClick={() => setActiveZone(agentZone)}
              className={cn('flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-300' : 'border-[#E7E0D8] bg-white text-[#6B584C]')}
            >
              <MapPin className="h-3 w-3" />
              Zone {agentZone}
            </button>
          )}
        </div>

        {/* Recherche + filtres avancés */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
            <Input
              aria-label="Rechercher un dossier"
              placeholder="Rechercher par nom, téléphone, ID..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={cn('h-10 rounded-lg border-0 pl-[38px] text-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50', identDarkMode ? 'bg-stone-800 text-stone-100 placeholder:text-stone-500' : 'bg-[#F5F0EB]')}
            />
          </div>
          <button
            type="button"
            aria-label="Filtres avancés"
            aria-expanded={showTypeFilters}
            onClick={() => setShowTypeFilters((v) => !v)}
            className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', showTypeFilters || activeType !== 'tous' ? 'border-[#9F8170] bg-[#FDF3ED] text-[#9F8170]' : cn(identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-300' : 'border-[#E7E0D8] bg-white text-[#6B584C]'))}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {showTypeFilters && (
          <div className="mt-2 flex gap-2" aria-label="Filtrer les dossiers par type">
            <button type="button" aria-label="Tous les types" aria-pressed={activeType === 'tous'} onClick={() => setActiveType('tous')} className={cn('flex h-9 w-9 items-center justify-center rounded-[10px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', activeType === 'tous' ? 'border-[#9F8170] bg-[#FDF3ED] text-[#9F8170]' : cn(identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-400' : 'border-[#E7E0D8] bg-white text-[#78716C]'))}>
              <UsersRound className="h-[17px] w-[17px]" />
            </button>
            {ACTOR_TYPE_FILTERS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" aria-label={`Filtrer : ${label}`} aria-pressed={activeType === key} onClick={() => setActiveType(activeType === key ? 'tous' : key)} className={cn('flex h-9 w-9 items-center justify-center rounded-[10px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', activeType === key ? 'border-[#9F8170] bg-[#FDF3ED] text-[#9F8170]' : cn(identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-400' : 'border-[#E7E0D8] bg-white text-[#78716C]'))}>
                <Icon className="h-[17px] w-[17px]" />
              </button>
            ))}
          </div>
        )}

        {/* Puces de statut */}
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filtrer les dossiers par statut">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key
            return (
              <button key={filter.key} type="button" role="tab" aria-selected={active} onClick={() => setActiveFilter(filter.key)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', active ? 'border-[#9F8170] text-white' : cn(identDarkMode ? 'border-stone-700 bg-stone-900 text-stone-300' : 'border-[#E7E0D8] bg-white text-[#57534E]'))} style={active ? { backgroundColor: IDENT_COLOR } : undefined}>
                {filter.label}
                <span className={cn('rounded-full px-1.5 text-[10px] font-bold', active ? 'bg-white/20' : identDarkMode ? 'bg-stone-800' : 'bg-[#F5F0EB]')}>{counts[filter.key]}</span>
              </button>
            )
          })}
        </div>

        {/* Sections par jour */}
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className={cn('text-[11px] font-bold uppercase tracking-wider', mutedClass)}>{group.label}</h2>
                <span className={cn('truncate text-[11px]', mutedClass)}>{group.right}</span>
              </div>
              <div className="space-y-2.5">
                {group.items.map((dossier) => (
                  <DossierCard key={dossier.id} dossier={dossier} cardClass={cardClass} textClass={textClass} mutedClass={mutedClass} identDarkMode={identDarkMode} soleilMode={soleilMode} onClick={() => openDetail(dossier)} onCorrect={(event) => handleCorrect(event, dossier)} />
                ))}
              </div>
            </section>
          ))}

          {filteredDossiers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}><CheckCircle2 className="h-6 w-6" /></span>
              <p className={cn('mt-3 text-sm', mutedClass, soleilMode && 'text-base')}>{searchQuery || activeType !== 'tous' || activeZone ? 'Aucun dossier trouvé' : 'Aucun dossier à suivre'}</p>
              {(searchQuery || activeType !== 'tous' || activeZone) && (
                <button type="button" onClick={() => { setSearchQuery(''); setActiveType('tous'); setActiveZone(null); setActiveFilter('tous') }} className="mt-2 text-xs font-semibold text-[#9F8170]">Réinitialiser les filtres</button>
              )}
            </div>
          )}

          {/* Bannière d'export / synchronisation */}
          {counts.en_attente > 0 ? (
            <div className={cn('flex items-center gap-3 rounded-2xl border p-3.5', cardClass)}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <CloudUpload className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={cn('text-[13px] font-bold', textClass)}>{counts.en_attente} dossier{counts.en_attente > 1 ? 's' : ''} prêt{counts.en_attente > 1 ? 's' : ''} à l’export</p>
                <p className={cn('mt-0.5 text-xs', mutedClass)}>Synchronisation automatique active dès retour dans la ville</p>
              </div>
            </div>
          ) : counts.tous > 0 && (
            <div className={cn('flex items-center gap-3 rounded-2xl border p-3.5', cardClass)}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={cn('text-[13px] font-bold', textClass)}>Tous les dossiers sont à jour</p>
                <p className={cn('mt-0.5 text-xs', mutedClass)}>Aucune action requise sur le secteur {agentZone}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function DossierCard({
  dossier,
  cardClass,
  textClass,
  mutedClass,
  identDarkMode,
  soleilMode,
  onClick,
  onCorrect,
}: {
  dossier: Dossier
  cardClass: string
  textClass: string
  mutedClass: string
  identDarkMode: boolean
  soleilMode: boolean
  onClick: () => void
  onCorrect: (event: React.MouseEvent) => void
}) {
  const badge = statusBadge(dossier.status)
  const initials = `${dossier.firstName.charAt(0)}${dossier.lastName.charAt(0)}`.trim().toUpperCase() || '?'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick() } }}
      className={cn('cursor-pointer rounded-2xl border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170] active:scale-[0.99]', cardClass, dossier.status === 'rejete' && 'opacity-95')}
    >
      <div className="flex items-center gap-3">
        {dossier.photoBase64 ? (
          <img src={dossier.photoBase64} alt={`Photo de ${dossier.firstName} ${dossier.lastName}`} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold', identDarkMode ? 'bg-stone-800 text-stone-300' : 'bg-[#F5F0EB] text-[#9F8170]')}>{initials}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-bold', textClass, soleilMode && 'text-base')}>{dossier.firstName} {dossier.lastName}</p>
          <p className={cn('mt-0.5 truncate text-xs', mutedClass)}>
            {ACTOR_TYPE_LABELS[dossier.actorType]} - {dossier.zone || 'Zone non renseignée'} · {dossier.phone}
          </p>
        </div>
        <Badge className={cn('shrink-0 rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold', badge.className)}>
          {dossier.status === 'valide' && <CheckCircle2 className="mr-1 h-3 w-3" />}
          {dossier.status === 'rejete' && <XCircle className="mr-1 h-3 w-3" />}
          {dossier.status === 'en_attente' && <Clock3 className="mr-1 h-3 w-3" />}
          {badge.label}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('flex min-w-0 items-center gap-1 text-[11px]', mutedClass)}>
          <RefreshCw className="h-3 w-3 shrink-0" />
          <span className="truncate">Mise à jour {formatRelativeTime(dossier.updatedAt)}</span>
        </span>
        {dossier.status === 'rejete' ? (
          <button
            type="button"
            onClick={onCorrect}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <XCircle className="h-3.5 w-3.5" />
            Corriger
          </button>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[#A8A29E]" />
        )}
      </div>
    </div>
  )
}
