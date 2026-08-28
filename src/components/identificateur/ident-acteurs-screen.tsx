'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Search, Users, MapPin, Phone, CheckCircle2, Clock, Eye, RefreshCw, Store, Sprout, Handshake } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'
import { useIdentificateurStore, type ActorType, type DossierStatus } from '@/lib/stores/identificateur-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const IDENT_COLOR = '#9F8170'

const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  marchand: 'Marchand',
  producteur: 'Producteur',
  cooperative: 'Coopérative',
}

const ACTOR_TYPE_ICONS: Record<ActorType, typeof Store> = {
  marchand: Store,
  producteur: Sprout,
  cooperative: Handshake,
}

function formatDateShort(ts: number): string {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

function maskPhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  const masked = digits.replace(/\d{2}/g, 'XX')
  // Add spaces every 2 for display
  return masked.replace(/(.{2})/g, '$1 ').trim()
}

function getInitial(name: string): string {
  const trimmed = (name || '').trim()
  return trimmed.charAt(0).toUpperCase() || '?'
}

function getInitialBgColor(name: string): string {
  const colors = [
    `${IDENT_COLOR}25`,
    '#e0f2fe',
    '#fef3c7',
    '#d1fae5',
    '#ede9fe',
    '#fce7f3',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

type TypeFilter = 'all' | ActorType

type StatusFilter = 'all' | DossierStatus

export function IdentActeursScreen() {
  const { goBack, navigate, soleilMode } = useAppStore()
  const { dossiers, setCurrentDraftId, screenSensitive } = useIdentificateurStore()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const textClass = soleilMode ? 'text-black' : ''
  const smallTextClass = soleilMode ? 'text-sm' : 'text-xs'

  // Filter actors: only valide and en_attente (not brouillons)
  const filteredActors = useMemo(() => {
    let result = dossiers.filter(
      (d) => d.status === 'valide' || d.status === 'en_attente'
    )

    if (typeFilter !== 'all') {
      result = result.filter((d) => d.actorType === typeFilter)
    }

    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          (d.firstName + ' ' + d.lastName).toLowerCase().includes(q) ||
          d.phone.toLowerCase().includes(q) ||
          d.zone.toLowerCase().includes(q)
      )
    }

    return result
  }, [dossiers, typeFilter, statusFilter, searchQuery])

  // Stats: all non-brouillon dossiers (not affected by filters)
  const allNonBrouillon = useMemo(
    () => dossiers.filter((d) => d.status !== 'brouillon'),
    [dossiers]
  )

  const statsByType = useMemo(() => {
    const valides = dossiers.filter((d) => d.status === 'valide')
    return {
      marchand: valides.filter((d) => d.actorType === 'marchand').length,
      producteur: valides.filter((d) => d.actorType === 'producteur').length,
      cooperative: valides.filter((d) => d.actorType === 'cooperative').length,
    }
  }, [dossiers])

  const handleView = (dossier: typeof filteredActors[0]) => {
    setCurrentDraftId(dossier.id)
    navigate('ident-identification')
  }

  const handleMutation = () => {
    toast({
      title: 'Besoin de connexion internet',
      description: 'La fonctionnalité mutation nécessite une connexion internet.',
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
          MES ACTEURS IDENTIFIÉS
        </span>
      </div>

      {/* Search bar */}
      <div className="px-4 mt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone ou zone..."
            className="pl-9 h-11 rounded-xl bg-muted border-0 focus-visible:ring-1 focus-visible:ring-[#9F8170]/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter dropdowns */}
      <div className="px-4 mt-3 flex gap-2">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="h-9 rounded-lg text-xs flex-1">
            <SelectValue placeholder="Tous types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="marchand">Marchand</SelectItem>
            <SelectItem value="producteur">Producteur</SelectItem>
            <SelectItem value="cooperative">Coopérative</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 rounded-lg text-xs flex-1">
            <SelectValue placeholder="Tous statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="valide">Validé</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Counter */}
      <div className="px-4 mt-3">
        <p className={cn('text-xs text-muted-foreground font-medium', soleilMode && 'text-sm')}>
          Total : {allNonBrouillon.length} acteur{allNonBrouillon.length > 1 ? 's' : ''}
        </p>
      </div>

      {/* Actor list */}
      <div className="px-4 mt-3 space-y-2">
        {filteredActors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 size-9 text-[#9F8170]" />
            <p className={cn('text-sm text-muted-foreground', soleilMode && 'text-base')}>
              Aucun acteur trouvé
            </p>
          </div>
        ) : (
          filteredActors.map((dossier) => {
            const actorName = (dossier.firstName + ' ' + dossier.lastName).trim()
            const isValide = dossier.status === 'valide'

            return (
              <Card key={dossier.id} className="hover:shadow-md transition-all">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Photo or initial circle */}
                    {dossier.photoBase64 ? (
                      <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 border-2" style={{ borderColor: `${IDENT_COLOR}40` }}>
                        <img
                          src={dossier.photoBase64}
                          alt={actorName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base"
                        style={{
                          backgroundColor: IDENT_COLOR,
                        }}
                      >
                        {getInitial(actorName)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name + type badge */}
                      <div className="flex items-center gap-2">
                        <p className={cn('font-bold text-sm truncate', textClass, soleilMode && 'text-base')}>
                          {actorName || 'Sans nom'}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                          style={{ borderColor: `${IDENT_COLOR}50`, color: IDENT_COLOR }}
                        >
                          {ACTOR_TYPE_LABELS[dossier.actorType]}
                        </Badge>
                      </div>

                      {/* Zone */}
                      {dossier.zone && (
                        <p className={cn('text-xs text-muted-foreground mt-0.5', smallTextClass)}>
                           <MapPin className="mr-1 inline size-3" /> {dossier.zone}
                        </p>
                      )}

                      {/* Phone */}
                      {dossier.phone && (
                        <p className={cn('text-xs text-muted-foreground mt-0.5', smallTextClass)}>
                           <Phone className="mr-1 inline size-3" /> {screenSensitive ? maskPhone(dossier.phone) : dossier.phone}
                        </p>
                      )}

                      {/* Status line */}
                      <p
                        className={cn('text-xs font-medium mt-1', soleilMode && 'text-sm')}
                        style={{ color: isValide ? '#16a34a' : '#ca8a04' }}
                      >
                        {isValide ? (
                          <>
                             <CheckCircle2 className="mr-1 inline size-3" /> Validé le{' '}
                            {dossier.validatedAt ? formatDateShort(dossier.validatedAt) : '--'}
                          </>
                        ) : (
                           <><Clock className="mr-1 inline size-3" /> En attente</>
                        )}
                      </p>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 flex-1"
                          style={{ borderColor: IDENT_COLOR, color: IDENT_COLOR }}
                          onClick={() => handleView(dossier)}
                        >
                           <><Eye className="size-3.5" /> Voir</>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 flex-1 text-muted-foreground"
                          disabled
                          onClick={handleMutation}
                        >
                           <><RefreshCw className="size-3.5" /> Mutation</>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Statistiques rapides */}
      <div className="px-4 mt-6 mb-4">
        <h3 className={cn('font-semibold text-sm mb-2', textClass, soleilMode && 'text-base')}>
          Statistiques rapides
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              {(() => { const Icon = ACTOR_TYPE_ICONS.marchand; return <Icon className="mx-auto size-5 text-[#9F8170]" /> })()}
              <p className={cn('text-lg font-bold mt-1', textClass)} style={{ color: IDENT_COLOR }}>
                {statsByType.marchand}
              </p>
              <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                Marchand
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              {(() => { const Icon = ACTOR_TYPE_ICONS.producteur; return <Icon className="mx-auto size-5 text-[#9F8170]" /> })()}
              <p className={cn('text-lg font-bold mt-1', textClass)} style={{ color: IDENT_COLOR }}>
                {statsByType.producteur}
              </p>
              <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                Producteur
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              {(() => { const Icon = ACTOR_TYPE_ICONS.cooperative; return <Icon className="mx-auto size-5 text-[#9F8170]" /> })()}
              <p className={cn('text-lg font-bold mt-1', textClass)} style={{ color: IDENT_COLOR }}>
                {statsByType.cooperative}
              </p>
              <p className={cn('text-[10px] text-muted-foreground', soleilMode && 'text-xs')}>
                Coopérative
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
