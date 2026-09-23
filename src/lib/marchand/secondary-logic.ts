/**
 * Logique pure des écrans secondaires marchands (DET-001 tranche 6, MODE-992).
 *
 * Extraite de src/components/marchand/secondary-screens.tsx : ces 4 règles
 * étaient inline dans les composants (Marche, Tontines, Fidélité) sans aucun
 * test. Les comportements sont figés TELS QUELS — c'est le comportement réel
 * historique qui est testé, pas un comportement supposé.
 */

/** Rôles acceptés par /api/loyalty/me (subjectRole). */
export type LoyaltySubjectRole =
  | 'producteur'
  | 'cooperateur'
  | 'grossiste'
  | 'semi_grossiste'
  | 'marchand'

/**
 * Dérive le subjectRole de fidélité depuis le rôle global et la catégorie
 * marchande. Le produit requiert : producteur → 'producteur', coopérateur →
 * 'cooperateur', sinon la catégorie grossiste/semi_grossiste, sinon 'marchand'
 * (détaillant et inconnus compris).
 */
export function deriveLoyaltySubjectRole(
  userRole: string,
  merchantCategorie: string | null
): LoyaltySubjectRole {
  return userRole === 'producteur'
    ? 'producteur'
    : userRole === 'cooperateur'
      ? 'cooperateur'
      : merchantCategorie === 'grossiste'
        ? 'grossiste'
        : merchantCategorie === 'semi_grossiste'
          ? 'semi_grossiste'
          : 'marchand'
}

/**
 * Clamp de la quantité de commande fournisseur (dialog Marché) : entier non
 * finit ou < 1 → 1 ; au-delà de 999 → 999. Comportement historique du
 * onChange verbatim (Number.parseInt puis garde Number.isFinite).
 */
export function clampOrderQuantity(raw: string): number {
  const v = Number.parseInt(raw, 10)
  return Number.isFinite(v) && v >= 1 ? Math.min(v, 999) : 1
}

/**
 * Clamp du nombre de membres prévu d'une tontine (dialog création) : entier
 * non finit ou < 2 → 2 ; au-delà de 100 → 100. Même contrat que le clamp
 * commande, bornes tontine.
 */
export function clampTontineMembers(raw: string): number {
  const v = Number.parseInt(raw, 10)
  return Number.isFinite(v) && v >= 2 ? Math.min(v, 100) : 2
}

/**
 * Validation locale du formulaire de création de tontine : nom non vide
 * (trim), montant entier fini strictement positif, au moins 2 membres.
 * amountValue est le Number.parseInt déjà effectué par le composant.
 */
export function isTontineFormValid(
  name: string,
  amountValue: number,
  memberCount: number
): boolean {
  return (
    name.trim().length > 0 &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    memberCount >= 2
  )
}
