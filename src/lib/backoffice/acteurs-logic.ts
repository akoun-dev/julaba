// Logique pure de l'écran Acteurs back-office (DET-001 tranche 9, MODE-995) :
// zones distinctes, filtrage multi-critères, compteurs par type, pagination,
// export CSV. Corps extraits VERBATIM de bo-acteurs-screen.tsx — seules les
// déclarations deviennent export. Comportements historiques figés par tests
// (src/lib/__tests__/acteurs-logic.test.ts), dont la recherche sur le
// téléphone (non lowercasée, contrairement aux 4 autres champs).

import { ACTOR_TYPE_LABELS, STATUS_LABELS } from '@/lib/backoffice/bo-sidebar'
import type { BoActor } from '@/lib/backoffice/bo-models'

export const ITEMS_PER_PAGE = 15

export type ActorTypeFilter = 'tous' | 'marchand' | 'producteur' | 'cooperatif'
export type ActorStatusFilter = 'tous' | 'actif' | 'suspendu' | 'en_attente' | 'rejete'

/** Zones distinctes, triées alphabétiquement (corps du useMemo zones verbatim). */
export function extractZones(actors: { zone: string }[]): string[] {
    const zoneSet = new Set(actors.map((a) => a.zone))
    return Array.from(zoneSet).sort()
}

/** Filtrage verbatim : recherche sur 5 champs (le téléphone n'est PAS
 * lowercasé — quirk historique figé par test), puis type, statut, zone. */
export interface ActorFilters {
  searchQuery: string
  typeFilter: ActorTypeFilter
  statusFilter: ActorStatusFilter
  zoneFilter: string
}

export function filterActors(actors: BoActor[], filters: ActorFilters): BoActor[] {
  const { searchQuery, typeFilter, statusFilter, zoneFilter } = filters
    return actors.filter((actor) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchesSearch =
          actor.firstName.toLowerCase().includes(q) ||
          actor.lastName.toLowerCase().includes(q) ||
          actor.actorId.toLowerCase().includes(q) ||
          actor.phone.includes(q) ||
          actor.zone.toLowerCase().includes(q)
        if (!matchesSearch) return false
      }

      // Type filter
      if (typeFilter !== 'tous' && actor.type !== typeFilter) return false

      // Status filter
      if (statusFilter !== 'tous' && actor.status !== statusFilter) return false

      // Zone filter
      if (zoneFilter !== 'tous' && actor.zone !== zoneFilter) return false

      return true
    })
}

export interface ActorCounts {
  total: number
  marchands: number
  producteurs: number
  cooperatives: number
}

/** Compteurs des 3 types d'acteurs (les types inconnus comptent dans total seul). */
export function computeActorCounts(actors: { type: string }[]): ActorCounts {
    return {
      total: actors.length,
      marchands: actors.filter((a) => a.type === 'marchand').length,
      producteurs: actors.filter((a) => a.type === 'producteur').length,
      cooperatives: actors.filter((a) => a.type === 'cooperatif').length,
    }
}

/** Au moins une page, même sans résultat (Math.max(1, …) verbatim).
 * Delta documenté : le récepteur `filteredActors.length` devient le
 * paramètre `filteredCount` — l'expression est inchangée. */
export function computeTotalPages(filteredCount: number): number {
  return Math.max(1, Math.ceil(filteredCount / ITEMS_PER_PAGE))
}

/** Tranche de la page courante (page au-delà de la fin -> tableau vide). */
export function paginateActors(filteredActors: BoActor[], currentPage: number): BoActor[] {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredActors.slice(start, start + ITEMS_PER_PAGE)
}

/** CSV verbatim : séparateur ';', dates fr-FR, champs optionnels vides.
 * Le téléchargement (Blob/URL/lien) reste dans l'orchestrateur. */
export function buildActorsCsv(selected: BoActor[]): string {
    const headers = [
      'ID Acteur',
      'Prénom',
      'Nom',
      'Type',
      'Téléphone',
      'Zone',
      'Statut',
      'Identificateur',
      'Validé par',
      'Date validation',
      'Date création',
    ]
    const rows = selected.map((a) => [
      a.actorId,
      a.firstName,
      a.lastName,
      ACTOR_TYPE_LABELS[a.type],
      a.phone,
      a.zone,
      STATUS_LABELS[a.status],
      a.identificateurName || '',
      a.validatedBy || '',
      a.validatedAt ? new Date(a.validatedAt).toLocaleDateString('fr-FR') : '',
      new Date(a.createdAt).toLocaleDateString('fr-FR'),
    ])
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    return csv
}
