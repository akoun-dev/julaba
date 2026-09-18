// HTTP utilitaire partagé — timeout réseau explicite.
//
// Extrait de voice/conversation.ts (B4-041) pour servir AUSSI aux flux
// métier hors conversation (completeQuickSale — audit VOCAL-604) : un
// `fetch` nu sans timeout peut rester suspendu des minutes sur réseau
// mobile précaire et figer l'UI en « processing » sans aucun retour.
// Ne jamais laisser un appel métier pendre sur le réseau : échec
// explicite → file offline → « en attente de synchronisation ».

/**
 * Durée de grâce réseau par défaut : au-delà, la requête est abandonnée
 * et l'erreur est rendue explicite à l'appelant (jamais de suspension
 * indéfinie).
 */
export const NETWORK_TIMEOUT_MS = 10_000

/**
 * fetch avec garde-fou temporel : renvoie la Response comme `fetch`, ou
 * LÈVE une erreur explicite si le serveur n'a pas répondu dans le délai.
 * Le reste du contrat est identique à `fetch` (statuts HTTP, res.ok).
 */
export async function fetchJsonWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = NETWORK_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const handle = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Aucune réponse du serveur après ${Math.round(timeoutMs / 1000)} s — connexion interrompue ou trop lente.`,
      )
    }
    throw error
  } finally {
    clearTimeout(handle)
  }
}
