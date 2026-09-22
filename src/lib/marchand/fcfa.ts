/**
 * MODE-984 (AUDIT-008 P2) — contrat strict d'un montant FCFA saisi,
 * IDENTIQUE UI/store/API : entier positif uniquement (pas de décimale,
 * pas de texte, pas de NaN — « 1000abc » est REFUSÉ, fin du parseInt
 * permissif), plafonné à 999 999 999 FCFA (safe integer, ordre de
 * grandeur honnête pour une caisse d'un marchand).
 *
 * Les espaces et séparateurs de milliers de la dictée (« 12 500 ») sont
 * tolérés et retirés avant le test — toute autre licence est un refus.
 */
export const PLAFOND_FCFA = 999_999_999

/** Retourne le montant entier, ou null si la saisie n'est pas un montant
 * FCFA strictement valide (le null se traduit côté UI par un bouton
 * désactivé + un refus parlé, côté API par un 400). */
export function parseMontantFcfaStrict(valeur: string): number | null {
  const propre = valeur.trim().replace(/[\s\u202f\u00a0]/g, '')
  if (!/^\d{1,9}$/.test(propre)) return null
  const montant = Number(propre)
  if (!Number.isSafeInteger(montant) || montant > PLAFOND_FCFA) return null
  return montant
}

/** Garde réutilisable côté API : montant FCFA strict fourni (optionnel
 * accepté — un countedCash absent signifie « estimation », pas erreur). */
export function montantFcfaValide(montant: unknown): montant is number {
  return typeof montant === 'number' && Number.isSafeInteger(montant) && montant >= 0 && montant <= PLAFOND_FCFA
}
