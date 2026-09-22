/**
 * MODE-977 (AUDIT-007 G4) — index de la recherche transversale de l'espace
 * coopérative, module PUR (aucune dépendance au store ni au DOM : testable
 * seul, comme coop-journal.ts).
 *
 * Le pattern est celui de la palette BO (bo-command-palette.tsx) : cmdk
 * filtre nativement sur la chaîne `value` de chaque item — ce module
 * CONSTRUIT les items (navigation + données réelles du store coop), la
 * palette ne fait que les rendre. Aucune donnée inventée : une source vide
 * produit un groupe vide (la palette ne l'affiche pas).
 *
 * Garde-fou budget mobile (AUDIT-007 §6) : chaque source est plafonnée
 * (PLAFOND_PAR_SOURCE) — la recherche est un raccourci, pas un export ;
 * au-delà, l'écran dédié et ses filtres prennent le relais.
 */

export interface CoopSearchInput {
  /** Routes de navigation (COOP_NAV_ITEMS dérivé de COOP_NAV_GROUPS). */
  routes: { id: string; label: string; icon: string; description: string }[]
  /** Membres réels du store (président) — vers la fiche membre (G3). */
  membres: { id: string; prenom?: string | null; nom?: string | null; statut: string; role: string }[]
  /** Pot commun réel — vers l'écran Stock. */
  stock: { id: string; produit: string; quantite: number; unite: string }[]
  /** Besoins réels — vers l'écran Achats groupés. */
  besoins: { id: string; produit: string; quantite: number; unite: string; statut: string }[]
}

export type CoopSearchGroupe = 'navigation' | 'membres' | 'stock' | 'besoins'

export type CoopSearchAction =
  | { type: 'navigate'; route: string }
  | { type: 'fiche-membre'; membreId: string }

export interface CoopSearchResult {
  id: string
  groupe: CoopSearchGroupe
  label: string
  description?: string
  /** Chaîne indexée par cmdk (value) — mots-clés libres cumulés. */
  keywords: string
  action: CoopSearchAction
}

/** Plafond par source — au-delà, l'écran dédié et ses filtres prennent le
 * relais (la palette n'est pas une exportation de table). */
export const PLAFOND_PAR_SOURCE = 40

export const COOP_SEARCH_GROUPES: CoopSearchGroupe[] = ['navigation', 'membres', 'stock', 'besoins']

const nomMembre = (m: CoopSearchInput['membres'][number]): string =>
  [m.prenom, m.nom].filter((p) => typeof p === 'string' && p.trim().length > 0).join(' ').trim() || 'Membre'

/** Construit l'index complet, groupes dans l'ordre canonique, chaque source
 * plafonnée. Jamais undefined : un groupe sans données est vide ([]). */
export function construireIndexRecherche(input: CoopSearchInput): Record<CoopSearchGroupe, CoopSearchResult[]> {
  const navigation: CoopSearchResult[] = input.routes.map((route) => ({
    id: `nav-${route.id}`,
    groupe: 'navigation',
    label: route.label,
    description: route.description,
    keywords: `navigation écran aller ${route.label} ${route.description}`,
    action: { type: 'navigate', route: route.id },
  }))

  const membres: CoopSearchResult[] = input.membres.slice(0, PLAFOND_PAR_SOURCE).map((m) => ({
    id: `membre-${m.id}`,
    groupe: 'membres',
    label: nomMembre(m),
    description: `${m.role === 'president' ? 'Chef de groupe' : 'Membre'} · ${m.statut}`,
    keywords: `membre ${nomMembre(m)} ${m.statut} ${m.role}`,
    action: { type: 'fiche-membre', membreId: m.id },
  }))

  const stock: CoopSearchResult[] = input.stock.slice(0, PLAFOND_PAR_SOURCE).map((s) => ({
    id: `stock-${s.id}`,
    groupe: 'stock',
    label: s.produit,
    description: `${s.quantite} ${s.unite} au pot commun`,
    keywords: `stock pot commun produit ${s.produit}`,
    action: { type: 'navigate', route: 'coop-stock' },
  }))

  const besoins: CoopSearchResult[] = input.besoins.slice(0, PLAFOND_PAR_SOURCE).map((b) => ({
    id: `besoin-${b.id}`,
    groupe: 'besoins',
    label: b.produit,
    description: `${b.quantite} ${b.unite} · ${b.statut.replace('_', ' ')}`,
    keywords: `besoin achat groupé ${b.produit} ${b.statut}`,
    action: { type: 'navigate', route: 'coop-besoins' },
  }))

  return { navigation, membres, stock, besoins }
}
