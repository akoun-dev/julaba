// MODE-988 (AUDIT_FREEBUFF F-01) — verrou anti double-soumission de vente.
//
// Le problème : handleCompleteSale est async avec `await fetch` — sur un
// double-tap du bouton Valider, DEUX invocations tournent en parallèle,
// chacune avec son `clientId` NEUF (`sale-${Date.now()}-…`) : l'idempotence
// serveur par client_id ne peut rien y faire (deux ids = deux ventes).
// Le garde serveur reste nécessaire en défense en profondeur, mais le
// verrou CLIENT est la vraie fermeture : la 2e invocation est refusée
// AVANT de générer son clientId.
//
// Verrou en mémoire du module : un seul appel à la fois, libéré au
// `finally` du porteur — même grammaire que le `isProcessing` de la vente
// rapide (vente-rapide-modal), mais DANS le handler, pas seulement sur le
// bouton (un raccourci clavier ou un futur 2e bouton est couvert aussi).

/** Verrou courant de la vente caisse (false = libre). */
let verrouPris = false

/**
 * Exécute `op` sous verrou : si une vente est déjà en cours, le verrou
 * lève IMMÉDIATEMENT (aucune file d'attente) — un second tap pendant le
 * traitement ne doit ni doubler la vente ni la rejouer après coup.
 */
export async function sousVerrouVente<T>(op: () => Promise<T>): Promise<T> {
  if (verrouPris) throw new Error('SALE_IN_PROGRESS')
  verrouPris = true
  try {
    return await op()
  } finally {
    verrouPris = false
  }
}

/** true si une vente est en cours (tests / désactivation UI dérivée). */
export function venteEnCours(): boolean {
  return verrouPris
}
