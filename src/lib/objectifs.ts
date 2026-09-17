/**
 * Objectifs mensuels pilotés depuis le back-office.
 *
 * Un objectif = quantité de dossiers attendue d'un identificateur ou d'une
 * zone entière sur un mois donné. C'est la source de vérité de la « mission
 * mensuelle » affichée sur l'app identificateur : le BO fixe, le terrain
 * suit (GET /api/identificateur/mission).
 *
 * Fonctions pures, sans dépendance — testées par src/lib/__tests__/objectifs.test.ts
 */

export const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

export type ObjectifScope = 'identificateur' | 'zone'

export interface ObjectifKey {
  month: number // 0-11
  year: number
}

/**
 * Normalise l'identifiant cible d'une zone : casse et accents retirés
 * (« Adjamé » et « Adjame » se rapprochent — les enrôlements stockent la
 * zone saisie par l'agent, pas toujours accentuée).
 */
export function normalizeZoneKey(zone: string): string {
  return zone
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Nombre de jours du mois (year, month 0-11). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Fraction du mois écoulée à `now` (0..1) : jours passés / jours du mois,
 * le jour en cours comptant comme entamé (min 1/30 dès le 1er à 00h).
 */
export function monthElapsedFraction(objectif: ObjectifKey, now: Date): number {
  const total = daysInMonth(objectif.year, objectif.month)
  const start = new Date(objectif.year, objectif.month, 1).getTime()
  const end = new Date(objectif.year, objectif.month + 1, 1).getTime()
  if (now.getTime() <= start) return 0
  if (now.getTime() >= end) return 1
  const day = now.getDate() // 1..total
  return Math.min(1, day / total)
}

/** Dossiers attendus à date (rythme linéaire sur le mois, plafonné à target). */
export function expectedToDate(target: number, objectif: ObjectifKey, now: Date): number {
  if (target <= 0) return 0
  return Math.min(target, Math.ceil(target * monthElapsedFraction(objectif, now)))
}

export type ObjectifStatus = 'a_venir' | 'en_avance' | 'conforme' | 'en_retard' | 'atteint'

/**
 * Statut de l'objectif à `now` :
 *  - a_venir  : le mois visé n'a pas commencé
 *  - atteint  : current >= target
 *  - en_avance: current >= attendu à date
 *  - conforme : current >= attendu à date - tolérance 15 % (pour éviter
 *               les statuts « en retard » au rythme près)
 *  - en_retard: sinon
 */
export function objectifStatus(
  objectif: ObjectifKey,
  target: number,
  current: number,
  now: Date,
): ObjectifStatus {
  const start = new Date(objectif.year, objectif.month, 1).getTime()
  if (now.getTime() < start) return 'a_venir'
  if (target <= 0) return 'conforme'
  if (current >= target) return 'atteint'
  const expected = expectedToDate(target, objectif, now)
  if (current >= expected) return 'en_avance'
  if (current >= expected * 0.85) return 'conforme'
  return 'en_retard'
}

/** Pourcentage d'avancement (0..100, plafonné). */
export function objectifProgressPct(target: number, current: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

/** Dernier jour du mois visé, ex. « 30 septembre » (libellé échéance). */
export function monthDeadlineLabel(objectif: ObjectifKey): string {
  const last = daysInMonth(objectif.year, objectif.month)
  return `${last} ${MONTHS_FR[objectif.month]}`
}

/** Libellé du mois visé, ex. « septembre 2026 ». */
export function monthLabel(objectif: ObjectifKey): string {
  return `${MONTHS_FR[objectif.month]} ${objectif.year}`
}

/** Décale une clé (month, year) de `delta` mois (±). */
export function shiftObjectifKey(objectif: ObjectifKey, delta: number): ObjectifKey {
  const d = new Date(objectif.year, objectif.month + delta, 1)
  return { month: d.getMonth(), year: d.getFullYear() }
}
