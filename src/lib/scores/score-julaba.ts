/**
 * MODE-932 — Score JULABA (chantier transverse « score acteur », DET-COOP-006).
 *
 * Parité julaba-app : ScoresService.batchCooperateur + ScoreRing (seuils
 * 71/41 → haut/moyen/bas) + invariant « même source pour
 * GET /cooperatives/membres et GET /scores/me ». Ici le score est
 * DÉRIVÉ de signaux réels déjà en base (ventes, journées de marché,
 * cotisations, pot commun, profil) — AUCUNE table d'état inventée, aucun
 * événement dupliqué, aucun seed : un score qui dit toujours la vérité
 * des données du jour.
 *
 * Module PUR (aucune dépendance) — testé exhaustivement ; la lecture des
 * signaux réels vit dans scores-service.ts (serveur), la seule source
 * partagée par les deux surfaces API.
 */

// ── Seuils contractuels (inventaire julaba-app §4.1 Membres.tsx) ─────────

export const SEUIL_HAUT = 71
export const SEUIL_MOYEN = 41

export type NiveauPerformance = 'haut' | 'moyen' | 'bas'

/** Niveau d'un score 0–100 : ≥71 haut, ≥41 moyen, sinon bas. */
export function niveauPerformance(score: number): NiveauPerformance {
  if (score >= SEUIL_HAUT) return 'haut'
  if (score >= SEUIL_MOYEN) return 'moyen'
  return 'bas'
}

// ── Détail du score ──────────────────────────────────────────────────────

export interface LigneScore {
  /** Clé stable du signal (tests, affichage). */
  cle: string
  /** Libellé français affiché à l'écran. */
  libelle: string
  points: number
  max: number
}

export interface DetailScore {
  /** Score final 0–100 (somme des points, plafonnée). */
  score: number
  niveau: NiveauPerformance
  detail: LigneScore[]
}

/** Paliers réutilisables : la dernière borne atteinte donne les points. */
function pointsParPaliers(valeur: number, paliers: ReadonlyArray<readonly [min: number, points: number]>): number {
  let points = 0
  for (const [min, p] of paliers) {
    if (valeur >= min) points = p
  }
  return points
}

// ── Score MARCHAND (membre coopératif) ───────────────────────────────────

export interface SignalMarchand {
  /** Ventes des 30 derniers jours (legacy_sales — source de vérité caisse). */
  ventes30j: number
  /** Journées de marché ouvertes des 30 derniers jours (merchant_market_sessions). */
  journees30j: number
  /** Cotisation coopérative validée (cooperative_transactions, trésorerie). */
  cotisationValidee: boolean
  /** Apports au pot commun des 30 derniers jours (cooperative_stock_mouvements). */
  apports30j: number
  /** Profil marchand renseigné (merchants.first_name / last_name / phone). */
  profil: { prenom: boolean; nom: boolean; telephone: boolean }
}

export const MAX_MARCHAND = { ventes: 40, journees: 20, cotisation: 15, apports: 10, profil: 15 } as const

const PALIERS_VENTES = [[1, 10], [5, 25], [15, 40]] as const
const PALIERS_JOURNEES = [[1, 8], [5, 14], [15, 20]] as const
const PALIERS_APPORTS = [[1, 5], [3, 10]] as const

/** Score d'un marchand : activité réelle + engagement coopératif + profil. */
export function calculerScoreMarchand(s: SignalMarchand): DetailScore {
  const ventes = pointsParPaliers(s.ventes30j, PALIERS_VENTES)
  const journees = pointsParPaliers(s.journees30j, PALIERS_JOURNEES)
  const cotisation = s.cotisationValidee ? MAX_MARCHAND.cotisation : 0
  const apports = pointsParPaliers(s.apports30j, PALIERS_APPORTS)
  const profil =
    (s.profil.prenom ? 5 : 0) + (s.profil.nom ? 5 : 0) + (s.profil.telephone ? 5 : 0)

  const detail: LigneScore[] = [
    { cle: 'ventes', libelle: 'Ventes des 30 derniers jours', points: ventes, max: MAX_MARCHAND.ventes },
    { cle: 'journees', libelle: 'Journées de marché ouvertes', points: journees, max: MAX_MARCHAND.journees },
    { cle: 'cotisation', libelle: 'Cotisation à jour', points: cotisation, max: MAX_MARCHAND.cotisation },
    { cle: 'apports', libelle: 'Apports au pot commun', points: apports, max: MAX_MARCHAND.apports },
    { cle: 'profil', libelle: 'Profil renseigné', points: profil, max: MAX_MARCHAND.profil },
  ]

  const score = Math.min(100, Math.max(0, detail.reduce((acc, l) => acc + l.points, 0)))
  return { score, niveau: niveauPerformance(score), detail }
}

// ── Score COOPÉRATEUR (président) ────────────────────────────────────────

export interface SignalCooperateur {
  /** Membres ACTIFS de la coopérative (membres_count de julaba-app). */
  membresActifs: number
  /** Besoins traités (statut ≠ en_attente — besoins_traites de julaba-app). */
  besoinsTraites: number
  /** Cotisations validées en trésorerie. */
  cotisationsValidees: number
  /** Mouvements du pot commun des 30 derniers jours (apports + distributions). */
  mouvementsPotCommun30j: number
}

export const MAX_COOPERATEUR = { membres: 40, besoins: 30, cotisations: 15, potCommun: 15 } as const

const PALIERS_MEMBRES = [[1, 15], [3, 25], [6, 40]] as const
const PALIERS_BESOINS = [[1, 10], [3, 20], [6, 30]] as const
const PALIERS_POT = [[1, 8], [4, 15]] as const

/** Score du président : la même métrique que julaba-app (membres_count +
 * besoins_traites) complétée par la trésorerie et l'animation du pot commun. */
export function calculerScoreCooperateur(s: SignalCooperateur): DetailScore {
  const membres = pointsParPaliers(s.membresActifs, PALIERS_MEMBRES)
  const besoins = pointsParPaliers(s.besoinsTraites, PALIERS_BESOINS)
  const cotisations = s.cotisationsValidees > 0 ? MAX_COOPERATEUR.cotisations : 0
  const pot = pointsParPaliers(s.mouvementsPotCommun30j, PALIERS_POT)

  const detail: LigneScore[] = [
    { cle: 'membres', libelle: 'Membres actifs', points: membres, max: MAX_COOPERATEUR.membres },
    { cle: 'besoins', libelle: 'Besoins traités', points: besoins, max: MAX_COOPERATEUR.besoins },
    { cle: 'cotisations', libelle: 'Cotisations encaissées', points: cotisations, max: MAX_COOPERATEUR.cotisations },
    { cle: 'pot_commun', libelle: 'Pot commun animé', points: pot, max: MAX_COOPERATEUR.potCommun },
  ]

  const score = Math.min(100, Math.max(0, detail.reduce((acc, l) => acc + l.points, 0)))
  return { score, niveau: niveauPerformance(score), detail }
}
