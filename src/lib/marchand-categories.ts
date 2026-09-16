/**
 * CLASSIFICATION DES MARCHANDS — source unique de vérité.
 *
 * La catégorie des marchands comprend les détaillants, les semi-grossistes et
 * les grossistes : les trois maillons intermédiaires de la chaîne de
 * distribution entre le producteur (hors classification) et le consommateur
 * final. Cette nomenclature est consommée partout : wizard d'enrôlement de
 * l'identificateur, API backoffice et /api/v1, base Supabase (CHECK
 * `categorie_marchand` + table de référence `merchant_categories` seedée avec
 * les mêmes valeurs), backoffice et écran profil marchand.
 *
 * Convention de nommage DB : valeurs snake_case sans accent
 * ('semi_grossiste'), labels français côté UI. Une colonne texte + CHECK est
 * préférée à un ENUM natif PostgreSQL : ajouter un maillon plus tard (ex.
 * « collecteur ») est un simple ALTER + UPDATE, pas un recast de type.
 */

export const MARCHAND_CATEGORIES = ['detaillant', 'semi_grossiste', 'grossiste'] as const

export type MarchandCategorie = (typeof MARCHAND_CATEGORIES)[number]

export interface MarchandCategorieMeta {
  label: string
  /** Une ligne, affichée sous le label dans le wizard et le backoffice. */
  description: string
  /** Position canonique dans la chaîne : producteur(0) → … → consommateur(4). */
  positionChaine: number
  /** Classes Tailwind de la pastille backoffice (badge doux). */
  badgeClass: string
}

export const MARCHAND_CATEGORIES_META: Record<MarchandCategorie, MarchandCategorieMeta> = {
  detaillant: {
    label: 'Détaillant',
    description: 'Vend en petites quantités au consommateur final, sur un marché, en boutique ou en ambulatoire.',
    positionChaine: 3,
    badgeClass: 'bg-emerald-100 text-emerald-800',
  },
  semi_grossiste: {
    label: 'Semi-grossiste',
    description: 'Achète aux producteurs et revend en quantités intermédiaires aux détaillants.',
    positionChaine: 2,
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  grossiste: {
    label: 'Grossiste',
    description: 'Achète en gros volumes aux producteurs et coopératives, revend aux semi-grossistes et détaillants.',
    positionChaine: 1,
    badgeClass: 'bg-sky-100 text-sky-800',
  },
}

/** Ordre canonique d'affichage (du haut vers le bas de la chaîne). */
export const MARCHAND_CATEGORIES_BY_POSITION = [...MARCHAND_CATEGORIES].sort(
  (a, b) => MARCHAND_CATEGORIES_META[a].positionChaine - MARCHAND_CATEGORIES_META[b].positionChaine,
)

export function isMarchandCategorie(value: unknown): value is MarchandCategorie {
  return typeof value === 'string' && (MARCHAND_CATEGORIES as readonly string[]).includes(value)
}

/** Tolérant aux variantes saisiées (accents, casse, tirets) pour les
 * données historiques ou la voix : "Semi-Grossiste" → 'semi_grossiste'. */
export function normalizeMarchandCategorie(value: string | null | undefined): MarchandCategorie | null {
  if (!value) return null
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .trim()
  return isMarchandCategorie(slug) ? slug : null
}

/**
 * Labels des types d'acteur — centralisés ici pour tuer les copies divergentes
 * (le dépôt en comptait cinq). Couvre les deux vocabulaires legacy et modernes :
 * les tables legacy stockent 'cooperative', les tables modernes 'cooperatif'.
 */
export const ACTOR_TYPE_LABELS: Record<string, string> = {
  marchand: 'Marchand(e)',
  producteur: 'Producteur(rice)',
  cooperative: 'Coopérative',
  cooperatif: 'Coopérative',
}

export function actorTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return ACTOR_TYPE_LABELS[type] ?? type
}
