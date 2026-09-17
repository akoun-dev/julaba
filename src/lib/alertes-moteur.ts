/**
 * Moteur d'alertes back-office — « proactif au lieu de consultatif ».
 *
 * Quatre règles paramétrables (seuil + activation) évaluées contre les
 * données réelles du jour :
 *  1. dossiers_en_attente   — dossier « en_attente » depuis > X heures
 *  2. identificateur_inactif — identificateur actif sans enrôlement > X jours
 *  3. chute_ventes          — CA du jour < moyenne 7 jours de -(X %)
 *  4. objectif_en_retard    — objectif mensuel en retard de X % vs rythme
 *
 * Le back-office appelle POST /api/backoffice/alertes/evaluer (manuel ou
 * cron) : chaque alerte produite est insérée dans legacy_bo_alerts avec une
 * clé de déduplication (type + référence + jour) — ré-évaluer le même jour
 * ne duplique rien.
 *
 * Fonctions pures, sans dépendance — testées par src/lib/__tests__/alertes-moteur.test.ts
 */

export type AlertRuleType =
  | 'dossiers_en_attente'
  | 'identificateur_inactif'
  | 'chute_ventes'
  | 'objectif_en_retard'

export type AlertSeverity = 'basse' | 'moyenne' | 'haute'

export interface AlertRuleDef {
  ruleType: AlertRuleType
  /** Unité du seuil : heures, jours ou pourcentage. */
  unit: 'heures' | 'jours' | '%'
  threshold: number
  enabled: boolean
}

export interface GeneratedAlert {
  ruleType: AlertRuleType
  severity: AlertSeverity
  title: string
  message: string
  /** Module legacy_bo_alerts rattaché (cohérent avec les écrans existants). */
  module: string
  reference: string
  dedupKey: string
}

export const DEFAULT_ALERT_RULES: Record<AlertRuleType, Omit<AlertRuleDef, 'ruleType' | 'enabled'>> = {
  dossiers_en_attente: { unit: 'heures', threshold: 48 },
  identificateur_inactif: { unit: 'jours', threshold: 7 },
  chute_ventes: { unit: '%', threshold: 30 },
  objectif_en_retard: { unit: '%', threshold: 20 },
}

export const ALERT_RULE_LABELS: Record<AlertRuleType, { title: string; description: string }> = {
  dossiers_en_attente: {
    title: 'Dossiers en attente',
    description: 'Un dossier soumis attend une validation depuis trop longtemps.',
  },
  identificateur_inactif: {
    title: 'Identificateur inactif',
    description: 'Un identificateur actif n’a plus enrôlé de dossier depuis plusieurs jours.',
  },
  chute_ventes: {
    title: 'Chute des ventes',
    description: 'Le chiffre d’affaires marchands du jour décroche par rapport à la moyenne des 7 derniers jours.',
  },
  objectif_en_retard: {
    title: 'Objectif en retard',
    description: 'Un objectif mensuel décroche par rapport au rythme attendu à date.',
  },
}

