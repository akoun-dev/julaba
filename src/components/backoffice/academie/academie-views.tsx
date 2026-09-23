'use client'

// Vues de contenu de l'Académie back-office (DET-001 tranche 7, MODE-993) :
// squelettes de chargement, vue cartes groupée par module, vue tableau,
// état vide — JSX verbatim depuis bo-academie-screen.tsx (contenu du
// TabsContent ; le wrapper <TabsContent> reste dans l'orchestrateur).

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChevronDown,
  Users,
  Timer,
  Eye,
  EyeOff,
  Globe,
  Pencil,
  Trash2,
  Filter,
  BookOpen,
  Plus,
} from 'lucide-react'
import {
  getTabConfig,
  getTabIcon,
  getStatusStyle,
  getDifficultyStyle,
} from './academie-parts'
import { TARGET_ROLES, type ContentItem } from '@/lib/bo-academie-data'

interface BoAcademieViewsProps {
  viewMode: 'card' | 'table'
  loading: boolean
  error: string | null
  isDark: boolean
  groupedByModule: Array<[string, ContentItem[]]>
  collapsedModules: Set<string>
  toggleModule: (name: string) => void
  filtered: ContentItem[]
  setShowPreview: (item: ContentItem | null) => void
  handleTogglePublish: (item: ContentItem) => void
  openEdit: (item: ContentItem) => void
  setDeleteTarget: (item: ContentItem | null) => void
  hasActiveFilters: boolean
  clearFilters: () => void
  openCreate: () => void
  formatDate: (d: string) => string
}

