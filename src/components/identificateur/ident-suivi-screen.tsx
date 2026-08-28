'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Building2, CheckCircle2, Droplets, MapPin, Search, Trash2, UsersRound, XCircle } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type ActorType, type Dossier, type DossierStatus } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'
type FilterKey = 'tous' | DossierStatus

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

const FILTERS: { key: FilterKey; label: string; status?: DossierStatus }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'en_attente', label: 'En attente', status: 'en_attente' },
  { key: 'valide', label: 'Validé', status: 'valide' },
  { key: 'rejete', label: 'Rejeté', status: 'rejete' },
]

function formatDate(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function statusStyle(status: DossierStatus) {
  if (status === 'en_attente') return 'bg-yellow-50 text-yellow-700'
  if (status === 'valide') return 'bg-green-50 text-green-600'
  if (status === 'rejete') return 'bg-red-50 text-red-600'
  return 'bg-stone-100 text-stone-500'
}

function statusLabel(status: DossierStatus) {
  if (status === 'en_attente') return 'En attente'
  if (status === 'valide') return 'Validé'
  if (status === 'rejete') return 'Rejeté'
  return 'Brouillon'
}

export function IdentSuiviScreen() {
  const { goBack, navigate, soleilMode } = useAppStore()
  const { dossiers, setCurrentDraftId, deleteDossier, identDarkMode, dossiersFilterIntent, setDossiersFilterIntent } = useIdentificateurStore()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>(() => dossiersFilterIntent ?? 'tous')
  const [activeType, setActiveType] = useState<ActorType | 'tous'>('tous')

  // Consume the Home screen's shortcut intent once so a later visit via
  // the bottom bar starts back on "Tous".
  useEffect(() => {
    if (dossiersFilterIntent) setDossiersFilterIntent(null)
  }, [])

  const submittedDossiers = useMemo(() => dossiers.filter((d) => d.status !== 'brouillon'), [dossiers])
  const counts = useMemo(() => ({
    tous: submittedDossiers.length,
    en_attente: submittedDossiers.filter((d) => d.status === 'en_attente').length,
    valide: submittedDossiers.filter((d) => d.status === 'valide').length,
    rejete: submittedDossiers.filter((d) => d.status === 'rejete').length,
  }), [submittedDossiers])
  const filteredDossiers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase()
    return submittedDossiers.filter((dossier) => {
      if (activeFilter !== 'tous' && dossier.status !== activeFilter) return false
      if (activeType !== 'tous' && dossier.actorType !== activeType) return false
      if (!q) return true
      return [dossier.firstName, dossier.lastName, dossier.phone, dossier.dossierNumber, dossier.zone]
        .join(' ').toLocaleLowerCase().includes(q)
    })
  }, [activeFilter, activeType, searchQuery, submittedDossiers])

  const handleCardClick = (dossier: Dossier) => {
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleCorrect = (event: React.MouseEvent, dossier: Dossier) => {
    event.stopPropagation()
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleDelete = (event: React.MouseEvent, dossier: Dossier) => {
    event.stopPropagation()
    deleteDossier(dossier.id)
    toast({ title: 'Dossier supprimé', description: `${dossier.dossierNumber} a été supprimé.` })
  }

  return (
    <div className={cn('screen-enter min-h-full bg-[#FAFAF7] pb-24', soleilMode && 'text-black', identDarkMode && 'bg-stone-950')}>
      <header className="flex items-center gap-2.5 rounded-b-[20px] px-4 py-3.5 text-white" style={{ backgroundColor: IDENT_COLOR }}>
        <Button type="button" variant="ghost" size="icon" aria-label="Retour" onClick={goBack} className="h-9 w-9 text-white hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-[15px] font-bold">Mes dossiers</span>
      </header>

      <main className="px-4 pb-4 pt-3.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
          <Input
            aria-label="Rechercher un dossier"
            placeholder="Nom, téléphone, zone..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-11 rounded-xl border-0 bg-[#F5F0EB] pl-[38px] text-sm focus-visible:ring-1 focus-visible:ring-[#9F8170]/50"
          />
        </div>

        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filtrer les dossiers par statut">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key
            return (
              <button key={filter.key} type="button" role="tab" aria-selected={active} onClick={() => setActiveFilter(filter.key)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', active ? 'border-[#9F8170] bg-[#9F8170] text-white' : 'border-[#E7E0D8] bg-white text-[#57534E]')}>
                {filter.label} · {counts[filter.key]}
              </button>
            )
          })}
        </div>

        <div className="mt-2.5 flex gap-2" aria-label="Filtrer les dossiers par type">
          <button type="button" aria-label="Tous les types" aria-pressed={activeType === 'tous'} onClick={() => setActiveType('tous')} className={cn('flex h-9 w-9 items-center justify-center rounded-[10px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', activeType === 'tous' ? 'border-[#9F8170] bg-[#FDF3ED] text-[#9F8170]' : 'border-[#E7E0D8] bg-white text-[#78716C]')}>
            <UsersRound className="h-[17px] w-[17px]" />
          </button>
          {ACTOR_TYPE_FILTERS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-label={`Filtrer : ${label}`} aria-pressed={activeType === key} onClick={() => setActiveType(activeType === key ? 'tous' : key)} className={cn('flex h-9 w-9 items-center justify-center rounded-[10px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170]', activeType === key ? 'border-[#9F8170] bg-[#FDF3ED] text-[#9F8170]' : 'border-[#E7E0D8] bg-white text-[#78716C]')}>
              <Icon className="h-[17px] w-[17px]" />
            </button>
          ))}
        </div>

        <div className="mt-3.5 flex flex-col gap-2.5">
          {filteredDossiers.map((dossier) => {
            const initials = `${dossier.firstName.charAt(0)}${dossier.lastName.charAt(0)}`.trim() || '?'
            return (
              <Card
                key={dossier.id}
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick(dossier)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleCardClick(dossier) } }}
                className={cn('rounded-xl border-[#E7E0D8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-150 ease-out hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9F8170] active:scale-[0.99]', dossier.status === 'rejete' && 'opacity-85')}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={cn('flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-base font-bold', dossier.status === 'rejete' ? 'bg-[#F5F0EB] text-[#9F8170]' : 'bg-[#9F8170] text-white')}>{initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('truncate text-sm font-bold', soleilMode && 'text-base')}>{dossier.firstName} {dossier.lastName}</span>
                      <Badge variant="secondary" className="shrink-0 rounded-md bg-[#F5F0EB] px-1.5 py-0.5 text-[10px] font-medium text-[#78716C]">{ACTOR_TYPE_LABELS[dossier.actorType]}</Badge>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-[#78716C]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{dossier.zone || 'Zone non renseignée'}</span>
                    </div>
                    {dossier.status === 'rejete' && <p className="mt-1 truncate text-[11px] text-red-600">Motif : {dossier.rejectionReason || 'Non précisé'}</p>}
                  </div>
                  <Badge className={cn('shrink-0 rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold', statusStyle(dossier.status))}>{statusLabel(dossier.status)}</Badge>
                </CardContent>
                {dossier.status === 'rejete' && (
                  <div className="flex gap-2 border-t border-[#E7E0D8] px-3 pb-3 pt-2">
                    <Button type="button" variant="outline" size="sm" onClick={(event) => handleCorrect(event, dossier)} className="h-8 gap-1 border-[#9F8170] text-xs text-[#9F8170]">Corriger</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={(event) => handleDelete(event, dossier)} className="h-8 gap-1 text-xs text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Supprimer</Button>
                  </div>
                )}
              </Card>
            )
          })}
          {filteredDossiers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileEmptyStateIcon />
              <p className={cn('mt-3 text-sm text-[#78716C]', soleilMode && 'text-base')}>{searchQuery || activeType !== 'tous' ? 'Aucun dossier trouvé' : 'Aucun dossier à suivre'}</p>
              {(searchQuery || activeType !== 'tous') && <button type="button" onClick={() => { setSearchQuery(''); setActiveType('tous') }} className="mt-2 text-xs font-semibold text-[#9F8170]">Réinitialiser les filtres</button>}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function FileEmptyStateIcon() {
  return <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F0EB] text-[#9F8170]"><CheckCircle2 className="h-6 w-6" /></span>
}
