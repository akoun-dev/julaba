/**
 * Logique pure de l'écran Académie back-office (DET-001 tranche 7, MODE-993).
 *
 * Extraite de src/components/backoffice/bo-academie-screen.tsx : le mapper de
 * réponses API, le filtrage par acteur, le groupement par module et les
 * statistiques globales — comportements historiques inline figés TELS QUELS
 * par les tests (comportement réel, pas comportement supposé).
 */

export type ContentTab = 'tutoriels' | 'faq' | 'articles'
export type ContentStatus = 'publie' | 'brouillon' | 'archive'
export type Difficulty = 'debutant' | 'intermediaire' | 'avance'

export interface ContentItem {
  id: string
  title: string
  category: string
  status: ContentStatus
  views: number
  createdAt: string
  updatedAt: string
  author: string
  tab: ContentTab
  excerpt?: string
  content?: string
  difficulty?: Difficulty
  duration?: string
  targetRole?: string
  mediaUrl?: string
  sortOrder: number
}

export const TARGET_ROLES = [
  { value: 'marchand', label: 'Marchand' },
  { value: 'producteur', label: 'Producteur' },
  { value: 'identificateur', label: 'Identificateur' },
  { value: 'cooperative', label: 'Coopérative' },
]

// Suggested modules per actor tab — a starting point for the "Module"
// field, not an enforced taxonomy: any category value already saved on a
// content item still gets its own section even if it isn't in this list.
export const MODULES_BY_ROLE: Record<string, string[]> = {
  marchand: ['Onboarding', 'Ventes', 'Stock', 'Paiements', 'Keiwa', 'Scoring', 'Compte'],
  producteur: ['Récoltes', 'Cultures', 'Commandes', 'Journal', 'Paiements', 'Compte'],
  identificateur: ['Enrôlement', 'Terrain', 'Zones', 'Missions', 'Compte'],
  cooperative: ['Gestion', 'Membres', 'Finances', 'Compte'],
  tous: ['Général', 'Onboarding', 'Support', 'Technique', 'Facturation', 'Sécurité', 'Compte', 'Actualité', 'Produit', 'Témoignage', 'Partenaire', 'Guide', 'Conseil'],
}

export const DURATIONS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '1h', '2h']

/**
 * Mapper d'une entrée brute de l'API /api/backoffice/contenus vers ContentItem.
 * Défauts historiques : status brouillon, views 0 (champ serveur viewCount),
 * tab articles, difficulty debutant, chaînes vides, sortOrder 0.
 */
export function mapContentItem(c: Record<string, unknown>): ContentItem {
  return {
        id: c.id,
        title: c.title,
        category: c.category ?? '',
        status: c.status ?? 'brouillon',
        views: c.viewCount ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: c.author ?? '',
        tab: (c.type as ContentTab) ?? 'articles',
        excerpt: c.excerpt ?? '',
        content: c.content ?? '',
        difficulty: c.difficulty ?? 'debutant',
        duration: c.duration ?? '',
        targetRole: c.targetRole ?? '',
        mediaUrl: c.mediaUrl ?? '',
        sortOrder: (c.sortOrder as number) ?? 0,
  } as ContentItem
}

/**
 * Un onglet acteur montre son propre contenu plus le contenu général
 * (targetRole ''/undefined s'applique à chaque acteur) ; « Tous les acteurs »
 * montre tout.
 */
export function matchesActor(c: ContentItem, actor: string): boolean {
  return actor === 'tous' || c.targetRole === actor || !c.targetRole
}

/**
 * Groupement pour la vue cartes — modules attendus de l'acteur actif
 * (MODULES_BY_ROLE) d'abord dans cet ordre ; toute autre catégorie réellement
 * présente dans les données reçoit sa propre section, ajoutée
 * alphabétiquement, les éléments sans module ramassés en dernier.
 */
export function groupContentsByModule(filtered: ContentItem[], activeActor: string): Array<[string, ContentItem[]]> {
    const map = new Map<string, ContentItem[]>()
    for (const item of filtered) {
      const key = item.category || 'Sans module'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const moduleOrder = MODULES_BY_ROLE[activeActor] || MODULES_BY_ROLE.tous
    const orderIndex = (name: string) => {
      const idx = moduleOrder.indexOf(name)
      return idx === -1 ? moduleOrder.length : idx
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Sans module') return 1
      if (b === 'Sans module') return -1
      const diff = orderIndex(a) - orderIndex(b)
      return diff !== 0 ? diff : a.localeCompare(b, 'fr')
    })
}

/** Statistiques globales de l'en-tête Académie. */
export function computeGlobalStats(contents: ContentItem[]) {
  return {
    total: contents.length,
    published: contents.filter((c) => c.status === 'publie').length,
    totalViews: contents.reduce((sum, c) => sum + c.views, 0),
    tutorials: contents.filter((c) => c.tab === 'tutoriels').length,
  }
}

/** Forme du formulaire création/édition (useState du composant orchestrateur). */
export interface AcademieForm {
  title: string
  type: ContentTab
  content: string
  excerpt: string
  category: string
  status: ContentStatus
  difficulty: Difficulty
  duration: string
  targetRole: string
  mediaUrl: string
}