export function BoAcademieViews({
  viewMode,
  loading,
  error,
  isDark,
  groupedByModule,
  collapsedModules,
  toggleModule,
  filtered,
  setShowPreview,
  handleTogglePublish,
  openEdit,
  setDeleteTarget,
  hasActiveFilters,
  clearFilters,
  openCreate,
  formatDate,
}: BoAcademieViewsProps) {
  return (
    <>
            {/* Loading State */}
            {loading && !error && (
              viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                      <CardContent className="p-5">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </div>
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                          <div className="flex gap-3 pt-1">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Titre</TableHead>
                          <TableHead className="text-xs">Catégorie</TableHead>
                          <TableHead className="text-xs">Difficulté</TableHead>
                          <TableHead className="text-xs">Public</TableHead>
                          <TableHead className="text-xs">Statut</TableHead>
                          <TableHead className="text-xs text-right">Vues</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-3"><Skeleton className="h-4 w-48" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                            <TableCell className="py-3"><Skeleton className="h-3 w-20" /></TableCell>
                            <TableCell className="py-3"><div className="flex justify-end gap-1"><Skeleton className="h-7 w-7" /><Skeleton className="h-7 w-7" /><Skeleton className="h-7 w-7" /></div></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )
            )}

            {/* Card View — grouped by module within the active actor tab */}
            {!loading && !error && viewMode === 'card' && (
              <div className="space-y-6">
                {groupedByModule.map(([moduleName, items]) => {
                  const isCollapsed = collapsedModules.has(moduleName)
                  return (
                    <div key={moduleName}>
                      <button
                        type="button"
                        onClick={() => toggleModule(moduleName)}
                        className={`flex w-full items-center gap-2 mb-3 text-left group/module`}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${isDark ? 'text-slate-500' : 'text-gray-400'} ${isCollapsed ? '-rotate-90' : ''}`} />
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {moduleName}
                        </h3>
                        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] rounded-full">{items.length}</Badge>
                        <Separator className="flex-1 ml-2" />
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {items.map((item) => {
                            const sc = getStatusStyle(item.status, isDark)
                            const dc = getDifficultyStyle(item.difficulty, isDark)
                            return (
                              <Card key={item.id} className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm hover:shadow-md'} transition-all duration-200 group`}>
                                <CardContent className="p-5">
                                  <div className="flex flex-col gap-3">
                                    {/* Top row: badges */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                                        {getTabIcon(item.tab, isDark)}
                                         {getTabConfig(item.tab).label}
                                      </Badge>
                                      <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-medium border ${sc.className}`}>
                                        {sc.icon}
                                        <span className="ml-1">{sc.label}</span>
                                      </Badge>
                                      {dc && (
                                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 font-medium border ${dc.className}`}>
                                          {dc.icon}
                                          <span className="ml-1">{dc.label}</span>
                                        </Badge>
                                      )}
                                      {item.targetRole && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                          <Users className="h-2.5 w-2.5 mr-1" />
                                          {TARGET_ROLES.find((r) => r.value === item.targetRole)?.label ?? item.targetRole}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Title */}
                                    <h3 className={`font-semibold text-sm leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                      {item.title}
                                    </h3>

                                    {/* Excerpt */}
                                    {item.excerpt && (
                                      <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {item.excerpt}
                                      </p>
                                    )}

                                    {/* Meta row */}
                                    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                      {item.duration && (
                                        <span className="flex items-center gap-1">
                                          <Timer className="h-3 w-3" />
                                          {item.duration}
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        {item.views.toLocaleString('fr-FR')}
                                      </span>
                                      <span>{formatDate(item.createdAt)}</span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-1 pt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 px-2 text-xs gap-1.5"
                                        onClick={() => setShowPreview(item)}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Aperçu
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleTogglePublish(item)}
                                        title={item.status === 'publie' ? 'Dépublier' : 'Publier'}
                                      >
                                        {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => openEdit(item)}
                                        title="Modifier"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm"
                                        className={`h-8 w-8 p-0 text-red-500 hover:text-red-700 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
                                        onClick={() => setDeleteTarget(item)}
                                        title="Supprimer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Table View */}
            {!loading && !error && viewMode === 'table' && (
              <Card className={`border-0 ${isDark ? 'bg-slate-800' : ''} ${isDark ? '' : 'shadow-sm'}`}>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Titre</TableHead>
                        <TableHead className="text-xs">Catégorie</TableHead>
                        <TableHead className="text-xs">Difficulté</TableHead>
                        <TableHead className="text-xs">Public</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs text-right">Vues</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const sc = getStatusStyle(item.status, isDark)
                        const dc = getDifficultyStyle(item.difficulty, isDark)
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="py-3">
                              <div>
                                <p className={`text-sm font-medium truncate max-w-[250px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
                                {item.duration && (
                                  <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                    <Timer className="h-3 w-3" />{item.duration}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{item.category || '—'}</Badge>
                            </TableCell>
                            <TableCell className="py-3">
                              {dc ? (
                                <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium border ${dc.className}`}>
                                  {dc.icon}<span className="ml-1">{dc.label}</span>
                                </Badge>
                              ) : (
                                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {item.targetRole ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                  {TARGET_ROLES.find((r) => r.value === item.targetRole)?.label ?? item.targetRole}
                                </Badge>
                              ) : (
                                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Tous</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0 font-medium border ${sc.className}`}>
                                {sc.icon}<span className="ml-1">{sc.label}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className={`py-3 text-right text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                              {item.views.toLocaleString('fr-FR')}
                            </TableCell>
                            <TableCell className={`py-3 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                              {formatDate(item.createdAt)}
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowPreview(item)} aria-label="Aperçu">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleTogglePublish(item)} aria-label={item.status === 'publie' ? 'Dépublier' : 'Publier'}>
                                  {item.status === 'publie' ? <EyeOff className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)} aria-label="Modifier">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => setDeleteTarget(item)} aria-label="Supprimer">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                {hasActiveFilters ? (
                  <>
                    <Filter className="h-14 w-14 mx-auto mb-4 opacity-30" />
                    <p className="text-sm font-medium">Aucun résultat pour ces filtres</p>
                    <p className="text-xs mt-1">Essayez de modifier ou supprimer vos filtres</p>
                    <Button variant="link" onClick={clearFilters} className="mt-3 text-xs">
                      Effacer les filtres
                    </Button>
                  </>
                ) : (
                  <>
                    <BookOpen className="h-14 w-14 mx-auto mb-4 opacity-30" />
                    <p className="text-sm font-medium">Aucun contenu pour cet acteur</p>
                    <p className="text-xs mt-1">Créez votre premier contenu pour commencer</p>
                    <Button onClick={openCreate} className="mt-4 gap-1.5">
                      <Plus className="h-4 w-4" />
                      Créer
                    </Button>
                  </>
                )}
              </div>
            )}

    </>
  )
}
