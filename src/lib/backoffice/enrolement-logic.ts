// Logique pure de l'écran Enrôlement back-office (DET-001 tranche 12, MODE-1001) :
// constantes de filtrage, bornes de dates (aujourd'hui / semaine / mois),
// formatage fr-FR, extraction des zones, compteurs par statut, statistiques
// du jour, filtrage combiné statut/zone/période, pagination et construction
// de la barre de pages à ellipses. Corps extraits VERBATIM de
// bo-enrolement-screen.tsx — seules les déclarations deviennent export.
// Comportements historiques figés par tests
// (src/lib/__tests__/enrolement-logic.test.ts), dont le quirk du dimanche
// (isThisWeek pose startOfWeek = lundi SUIVANT : un dossier soumis le
// dimanche n'est jamais « cette semaine »), le rejeté sans validatedAt
// jamais compté dans les stats du jour et le tri des zones par code units
// (« Ébindi » après « Yopougon »).

import type { BoEnrolment } from '@/lib/backoffice/bo-models'

export const ITEMS_PER_PAGE = 10

export const PREDEFINED_REASONS = [
  'Photo illisible',
  'Données incomplètes',
  'GPS absent',
  'Téléphone invalide',
  'Autre',
]

export type FilterStatus = 'all' | 'en_attente' | 'valide' | 'rejete' | 'info_demandee'
export type DateRange = 'aujourdhui' | 'semaine' | 'mois' | 'tous'

export const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'valide', label: 'Validés' },
  { key: 'rejete', label: 'Rejetés' },
  { key: 'info_demandee', label: 'Info demandée' },
  { key: 'all', label: 'Tous' },
]

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'tous', label: 'Tous' },
  { value: 'aujourdhui', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'mois', label: 'Ce mois' },
]

/** Appartient au jour courant (comparaison locale année/mois/jour). */
export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** Quirk historique figé par test : startOfWeek = lundi de la semaine
 * COURANTE via (getDate() - getDay() + 1) — le dimanche (getDay() === 0)
 * la borne devient le lundi SUIVANT : un dossier soumis le dimanche
 * n'est jamais « cette semaine ». */
export function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() + 1)
  startOfWeek.setHours(0, 0, 0, 0)
  return d >= startOfWeek
}

export function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function matchesDateRange(dateStr: string, range: DateRange): boolean {
  switch (range) {
    case 'aujourdhui':
      return isToday(dateStr)
    case 'semaine':
      return isThisWeek(dateStr)
    case 'mois':
      return isThisMonth(dateStr)
    case 'tous':
    default:
      return true
  }
}

/** Date + heure fr-FR jj/mm/aaaa hh:mm. */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Zones distinctes, tri par code units (« Ébindi » après « Yopougon »).
 * Delta documenté : l'expression du useMemo devient le corps de la
 * fonction (return ajouté). */
export function extractZones(enrolments: BoEnrolment[]): string[] {
  return [...new Set(enrolments.map((e) => e.zone))].sort()
}

/** Compteurs par statut (corps verbatim du useMemo) : les 4 statuts
 * démarrent à 0 ; un statut inconnu ajouterait sa propre clé. */
export function computeStatusCounts(enrolments: BoEnrolment[]): Record<string, number> {
    const counts: Record<string, number> = {
      en_attente: 0,
      valide: 0,
      rejete: 0,
      info_demandee: 0,
    }
    for (const e of enrolments) {
      counts[e.status] = (counts[e.status] || 0) + 1
    }
    return counts
}

/** Stats du jour (corps verbatim du useMemo) : validés/rejetés datés
 * d'aujourd'hui via validatedAt ; quirk figé par test — un rejeté SANS
 * validatedAt n'est jamais compté ; taux Math.round, 0 si rien. */
export function computeTodayStats(enrolments: BoEnrolment[]): {
  validated: number
  rejected: number
  rate: number
} {
    const todayValidated = enrolments.filter(
      (e) => e.status === 'valide' && e.validatedAt && isToday(e.validatedAt)
    ).length
    const todayRejected = enrolments.filter(
      (e) => e.status === 'rejete' && e.validatedAt && isToday(e.validatedAt)
    ).length
    const totalProcessed = todayValidated + todayRejected
    const rate =
      totalProcessed > 0
        ? Math.round((todayValidated / totalProcessed) * 100)
        : 0
    return {
      validated: todayValidated,
      rejected: todayRejected,
      rate,
    }
}

/** Filtrage combiné verbatim : statut, zone, période en ET ; « all » et
 * « toutes les zones » court-circuitent, « tous » accepte toute date. */
export function filterEnrolments(
  enrolments: BoEnrolment[],
  filters: { activeFilter: FilterStatus; zoneFilter: string; dateRange: DateRange }
): BoEnrolment[] {
  const { activeFilter, zoneFilter, dateRange } = filters
    return enrolments.filter((e) => {
      // Status filter
      if (activeFilter !== 'all' && e.status !== activeFilter) return false
      // Zone filter
      if (zoneFilter !== 'all' && e.zone !== zoneFilter) return false
      // Date range filter
      if (!matchesDateRange(e.submittedAt, dateRange)) return false
      return true
    })
}

/** Au moins une page, même sans résultat (Math.max(1, ceil) verbatim).
 * Delta documenté : le récepteur `filteredEnrolments.length` devient le
 * paramètre `filteredCount`. */
export function computeTotalPages(filteredCount: number): number {
  return Math.max(1, Math.ceil(filteredCount / ITEMS_PER_PAGE))
}

/** Tranche de la page courante (page au-delà de la fin -> tableau vide). */
export function paginateEnrolments(filteredEnrolments: BoEnrolment[], currentPage: number): BoEnrolment[] {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredEnrolments.slice(start, start + ITEMS_PER_PAGE)
}

/** Pages visibles : première, dernière et voisins de la page courante,
 * ellipses entre les trous (corps verbatim de la chaîne
 * Array.from(...).filter(...).reduce(...) du JSX — delta documenté :
 * `return` ajouté, conteneur JSX retiré). */
export function buildPaginationPages(totalPages: number, currentPage: number): (number | 'ellipsis')[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first, last, and pages around current
                  if (page === 1 || page === totalPages) return true
                  if (Math.abs(page - currentPage) <= 1) return true
                  return false
                })
                .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                  if (idx > 0) {
                    const prev = arr[idx - 1]
                    if (page - prev > 1) {
                      acc.push('ellipsis')
                    }
                  }
                  acc.push(page)
                  return acc
                }, [])
}

/** Compteur d'onglet : « all » affiche le total chargé, sinon le compteur
 * du statut (0 si absent — quirk `|| 0` figé par test). Delta documenté :
 * `tab.key` devient `key`, `enrolments.length` le paramètre `total`. */
export function enrolmentTabCount(total: number, counts: Record<string, number>, key: FilterStatus): number {
  return key === 'all'
    ? total
    : counts[key] || 0
}