/** Clé de déduplication : une alerte par (type, référence, jour). */
export function dedupKey(ruleType: AlertRuleType, reference: string, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${ruleType}:${reference}:${day}`
}

// ─── 1. Dossiers en attente ────────────────────────────────────────────────

export interface EnrolmentLike {
  id: string
  dossierId: string
  actorName: string
  status: string
  submittedAt: string
}

export function computeDossiersEnAttente(
  enrolments: EnrolmentLike[],
  thresholdHours: number,
  now: Date,
): GeneratedAlert[] {
  if (thresholdHours <= 0) return []
  const out: GeneratedAlert[] = []
  for (const e of enrolments) {
    if (e.status !== 'en_attente') continue
    const ageHours = (now.getTime() - new Date(e.submittedAt).getTime()) / 3_600_000
    if (ageHours < thresholdHours) continue
    const severe = ageHours >= thresholdHours * 2
    out.push({
      ruleType: 'dossiers_en_attente',
      severity: severe ? 'haute' : 'moyenne',
      title: severe ? 'Dossier en attente critique' : 'Dossier en attente',
      message: `Dossier ${e.dossierId} (${e.actorName}) attend une validation depuis ${Math.floor(ageHours)} h (seuil : ${thresholdHours} h).`,
      module: 'enrolement',
      reference: e.id,
      dedupKey: dedupKey('dossiers_en_attente', e.id, now),
    })
  }
  // Les plus anciens d'abord (les critiques remontent en tête).
  return out.sort((a, b) => (a.severity === 'haute' && b.severity !== 'haute' ? -1 : 0))
}

// ─── 2. Identificateurs inactifs ───────────────────────────────────────────

export interface IdentificateurActivityLike {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  /** Date du dernier enrôlement connu (absent = jamais enrôlé). */
  lastEnrolmentAt?: string | null
}

export function computeIdentificateursInactifs(
  identificateurs: IdentificateurActivityLike[],
  thresholdDays: number,
  now: Date,
): GeneratedAlert[] {
  if (thresholdDays <= 0) return []
  const out: GeneratedAlert[] = []
  for (const ident of identificateurs) {
    if (!ident.isActive) continue
    const last = ident.lastEnrolmentAt ?? ident.createdAt
    if (!last) continue
    const ageDays = Math.floor((now.getTime() - new Date(last).getTime()) / 86_400_000)
    if (ageDays < thresholdDays) continue
    const severe = ageDays >= thresholdDays * 2
    out.push({
      ruleType: 'identificateur_inactif',
      severity: severe ? 'moyenne' : 'basse',
      title: severe ? 'Identificateur inactif de longue date' : 'Identificateur inactif',
      message: `${ident.name} n’a plus enrôlé depuis ${ageDays} jours (seuil : ${thresholdDays} j).`,
      module: 'missions',
      reference: ident.id,
      dedupKey: dedupKey('identificateur_inactif', ident.id, now),
    })
  }
  return out
}

// ─── 3. Chute des ventes ───────────────────────────────────────────────────

export interface DailyRevenueLike {
  date: string // YYYY-MM-DD
  total: number
}

/**
 * Compare le CA du jour à la moyenne des 7 jours précédents. Pour éviter
 * le bruit du début de journée, la règle n'est évaluée qu'à partir de
 * 10 h (heure d'Abidjan, now fourni par l'appelant). Sous un plancher de
 * 1 000 FCFA de moyenne, la comparaison n'est pas significative.
 */
export function computeChuteVentes(
  dailyTotals: DailyRevenueLike[],
  thresholdPercent: number,
  now: Date,
): GeneratedAlert[] {
  if (thresholdPercent <= 0) return []
  // now est construit en UTC côté serveur ; l'heure locale d'Abidjan est
  // UTC+0 constant (Côte d'Ivoire, sans changement d'heure).
  if (now.getUTCHours() < 10) return []
  const today = dailyTotals.find((d) => d.date === dailyTotals[0]?.date)
  const previous = dailyTotals.slice(1, 8)
  if (!today || previous.length === 0) return []
  const avg =
    previous.reduce((sum, d) => sum + d.total, 0) / Math.max(1, previous.filter((d) => d.total >= 0).length)
  if (avg < 1000) return []
  const drop = ((avg - today.total) / avg) * 100
  if (drop < thresholdPercent) return []
  const severe = today.total === 0 || drop >= thresholdPercent * 2
  return [
    {
      ruleType: 'chute_ventes',
      severity: severe ? 'haute' : 'moyenne',
      title: severe ? 'Chute des ventes sévère' : 'Chute des ventes',
      message: `CA du jour ${Math.round(today.total).toLocaleString('fr-FR')} FCFA contre une moyenne de ${Math.round(avg).toLocaleString('fr-FR')} FCFA sur 7 jours (−${Math.round(drop)} %, seuil : −${thresholdPercent} %).`,
      module: 'ventes',
      reference: `jour-${today.date}`,
      dedupKey: dedupKey('chute_ventes', `jour-${today.date}`, now),
    },
  ]
}

// ─── 4. Objectifs en retard ────────────────────────────────────────────────

export interface ObjectifProgressLike {
  id: string
  scope: 'identificateur' | 'zone'
  cibleLabel: string
  month: number
  year: number
  target: number
  current: number
}

export function computeObjectifsEnRetard(
  objectifs: ObjectifProgressLike[],
  thresholdPercent: number,
  now: Date,
): GeneratedAlert[] {
  if (thresholdPercent <= 0) return []
  const out: GeneratedAlert[] = []
  for (const o of objectifs) {
    // Pas d'alerte avant le 10 du mois : les premiers jours produisent
    // des retards amples mais non significatifs.
    if (o.year !== now.getFullYear() || o.month !== now.getMonth()) continue
    if (now.getDate() < 10) continue
    const expected = Math.ceil(o.target * (now.getDate() / new Date(o.year, o.month + 1, 0).getDate()))
    if (expected <= 0) continue
    const retard = ((expected - o.current) / expected) * 100
    if (retard < thresholdPercent) continue
    const severe = retard >= 50
    out.push({
      ruleType: 'objectif_en_retard',
      severity: severe ? 'haute' : 'moyenne',
      title: severe ? 'Objectif mensuel décroché' : 'Objectif mensuel en retard',
      message: `Objectif de ${o.cibleLabel} : ${o.current}/${o.target} dossiers alors que ${expected} sont attendus à date (retard ${Math.round(retard)} %).`,
      module: 'missions',
      reference: o.id,
      dedupKey: dedupKey('objectif_en_retard', o.id, now),
    })
  }
  return out
}
