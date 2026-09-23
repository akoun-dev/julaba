/**
 * MODE-935 (audit #003, I-12) — machine à états des statuts producteur.
 *
 * Avant ce module, PATCH récoltes/commandes acceptait n'importe quelle
 * valeur de statut (aucune union imposée, pas de CHECK SQL) : un statut
 * hors UI était posable et disparaissait silencieusement des filtres.
 * Le CHECK SQL (migration 20260921120000) verrouille l'UNION ; ce module
 * verrouille les TRANSITIONS côté serveur.
 *
 * Règle d'idempotence : un PATCH rejoué offline (même valeur que l'état
 * courant) est toujours valide — le rejeu ne doit jamais tourner en
 * boucle ni créer de conflit fantôme.
 */

export const RECOLTE_STATUTS = ['brouillon', 'publiee', 'disponible', 'vendue'] as const
export type RecolteStatutApi = (typeof RECOLTE_STATUTS)[number]

/**
 * Cycle de vie d'une récolte :
 *   brouillon → publiee   (« Mettre en vente »)
 *   brouillon → disponible (« Mettre en stock » — vente directe sans annonce)
 *   publiee   → disponible (« Mettre en stock » — la récolte quitte la vente)
 *   publiee/disponible → vendue (vente réelle, montant enregistré)
 *   vendue    → (terminal)
 */
export const TRANSITIONS_RECOLTE: Record<string, readonly string[]> = {
  brouillon: ['publiee', 'disponible'],
  publiee: ['disponible', 'vendue'],
  disponible: ['vendue'],
  vendue: [],
}

export function transitionRecolteValide(de: string, vers: string): boolean {
  if (de === vers) return true // rejeu idempotent du même statut
  return (TRANSITIONS_RECOLTE[de] ?? []).includes(vers)
}

export const COMMANDE_STATUTS = [
  'a_traiter',
  'en_attente',
  'confirmee',
  'en_cours',
  'livree',
  'refusee',
] as const
export type CommandeStatutApi = (typeof COMMANDE_STATUTS)[number]

/**
 * Cycle de vie d'une commande (les statuts 'en_attente'/'confirmee' sont
 * posés par le seed et le backoffice, les autres par le producteur) :
 *   *  → en_cours|refusee (réponse du producteur)
 *   en_cours → livree (livraison confirmée — déclenche la sortie de stock)
 *   livree/refusee → (terminaux)
 */
export const TRANSITIONS_COMMANDE: Record<string, readonly string[]> = {
  a_traiter: ['en_cours', 'refusee'],
  en_attente: ['en_cours', 'refusee'],
  confirmee: ['en_cours', 'refusee'],
  en_cours: ['livree', 'refusee'],
  livree: [],
  refusee: [],
}

export function transitionCommandeValide(de: string, vers: string): boolean {
  if (de === vers) return true // rejeu idempotent du même statut
  return (TRANSITIONS_COMMANDE[de] ?? []).includes(vers)
}
