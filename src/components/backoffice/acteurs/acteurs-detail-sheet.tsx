'use client'

// Fiche détaillée latérale (Sheet) de l'écran Acteurs back-office
// (DET-001 tranche 9, MODE-995) — JSX verbatim depuis bo-acteurs-screen.tsx :
// en-tête identité, badges type/statut, classification marchand éditable,
// grille d'infos, photo, validation, notes, actions rapides.

import type { Dispatch, SetStateAction } from 'react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Phone,
  MapPin,
  User,
  ShieldCheck,
  Calendar,
  StickyNote,
  Pause,
  PlayCircle,
} from 'lucide-react'
import {
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/lib/stores/backoffice-store'
import {
  MARCHAND_CATEGORIES,
  MARCHAND_CATEGORIES_META,
  type MarchandCategorie,
} from '@/lib/marchand-categories'
import type { BoActor } from '@/lib/backoffice/bo-models'

interface ActeursDetailSheetProps {
  showDetailSheet: boolean
  setShowDetailSheet: (open: boolean) => void
  detailActor: BoActor | null
  setDetailActor: Dispatch<SetStateAction<BoActor | null>>
  updateActorCategorie: (actorId: string, categorie: string | null) => Promise<void>
  handleSuspend: (actor: BoActor) => void
  handleReactivate: (actor: BoActor) => void
  isDark: boolean
}

export function ActeursDetailSheet({
  showDetailSheet,
  setShowDetailSheet,
  detailActor,
  setDetailActor,
  updateActorCategorie,
  handleSuspend,
  handleReactivate,
  isDark,
}: ActeursDetailSheetProps) {
  return (
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

  )
}
