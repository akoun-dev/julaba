'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Search, Store, Wheat, Handshake } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type Dossier, type DossierStatus, type ActorType } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

type FilterKey = 'tous' | DossierStatus
type TypeFilter = 'all' | ActorType

const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const TYPE_FILTERS: { key: TypeFilter; icon: typeof Store; label: string }[] = [
  { key: 'marchand', icon: Store, label: 'Marchand' },
  { key: 'producteur', icon: Wheat, label: 'Producteur' },
  { key: 'cooperative', icon: Handshake, label: 'Coopérative' },
]

function formatDate(ts: number): string {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month} à ${hours}:${mins}`
}

function getStatusDot(status: DossierStatus): string {
  switch (status) {
    case 'en_attente': return 'bg-yellow-400'
    case 'valide': return 'bg-green-500'
    case 'rejete': return 'bg-red-500'
    default: return 'bg-gray-300'
  }
}

// Status pills only — brouillons have their own dedicated screen
// (ident-brouillons-screen) with draft-specific actions (reprendre,
// % complet), so they're intentionally excluded here.
const FILTERS: { key: FilterKey; label: string; status?: DossierStatus }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'en_attente', label: 'En attente', status: 'en_attente' },
  { key: 'valide', label: 'Validés', status: 'valide' },
  { key: 'rejete', label: 'Rejetés', status: 'rejete' },
]

export function IdentDossiersScreen() {
  const { goBack, navigate, soleilMode } = useAppStore()
  const { dossiers, setCurrentDraftId, deleteDossier, dossiersFilterIntent, setDossiersFilterIntent } = useIdentificateurStore()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  // Read the Home screen's shortcut intent once, then clear it so a later
  // visit via the bottom bar starts back on "Tous".
  const [activeFilter, setActiveFilter] = useState<FilterKey>(
    () => dossiersFilterIntent ?? 'tous'
  )
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Consume the Home screen's shortcut intent once so a later visit via
  // the bottom bar starts back on "Tous".
  useEffect(() => {
    if (dossiersFilterIntent) setDossiersFilterIntent(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const textClass = soleilMode ? 'text-black' : ''
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Count by status (non-brouillon only)
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { tous: 0, en_attente: 0, valide: 0, rejete: 0, brouillon: 0 }
    dossiers.forEach((d) => {
      if (d.status === 'brouillon') return
      c.tous++
      if (c[d.status] !== undefined) c[d.status]++
    })
    return c
  }, [dossiers])

  // Filter dossiers
  const filteredDossiers = useMemo(() => {
    let result = dossiers.filter((d) => d.status !== 'brouillon')

    if (activeFilter !== 'tous') {
      result = result.filter((d) => d.status === activeFilter)
    }

    if (typeFilter !== 'all') {
      result = result.filter((d) => d.actorType === typeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        (d.firstName + ' ' + d.lastName).toLowerCase().includes(q) ||
        d.phone.toLowerCase().includes(q) ||
        d.dossierNumber.toLowerCase().includes(q) ||
        d.zone.toLowerCase().includes(q)
      )
    }

    return result
  }, [dossiers, activeFilter, typeFilter, searchQuery])

  // Group by status
  const grouped = useMemo(() => {
    const groups: { key: DossierStatus; label: string; items: Dossier[] }[] = [
      { key: 'en_attente', label: 'EN ATTENTE DE VALIDATION', items: [] },
      { key: 'valide', label: 'VALIDÉS', items: [] },
      { key: 'rejete', label: 'REJETÉS', items: [] },
    ]
    filteredDossiers.forEach((d) => {
      const group = groups.find((g) => g.key === d.status)
      if (group) group.items.push(d)
    })
    return groups.filter((g) => g.items.length > 0)
  }, [filteredDossiers])

  const handleCardClick = (dossier: Dossier) => {
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleCorrige = (e: React.MouseEvent, dossier: Dossier) => {
    e.stopPropagation()
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleSupprime = (e: React.MouseEvent, dossier: Dossier) => {
    e.stopPropagation()
    deleteDossier(dossier.id)
    toast({
      title: 'Dossier supprimé',
      description: `${dossier.dossierNumber} a été supprimé.`,
    })
  }

  return (
    <div className="screen-enter pb-24">
      {/* Top bar */}
      <div
        className="px-4 py-3 flex items-center gap-3 rounded-b-2xl"
        style={{ backgroundColor: IDENT_COLOR }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:text-white hover:bg-white/10 h-9 w-9"
          onClick={goBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-bold text-base tracking-wider">
          MES DOSSIERS
        </span>
      </div>

      {/* Search bar */}
      <div className="px-4 mt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Nom, téléphone, zone, n° dossier..."
            className="pl-9 h-11 rounded-xl bg-muted border-0 focus-visible:ring-1 focus-visible:ring-[#9F8170]/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Status filter pills */}
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key
          const count = counts[filter.key]
          return (
            <button
              key={filter.key}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                isActive ? 'text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              style={isActive ? { backgroundColor: IDENT_COLOR } : undefined}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-[10px] font-bold px-1.5',
                  isActive ? 'bg-white/30 text-white' : 'bg-background text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Type filter chips (secondary) */}
      <div className="px-4 mt-2.5 flex gap-2">
        {TYPE_FILTERS.map((tf) => {
          const isActive = typeFilter === tf.key
          return (
            <button
              key={tf.key}
              type="button"
              onClick={() => setTypeFilter(isActive ? 'all' : tf.key)}
              aria-label={tf.label}
              aria-pressed={isActive}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
              style={
                isActive
                  ? { backgroundColor: `${IDENT_COLOR}15`, border: `1.5px solid ${IDENT_COLOR}` }
                  : { backgroundColor: 'transparent', border: '1.5px solid var(--border)' }
              }
            >
              <tf.icon className="w-[18px] h-[18px]" style={{ color: isActive ? IDENT_COLOR : '#78716C' }} />
            </button>
          )
        })}
      </div>

      {/* Grouped dossier lists */}
      <div className="px-4 mt-4 space-y-4">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
            <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
              {searchQuery || typeFilter !== 'all' ? 'Aucun dossier trouvé' : 'Aucun dossier à afficher'}
            </p>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-2 h-2 rounded-full', getStatusDot(group.key))} />
              <span className={cn('text-xs font-bold uppercase tracking-wider', textClass)}>
                {group.label} ({group.items.length})
              </span>
            </div>

            <div className="space-y-2">
              {group.items.map((dossier) => (
                <Card
                  key={dossier.id}
                  className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
                  onClick={() => handleCardClick(dossier)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {dossier.photoBase64 ? (
                        <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 border-2" style={{ borderColor: `${IDENT_COLOR}40` }}>
                          <img src={dossier.photoBase64} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base"
                          style={{ backgroundColor: IDENT_COLOR }}
                        >
                          {(dossier.firstName || '?').charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn('font-bold text-sm truncate', textClass, soleilMode && 'text-base')}>
                            {dossier.firstName} {dossier.lastName}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                            style={{ borderColor: `${IDENT_COLOR}50`, color: IDENT_COLOR }}
                          >
                            {ACTOR_TYPE_LABELS[dossier.actorType] || dossier.actorType}
                          </Badge>
                        </div>

                        {dossier.zone && (
                          <p className={cn('text-xs text-muted-foreground mt-0.5', smallTextClass)}>
                            {dossier.zone}
                          </p>
                        )}

                        {dossier.submittedAt && (
                          <p className={cn('text-[11px] text-muted-foreground mt-0.5', soleilMode && 'text-xs')}>
                            Soumis le {formatDate(dossier.submittedAt)}
                          </p>
                        )}

                        {dossier.status === 'en_attente' && (
                          <p className={cn('text-xs font-medium mt-1', soleilMode && 'text-sm')} style={{ color: '#ca8a04' }}>
                            En attente BackOffice
                          </p>
                        )}
                        {dossier.status === 'valide' && dossier.validatedAt && (
                          <p className={cn('text-xs font-medium mt-1 text-green-600', soleilMode && 'text-sm')}>
                            Validé le {formatDate(dossier.validatedAt)}
                          </p>
                        )}
                        {dossier.status === 'rejete' && (
                          <>
                            <p className={cn('text-xs font-medium mt-1 text-red-500', soleilMode && 'text-sm')}>
                              Rejeté : {dossier.rejectionReason || 'Raison non spécifiée'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
                                onClick={(e) => handleCorrige(e, dossier)}
                              >
                                Corriger
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50"
                                onClick={(e) => handleSupprime(e, dossier)}
                              >
                                Supprimer
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
