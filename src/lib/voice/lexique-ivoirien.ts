// Lexique ivoirien VERSIONNÉ du parseur vocal (Sprint V, MODE-955).
//
// SOURCE DE VÉRITÉ UNIQUE des données lexicales du domaine « marché »
// (produits + nombres en toutes lettres) — localIntent.ts IMPORTE ces
// données : aucune duplication nulle part. Versionner le lexique sert la
// feuille de route « pack vocal / lexique ivoirien » (décision propriétaire
// 2026-09-21) : le lexique est LÉGER (quelques Ko), il vit dans l'APK de
// base — il n'a PAS besoin d'être un pack téléchargé ; sa version est
// affichée pour les diagnostics et l'évolution contrôlée.
//
// ── Règles de contribution (cœur du contrat « nouchi » honnête) ───────────
// 1. JAMAIS d'invention : un alias ne rentre ici que s'il est réellement
//    employé sur les marchés ivoiriens (remontée terrain, corpus, témoignage
//    marchande) — jamais « parce que ça pourrait marcher ».
// 2. Un alias par PRONONCIATION orale (ce que la marchande DICTE), pas un
//    dictionnaire orthographique : le STT transcrit ce qu'il entend.
// 3. Chaque alias doit rester UNIQUE dans tout le lexique (deux produits
//    revendiquant le même mot = bug silencieux de routage — testé ici).
// 4. La couverture est assumée et documentée : le nouchi profond (expressions
//    polies de négociation, exclamations, argot de montant non verrouillé
//    terrain) n'est PAS couvert — ne PAS l'affirmer dans l'UI tant que ça
//    n'est pas prouvé (règle « never infer » du projet).

/** Version du lexique — incrémente à chaque évolution (registre diagnostics). */
export const LEXIQUE_VERSION = '1.1.0'

/**
 * Vocabulaire produits du marché : canonique → alias oraux (incluant
 * abréviations dictées et variantes de transcription STT fréquentes).
 *
 * v1.1.0 — enrichissement nouchi/marché CI (MODE-955) : attiéké, gari,
 * haricots (produits courants des marchés ivoiriens manquants du lexique
 * initial). « couscous » reste mappé vers manioc (usage CI — verrouillé
 * par les tests localIntent historiques).
 */
export const PRODUCT_VOCAB: Record<string, string[]> = {
  'tomates': ['tomate', 'tomates', 'tom'],
  'oignons': ['oignon', 'oignons', 'ognon', 'ognons'],
  'piments': ['piment', 'piments', 'pèment'],
  'aubergines': ['aubergine', 'aubergines', 'brin d\'aubergine'],
  'gombos': ['gombo', 'gombos'],
  'bananes': ['banane', 'bananes', 'plantain', 'plantains'],
  'ignames': ['igname', 'ignames'],
  'manioc': ['manioc', 'couscous'],
  'riz': ['riz'],
  'maïs': ['maïs', 'mais', 'blé'],
  'arachides': ['arachide', 'arachides', 'cacahuète', 'cachuetes', 'poix de terre'],
  'huile': ['huile', 'huile palme', 'huile de palme', 'huile végétale'],
  'sel': ['sel'],
  'poisson': ['poisson', 'poisson fumé', 'poisson sec', 'tilapia', 'maquereau'],
  'viande': ['viande', 'poulet', 'bœuf', 'boeuf', 'chèvre', 'mouton', 'porc'],
  'œufs': ['œuf', 'oeuf', 'œufs', 'oeufs'],
  'lait': ['lait', 'lait caillé', 'yaourt'],
  'avocats': ['avocat', 'avocats'],
  'oranges': ['orange', 'oranges', 'citron', 'citrons'],
  'mangues': ['mangue', 'mangues'],
  'ananas': ['ananas'],
  'papayes': ['papaye', 'papayes'],
  'carottes': ['carotte', 'carottes'],
  'concombres': ['concombre', 'concombres'],
  'salade': ['salade', 'laitue'],
  'ail': ['ail'],
  'gingembre': ['gingembre', 'gigembre'],
  'pomme de terre': ['pomme de terre', 'patate', 'patates'],
  'attiéké': ['attiéké', 'attieke', 'attié', 'atchéké'],
  'gari': ['gari'],
  'haricots': ['haricot', 'haricots', 'pois'],
}

/** Nombres en toutes lettres (français) — dictée orale des quantités. */
export const NUMBER_WORDS: Record<string, number> = {
  'zéro': 0, 'zero': 0,
  'un': 1, 'une': 1,
  'deux': 2, 'trois': 3, 'quatre': 4,
  'cinq': 5, 'six': 6, 'sept': 7,
  'huit': 8, 'neuf': 9,
  'dix': 10, 'onze': 11, 'douze': 12,
  'treize': 13, 'quatorze': 14, 'quinze': 15,
  'seize': 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
  'vingt': 20, 'trente': 30, 'quarante': 40,
  'cinquante': 50, 'soixante': 60, 'cent': 100, 'cents': 100,
  'mille': 1000, 'million': 1000000,
}

/** Résultat de recherche dans le lexique produits. */
export type LexiqueProductHit = {
  /** Nom canonique (clé du vocabulaire — renvoyé au moteur de caisse). */
  canonical: string
  /** L'alias exact qui a matché (transcription orale). */
  matchedAlias: string
}

/** Recherche d'un mot/alias dans le lexique produits (comparaison normalisée). */
export function findLexiqueProduct(word: string): LexiqueProductHit | null {
  const normalized = word.trim().toLowerCase()
  if (!normalized) return null
  for (const [canonical, aliases] of Object.entries(PRODUCT_VOCAB)) {
    if (aliases.some((a) => a.toLowerCase() === normalized)) {
      return { canonical, matchedAlias: normalized }
    }
  }
  return null
}

/** Couverture réelle du lexique (diagnostics — jamais une promesse UI). */
export function lexiqueCoverage(): {
  version: string
  productCount: number
  aliasCount: number
} {
  const aliasCount = Object.values(PRODUCT_VOCAB).reduce(
    (acc, aliases) => acc + aliases.length,
    0,
  )
  return { version: LEXIQUE_VERSION, productCount: Object.keys(PRODUCT_VOCAB).length, aliasCount }
}
