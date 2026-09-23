// Logique pure de l'écran Missions back-office (DET-001 tranche 11, MODE-1000) :
// options de filtrage, styles de badge, formatage de dates, progression vers
// l'objectif, filtrage des identificateurs affectables, toggle de sélection,
// pré-coche d'équipe, validité du formulaire de création, payload de création,
// filtrage par statut, résumé et compteur d'onglet. Corps extraits VERBATIM de
// bo-missions-screen.tsx — seules les déclarations deviennent export.
// Comportements historiques figés par tests
// (src/lib/__tests__/missions-logic.test.ts), dont « parseInt || 0 » sur
// l'objectif (préfixe numérique accepté : « 12abc » -> 12) et la moyenne de
// progression calculée uniquement sur les missions à objectif > 0.

import type { BoMission, BoIdentificateur } from '@/lib/backoffice/bo-models'

export type MissionStatusFilter = 'toutes' | BoMission['status']

export const STATUS_FILTER_OPTIONS: { value: MissionStatusFilter; label: string }[] = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'terminee', label: 'Terminées' },
  { value: 'suspendue', label: 'Suspendues' },
]

/** Styles de badge par statut (fallback clair/sombre géré par les composants). */
export const STATUS_BADGE_STYLES: Record<string, string> = {
  en_cours: 'bg-blue-100 text-blue-800 border-blue-200',
  terminee: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  suspendue: 'bg-amber-100 text-amber-800 border-amber-200',
}

/** Date fr-FR : jour 2 chiffres / mois court / année ; une date invalide
 * ne lève pas — « Invalid Date » (le catch ne protège que les lancements). */
export function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

/** Progression vers l'objectif en %, plafonnée à 100, 0 si objectif nul.
 * Delta documenté : la formule inline des deux dialogs
 * (« mission.targetCount > 0 ? Math.min((mission.currentCount /
 * mission.targetCount) * 100, 100) : 0 » et son miroir detail_count)
 * devient (currentCount, targetCount) — expression inchangée. */
export function computeMissionProgress(currentCount: number, targetCount: number): number {
  return targetCount > 0 ? Math.min((currentCount / targetCount) * 100, 100) : 0
}

/** Filtrage verbatim du multi-select du dialog de création : seuls les
 * agents ACTIFS sont affectables ; la recherche porte sur le nom OU la
 * zone, lowercasés ; une zone absente passe par (zone || ''). */
export function filterAssignableIdentificateurs(
  identificateurs: BoIdentificateur[],
  identSearch: string
): BoIdentificateur[] {
    // Seuls les agents actifs sont affectables à une mission.
    const active = identificateurs.filter((i) => i.isActive)
    const q = identSearch.trim().toLowerCase()
    if (!q) return active
    return active.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.zone || '').toLowerCase().includes(q)
    )
}

/** Toggle immuable d'un id dans un Set (corps verbatim de l'updater
 * setSelectedIds — indentation d'origine conservée). */
export function toggleSetMember(prev: Set<string>, id: string): Set<string> {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
}

/** Pré-coche d'équipe : seuls les membres ACTIFS de l'équipe sont
 * pré-cochés (les inactifs jamais). Delta documenté : le récepteur
 * `value` devient le paramètre `teamId` — expression inchangée. */
export function teamMemberIdsToPrecheck(identificateurs: BoIdentificateur[], teamId: string): string[] {
  return identificateurs.filter((i) => i.teamId === teamId && i.isActive).map((i) => i.id)
}

/** Validité du formulaire de création (expression verbatim de canSubmit).
 * Delta documenté : les récepteurs deviennent les champs de `fields`. */
export interface CreateMissionFields {
  title: string
  zone: string
  targetCount: string
  startDate: string
}

export function canSubmitMission(fields: CreateMissionFields, submitting: boolean): boolean {
  return (
    fields.title.trim().length > 0 &&
    fields.zone.length > 0 &&
    fields.targetCount.length > 0 &&
    fields.startDate.length > 0 &&
    !submitting
  )
}

/** Payload de création (objet verbatim de createMission). Quirks figés
 * par test : parseInt(targetCount) || 0 (« 12abc » -> 12, « abc » -> 0) ;
 * endDate/teamId vides -> undefined (clé présente, valeur undefined). */
export interface CreateMissionInput {
  title: string
  description: string
  zone: string
  targetCount: string
  startDate: string
  endDate: string
  teamId: string
}

export function buildMissionPayload(fields: CreateMissionInput, selectedIds: Set<string>) {
  return {
    title: fields.title.trim(),
    description: fields.description.trim(),
    zone: fields.zone,
    targetCount: parseInt(fields.targetCount) || 0,
    startDate: fields.startDate,
    endDate: fields.endDate || undefined,
    teamId: fields.teamId || undefined,
    identificateurIds: Array.from(selectedIds),
  }
}

/** Filtrage par statut : « toutes » court-circuite (même référence). */
export function filterMissionsByStatus(missions: BoMission[], statusFilter: MissionStatusFilter): BoMission[] {
  return statusFilter === 'toutes'
    ? missions
    : missions.filter((m) => m.status === statusFilter)
}

export interface MissionSummary {
  total: number
  enCours: number
  avgProgress: number
}

/** Résumé verbatim du useMemo : total, missions en cours, moyenne de
 * progression calculée UNIQUEMENT sur les missions à objectif > 0,
 * arrondie Math.round. */
export function computeMissionSummary(missions: BoMission[]): MissionSummary {
    const total = missions.length
    const enCours = missions.filter((m) => m.status === 'en_cours').length
    const missionsWithProgress = missions.filter((m) => m.targetCount > 0)
    const avgProgress =
      missionsWithProgress.length > 0
        ? Math.round(
            missionsWithProgress.reduce(
              (acc, m) => acc + (m.currentCount / m.targetCount) * 100,
              0
            ) / missionsWithProgress.length
          )
        : 0
    return { total, enCours, avgProgress }
}

/** Compteur d'onglet : « toutes » compte tout (expression verbatim du
 * JSX, delta documenté : `opt.value` devient `value`). */
export function missionTabCount(missions: BoMission[], value: MissionStatusFilter): number {
  return value === 'toutes'
    ? missions.length
    : missions.filter((m) => m.status === value).length
}
