/**
 * Libellés de temps relatifs en français pour les écrans identificateur
 * (« il y a 12 min », « hier à 10:45 », « ven. 12 sept. ») et regroupement
 * de listes par jour (AUJOURD'HUI / HIER / MER. 10 SEPT.) — contrat des
 * maquettes Accueil, Dossiers et Détail.
 *
 * Fonctions pures : `now` est injectable pour les tests.
 */

const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
] as const

const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const

const startOfDay = (ts: number): number => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

/** « à l'instant » · « il y a 12 min » · « il y a 3 h » · « hier à 10:45 » · « il y a 4 j » · « 12 sept. » */
export function formatRelativeTime(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) return ''
  const diff = now - ts
  if (diff < 60_000) return 'à l’instant'
  if (diff < 60 * 60_000) return `il y a ${Math.floor(diff / 60_000)} min`
  const today = startOfDay(now)
  if (ts >= today) return `il y a ${Math.floor(diff / (60 * 60_000))} h`
  if (ts >= today - DAY_MS) {
    const d = new Date(ts)
    return `hier à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (diff < 7 * DAY_MS) return `il y a ${Math.floor(diff / DAY_MS)} j`
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export type DayGroupKey = 'today' | 'yesterday' | 'older'

export interface DayGroupInfo {
  key: DayGroupKey
  /** En-tête de groupe : AUJOURD'HUI · HIER · MER. 10 SEPT. */
  label: string
}

/** Groupe-jour d'un timestamp pour les sections de la liste Dossiers. */
export function dayGroupOf(ts: number | undefined, now: number = Date.now()): DayGroupInfo | null {
  if (!ts) return null
  const today = startOfDay(now)
  if (ts >= today) return { key: 'today', label: 'AUJOURD’HUI' }
  if (ts >= today - DAY_MS) return { key: 'yesterday', label: 'HIER' }
  const d = new Date(ts)
  const weekday = WEEKDAYS_SHORT[d.getDay()].toUpperCase()
  return { key: 'older', label: `${weekday} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()].toUpperCase()}` }
}

/** Horodatage court absolu : « 16 sept. à 10:14 » (timeline du détail). */
export function formatAbsoluteShort(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
