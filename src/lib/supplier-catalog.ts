// ============================================================
// CATALOGUE FOURNISSEURS — source de vérité unique
// ============================================================
// Utilisé à la fois par l'écran Marché (clic sur « Commander ») et par le
// pipeline de commande vocale de Tata (voice-modal → parseIntent →
// findCatalogEntry). Un seul endroit, pour que ce que Tata comprend à la
// voix corresponde exactement aux cartes affichées à l'écran.

export interface SupplierProduct {
  id: string
  name: string
  price: number
  supplier: string
}

export const SUPPLIER_PRODUCTS: SupplierProduct[] = [
  { id: 'sp1', name: 'Tomates (caisse)', price: 12000, supplier: 'Ferme Awa' },
  { id: 'sp2', name: 'Oignons (sac 50kg)', price: 25000, supplier: 'Coop Yamoussoukro' },
  { id: 'sp3', name: 'Riz 25kg long grain', price: 18000, supplier: 'Dépôt Koffi' },
  { id: 'sp4', name: 'Poulets vivants (lot 10)', price: 30000, supplier: 'Poulailler Adjame' },
  { id: 'sp5', name: 'Huile de palme 5L', price: 6500, supplier: 'Huilerie Dabou' },
  { id: 'sp6', name: 'Poisson fumé (carton)', price: 22000, supplier: 'Pêcheur Abidjan' },
  { id: 'sp7', name: 'Ignames (tas)', price: 8000, supplier: 'Marché Bondoukou' },
  { id: 'sp8', name: 'Arachides (sac 25kg)', price: 15000, supplier: 'Coop Korhogo' },
]

// Alias oraux → entrée du catalogue. Couvre le français de marché et les
// facilités de la reconnaissance vocale (accents, pluriels, omissions).
// Les alias longs sont évalués en premier pour que « poisson fumé » gagne
// sur « poisson ».
const CATALOG_ALIASES: Record<string, string[]> = {
  sp1: ['tomate', 'tomates'],
  sp2: ['oignon', 'oignons'],
  sp3: ['riz'],
  sp4: ['poulet', 'poulets', 'volaille'],
  sp5: ['huile de palme', 'huile'],
  sp6: ['poisson fumé', 'poisson fume', 'poisson'],
  sp7: ['igname', 'ignames'],
  sp8: ['arachide', 'arachides', 'cacahuète', 'cacahuetes', 'cacahuètes'],
}

// Ordre d'évaluation : alias le plus long d'abord (tri global sur tous les
// alias pour que « poisson fumé » soit testé avant « poisson », peu importe
// l'entrée).
const ALIAS_INDEX: { alias: string; product: SupplierProduct }[] = Object.entries(
  CATALOG_ALIASES,
).flatMap(([id, aliases]) => {
  const product = SUPPLIER_PRODUCTS.find(p => p.id === id)
  if (!product) return []
  return aliases.map(alias => ({ alias, product }))
}).sort((a, b) => b.alias.length - a.alias.length)

/**
 * Trouve l'entrée du catalogue correspondant à un énoncé parlé.
 * Recherche en sous-chaîne insensible à la casse/accents simples —
 * « commande deux sacs de riz », « je veux des tomates », « huile de palme »…
 * Renvoie null si aucun produit du catalogue n'est reconnu.
 */
export function findCatalogEntry(transcript: string): SupplierProduct | null {
  const lower = transcript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  for (const { alias, product } of ALIAS_INDEX) {
    const normalizedAlias = alias
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (lower.includes(normalizedAlias)) return product
  }
  return null
}

/** Liste lisible des produits commandables — pour les réponses vocales de
 * Tata quand le produit demandé n'existe pas au catalogue. */
export function catalogSummaryText(): string {
  return SUPPLIER_PRODUCTS.map(p => p.name.replace(/\s*\(.*\)$/, '').toLowerCase()).join(', ')
}
