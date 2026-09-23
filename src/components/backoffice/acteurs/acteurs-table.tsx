'use client'

// Tableau des acteurs + pagination + bandeau « charger plus » de l'écran
// Acteurs back-office (DET-001 tranche 9, MODE-995) — JSX verbatim depuis
// bo-acteurs-screen.tsx (carte table, ligne d'état vide, pagination, bandeau
// serveur). La sélection en masse (bulk actions) reste dans l'orchestrateur.

import type { Dispatch, SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  PlayCircle,
  User,
} from 'lucide-react'
import {
  ACTOR_TYPE_LABELS,
  ACTOR_TYPE_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/lib/stores/backoffice-store'
import { MARCHAND_CATEGORIES_META, type MarchandCategorie } from '@/lib/marchand-categories'
import { ITEMS_PER_PAGE } from '@/lib/backoffice/acteurs-logic'
import type { BoActor } from '@/lib/backoffice/bo-models'

interface ActeursTableProps {
  isDark: boolean
  isAllSelected: boolean
  toggleSelectAll: () => void
  paginatedActors: BoActor[]
  selectedActors: Set<string>
  toggleSelectActor: (id: string) => void
  hasActiveFilters: boolean
  resetFilters: () => void
  currentPage: number
  setCurrentPage: Dispatch<SetStateAction<number>>
  totalPages: number
  filteredActors: BoActor[]
  actors: BoActor[]
  actorsTotal: number
  loading: boolean
  fetchMoreActors: () => void
  handleViewActor: (actor: BoActor) => void
  handleSuspend: (actor: BoActor) => void
  handleReactivate: (actor: BoActor) => void
}

export function ActeursTable({
  isDark,
  isAllSelected,
  toggleSelectAll,
  paginatedActors,
  selectedActors,
  toggleSelectActor,
  hasActiveFilters,
  resetFilters,
  currentPage,
  setCurrentPage,
  totalPages,
  filteredActors,
  actors,
  actorsTotal,
  loading,
  fetchMoreActors,
  handleViewActor,
  handleSuspend,
  handleReactivate,
}: ActeursTableProps) {
  return (
      <Card className={isDark ? 'bg-slate-800 border-slate-700' : ''}>
        <CardContent className="p-0">
          <div className="max-h-[620px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-700/50' : 'bg-gray-50'} border-b`}>
                <tr>
                  <th className="w-10 px-3 py-3 text-left">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tout"
                      className="relative after:absolute after:-inset-3 after:content-['']"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    ID
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Nom complet
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Type
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Zone
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Téléphone
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Identificateur
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Statut
                  </th>
                  <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
                {paginatedActors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <User className="size-8 opacity-30" />
                        {hasActiveFilters ? (
                          <>
                            <p className="font-medium">Aucun acteur ne correspond à vos filtres</p>
                            <p className="text-xs">Essayez de modifier vos critères de recherche.</p>
                          </>
                        ) : (
                          <p>Aucun acteur enregistré</p>
                        )}
                        {hasActiveFilters && (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={resetFilters}
                          >
                            Réinitialiser les filtres
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedActors.map((actor) => {
                    const isSelected = selectedActors.has(actor.id)
                    return (
                      <tr
                        key={actor.id}
                        className={`${
                          isSelected
                            ? 'bg-amber-500/10'
                            : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50/80'
                        } transition-colors`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectActor(actor.id)}
                            aria-label={`Sélectionner ${actor.firstName} ${actor.lastName}`}
                            className="relative after:absolute after:-inset-3 after:content-['']"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`font-mono text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {actor.actorId}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center size-7 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'} text-xs font-semibold shrink-0`}>
                              {actor.firstName.charAt(0)}
                              {actor.lastName.charAt(0)}
                            </div>
                            <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                              {actor.firstName} {actor.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{(() => { const Icon = ACTOR_TYPE_ICONS[actor.type]; return Icon ? <Icon className="h-4 w-4" /> : null })()}</span>
                            <span className="text-xs text-muted-foreground">
                              {ACTOR_TYPE_LABELS[actor.type]}
                            </span>
                            {actor.categorieMarchand && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MARCHAND_CATEGORIES_META[actor.categorieMarchand as MarchandCategorie]?.badgeClass ?? 'bg-slate-100 text-slate-700'}`}>
                                {MARCHAND_CATEGORIES_META[actor.categorieMarchand as MarchandCategorie]?.label ?? actor.categorieMarchand}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-muted-foreground">
                            {actor.zone}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-muted-foreground">
                            {actor.phone}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-muted-foreground">
                            {actor.identificateurName || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_COLORS[actor.status] || (isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-800')
                            }`}
                          >
                            {STATUS_LABELS[actor.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleViewActor(actor)}
                              title="Voir les détails"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {actor.status === 'actif' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => handleSuspend(actor)}
                                title="Suspendre cet acteur"
                              >
                                <Pause className="size-3.5" />
                              </Button>
                            )}
                            {actor.status === 'suspendu' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleReactivate(actor)}
                                title="Réactiver cet acteur"
                              >
                                <PlayCircle className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ===== PAGINATION ===== */}
          {filteredActors.length > 0 && (
            <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 ${isDark ? 'bg-slate-800/50' : 'bg-gray-50/50'}`}>
              <p className="text-xs text-muted-foreground">
                Affichage de{' '}
                <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> à{' '}
                <strong>
                  {Math.min(
                    currentPage * ITEMS_PER_PAGE,
                    filteredActors.length
                  )}
                </strong>{' '}
                sur <strong>{filteredActors.length}</strong> résultat(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-3.5 mr-1" />
                  Précédent
                </Button>
                <span className={`text-xs font-medium px-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Suivant
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* More records exist on the server than are currently loaded */}
          {actors.length < actorsTotal && (
            <div className={`flex items-center justify-between gap-3 border-t px-4 py-3 text-xs ${isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-gray-50/50 text-slate-500'}`}>
              <span>{actors.length} acteurs chargés sur {actorsTotal} au total</span>
              <Button size="sm" variant="outline" disabled={loading} onClick={() => fetchMoreActors()}>
                Charger plus
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

  )
}
