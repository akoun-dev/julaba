// Phrases pures du crédit clients (MODE-906, §21-22/§27-28 du cahier Mode
// Marché). Comme tata-phrases.ts, ce module est volontairement PUR : aucun
// store, aucun réseau — l'appelant (voice-modal, écran Mes crédits, caisse)
// fournit les données réelles et la phrase ne devine rien.
//
// La voix marchande TUTOIE (« te doit », « tes clients ») — cahier Mode
// Marché, cf. REGRESSIONS/REVIEW_LOG. Zéro emoji. Les montants passent par
// formatMontantParle (« 25 000 ») pour rester identiques à l'écran et à la
// voix (toSpeechText verbalise).

import { formatMontantParle } from '@/lib/voice/tata-phrases'

/**
 * Crédit enregistré (§21) : « C'est enregistré. {name} te doit maintenant
 * {newBalanceCfa} francs. » — la dette annoncée est le NOUVEAU solde cumulé.
 */
export function creditRecordedPhrase(name: string, amountCfa: number, newBalanceCfa: number): string {
  void amountCfa // le total parlé est le solde cumulé ; le montant du crédit reste en signature pour les évolutions (échéances)
  return `C'est enregistré. ${name} te doit maintenant ${formatMontantParle(newBalanceCfa)} francs.`
}

/**
 * Remboursement enregistré (§22) : « C'est enregistré. La dette de {name}
 * passe de {A} à {B} francs. » — et si le solde tombe à zéro :
 * « C'est enregistré. {name} ne te doit plus rien. »
 */
export function repaymentRecordedPhrase(name: string, beforeCfa: number, afterCfa: number): string {
  if (afterCfa === 0) {
    return `C'est enregistré. ${name} ne te doit plus rien.`
  }
  return `C'est enregistré. La dette de ${name} passe de ${formatMontantParle(beforeCfa)} à ${formatMontantParle(afterCfa)} francs.`
}

/**
 * Refus honnête d'un remboursement au-delà de la dette (§27) :
 * « {name} ne te doit que {X} francs. Je ne peux pas noter un paiement de {Y}. »
 */
export function repaymentExceedsDebtPhrase(name: string, balanceCfa: number, attemptedCfa: number): string {
  return `${name} ne te doit que ${formatMontantParle(balanceCfa)} francs. Je ne peux pas noter un paiement de ${formatMontantParle(attemptedCfa)}.`
}

/**
 * Résumé du total dû (§27-28) : « Tes clients te doivent {X} francs en
 * tout, sur {N} crédits. » — N = nombre de clients qui doivent encore.
 */
export function debtTotalPhrase(totalCfa: number, countClients: number): string {
  const credit = countClients > 1 ? 'crédits' : 'crédit'
  return `Tes clients te doivent ${formatMontantParle(totalCfa)} francs en tout, sur ${formatMontantParle(countClients)} ${credit}.`
}
