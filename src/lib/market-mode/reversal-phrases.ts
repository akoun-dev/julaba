// Phrases pures de l'annulation de vente (MODE-909, §28 du cahier Mode
// Marché). Comme credit-phrases.ts, ce module est volontairement PUR :
// aucun store, aucun réseau — l'appelant (ventes-screen, voice-modal)
// fournit les données réelles et la phrase ne devine rien.
//
// La voix marchande TUTOIE, zéro emoji. Jamais le mot « supprimer » :
// une vente ne se supprime JAMAIS, elle s'annule (opération inverse
// append-only). Les montants passent par formatMontantParle (« 25 000 »)
// pour rester identiques à l'écran et à la voix (toSpeechText verbalise).

import { formatMontantParle } from '@/lib/voice/tata-phrases'

/**
 * Raisons rapides de la modale d'annulation (ventes-screen) — chacune
 * satisfait la règle 3-200 (zod + CHECK en base). Source unique : l'UI
 * n'invente jamais ses propres libellés.
 */
export const QUICK_CANCEL_REASONS: readonly string[] = [
  'Erreur de prix',
  'Erreur de produit',
  'Client parti',
]

/**
 * Annulation enregistrée (§28) — phrase imposée : « Vente annulée. Le
 * stock est revenu. » (l'opération inverse a remis la quantité en stock).
 */
export function saleReversedPhrase(): string {
  return 'Vente annulée. Le stock est revenu.'
}

/**
 * Confirmation orale OBLIGATOIRE avant annulation (§28) : « Tu veux
 * annuler la vente de {montant} francs de {produit} ? Je confirme ? » —
 * les infos viennent de la dernière vente locale non annulée (jamais
 * devinées).
 */
export function annuleVenteConfirmPhrase(amountCfa: number, produitLabel: string): string {
  return `Tu veux annuler la vente de ${formatMontantParle(amountCfa)} francs de ${produitLabel} ? Je confirme ?`
}

/**
 * Libellé du produit dicté dans la confirmation : le nom réel de l'article
 * unique ; plusieurs articles → le nombre d'articles (jamais de liste
 * interminable à l'oral) ; journal sans item → libellé neutre.
 */
export function annuleVenteProduitLabel(items: Array<{ productName: string }>): string {
  if (items.length === 1) return items[0].productName || 'Article'
  if (items.length > 1) return `${items.length} articles`
  return 'Article'
}

/**
 * Aucune vente annulable aujourd'hui (voix §28) : « Je ne trouve pas de
 * vente à annuler aujourd'hui. » — honnête, jamais de vente inventée.
 */
export function saleToCancelNotFoundPhrase(): string {
  return "Je ne trouve pas de vente à annuler aujourd'hui."
}

/**
 * Refus d'une double annulation (§28 : une vente ne s'annule qu'UNE fois,
 * côté local comme côté serveur) : « Cette vente est déjà annulée. »
 */
export function saleAlreadyCancelledPhrase(): string {
  return 'Cette vente est déjà annulée.'
}

/**
 * Réponse au refus oral (« non ») pendant la confirmation : « Je n'ai rien
 * annulé. » — l'historique reste intact.
 */
export function voiceReversalDeclinedPhrase(): string {
  return "Je n'ai rien annulé."
}
