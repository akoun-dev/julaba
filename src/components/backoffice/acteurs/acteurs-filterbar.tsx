'use client'

// Barre de recherche + filtres (type / statut / zone) de l'écran Acteurs
// back-office (DET-001 tranche 9, MODE-995) — JSX verbatim depuis
// bo-acteurs-screen.tsx ; le wrapper <BoFilterBar> voyage avec le bloc.

import type { ChangeEvent } from 'react'
import { Search, Hourglass, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BoFilterBar } from '../bo-ui'
import type { ActorTypeFilter, ActorStatusFilter } from '@/lib/backoffice/acteurs-logic'

interface ActeursFilterBarProps {
  searchQuery: string
  handleSearchChange: (e: ChangeEvent<HTMLInputElement>) => void
  typeFilter: ActorTypeFilter
  handleTypeFilterChange: (val: string) => void
  statusFilter: ActorStatusFilter
  handleStatusFilterChange: (val: string) => void
  zoneFilter: string
  handleZoneFilterChange: (val: string) => void
  zones: string[]
  hasActiveFilters: boolean
  resetFilters: () => void
  isDark: boolean
}

export function ActeursFilterBar({
  searchQuery,
  handleSearchChange,
  typeFilter,
  handleTypeFilterChange,
  statusFilter,
  handleStatusFilterChange,
  zoneFilter,
  handleZoneFilterChange,
  zones,
  hasActiveFilters,
  resetFilters,
  isDark,
}: ActeursFilterBarProps) {
  return (
      <BoFilterBar>
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, téléphone, ID, zone..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9 h-9"
              />
            </div>

            <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

            {/* Filters */}
            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les types</SelectItem>
                <SelectItem value="marchand">Marchand(e)s</SelectItem>
                <SelectItem value="producteur">Producteur(rice)s</SelectItem>
                <SelectItem value="cooperatif">Coopératives</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les statuts</SelectItem>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="suspendu">Suspendu</SelectItem>
                <SelectItem value="en_attente"><span className="flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> En attente</span></SelectItem>
                <SelectItem value="rejete">Rejeté</SelectItem>
              </SelectContent>
            </Select>

            <Select value={zoneFilter} onValueChange={handleZoneFilterChange}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Réinitialiser
              </Button>
            )}
      </BoFilterBar>

  )
}
