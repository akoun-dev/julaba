'use client'

// Barre d'onglets acteurs + actions + filtres de l'Académie back-office
// (DET-001 tranche 7, MODE-993) — JSX verbatim ; le wrapper <Tabs> et le
// onValueChange (changement d'acteur + reset des filtres) restent dans
// l'orchestrateur.

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  BookOpen,
  Filter,
  Sparkles,
  X,
  LayoutGrid,
  LayoutList,
  Plus,
} from 'lucide-react'
import { ACTOR_TABS, TAB_CONFIG } from './academie-parts'

interface BoAcademieToolbarProps {
  actorCounts: Record<string, number>
  openCreate: () => void
  isDark: boolean
  searchQuery: string
  setSearchQuery: (v: string) => void
  typeFilter: string
  setTypeFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  difficultyFilter: string
  setDifficultyFilter: (v: string) => void
  hasActiveFilters: boolean
  clearFilters: () => void
  viewMode: 'card' | 'table'
  setViewMode: (v: 'card' | 'table') => void
}

export function BoAcademieToolbar({
  actorCounts,
  openCreate,
  isDark,
  searchQuery,
  setSearchQuery,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  difficultyFilter,
  setDifficultyFilter,
  hasActiveFilters,
  clearFilters,
  viewMode,
  setViewMode,
}: BoAcademieToolbarProps) {
  return (
    <>
          {/* Actor tab bar + Actions row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList className="flex-wrap h-auto">
              {ACTOR_TABS.map((actor) => (
                <TabsTrigger key={actor.value} value={actor.value} className="gap-1.5">
                  {actor.icon}
                  <span>{actor.label}</span>
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] rounded-full">{actorCounts[actor.value] ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            <Button onClick={openCreate} className={`whitespace-nowrap ${isDark ? '' : 'shadow-sm'}`}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau contenu
            </Button>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <Input
                placeholder="Rechercher par titre, module, auteur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les types</SelectItem>
                  {(['tutoriels', 'faq', 'articles'] as const).map((tab) => (
                    <SelectItem key={tab} value={tab}>{TAB_CONFIG[tab].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les statuts</SelectItem>
                  <SelectItem value="publie">Publié</SelectItem>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="archive">Archivé</SelectItem>
                </SelectContent>
              </Select>

              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-40">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Difficulté" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Toutes</SelectItem>
                  <SelectItem value="debutant">Débutant</SelectItem>
                  <SelectItem value="intermediaire">Intermédiaire</SelectItem>
                  <SelectItem value="avance">Avancé</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Effacer
                </Button>
              )}
            </div>

            <div className={`flex border rounded-md p-0.5 ml-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm" className="h-9 w-9 p-0"
                onClick={() => setViewMode('card')}
                aria-label="Affichage en cartes"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm" className="h-9 w-9 p-0"
                onClick={() => setViewMode('table')}
                aria-label="Affichage en tableau"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

    </>
  )
}
