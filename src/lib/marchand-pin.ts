'use client'

// DET-AUTH-001 (MODE-978) — changement de PIN marchand PROPAGÉ AU SERVEUR.
//
// AVANT : le profil marchand changeait le PIN LOCAL SEULEMENT (cache
// localStorage) — le hash serveur restait l'ancien, donc l'ancien code
// restait valide sur tout autre appareil : désynchronisation perçue
// comme un bug de sécurité.
//
// APRÈS : le changement passe par PATCH /api/merchant (MODE-936 : les
// codes voyagent en BRUT, le hachage scrypt est serveur), avec
// vérification serveur de l'ancien code. Contrat honnête
// synced|queued|local_seul|rejet|lost — le verdict dit toujours ce qui
// s'est réellement passé :
//   • synced      — serveur mis à jour ;
//   • queued      — serveur injoignable, écriture en file offline
//                   ('merchant-update', rejeu verbatim — MODE-943) ;
//   • local_seul  — le serveur ne connaît pas ce compte (404, compte
//                   enregistré localement seulement) : le cache local
//                   est la seule source, comme avant ;
//   • rejet       — refus définitif (ancien code refusé par le SERVEUR,
//                   cache local périmé) : le changement local NE DOIT PAS
//                   être appliqué ;
//   • lost        — ni serveur ni file : changement local seul EXPLICITEMENT
//                   annoncé (l'ancien code reste valide ailleurs).

import { queuePendingSync } from '@/lib/offline-db'

export type ResultatChangementPin =
  | { statut: 'synced' }
  | { statut: 'queued' }
  | { statut: 'local_seul' }
  | { statut: 'rejet'; raison: string }
  | { statut: 'lost'; raison: string }

function estTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export async function changerPinMarchand(
  phone: string,
  ancienPin: string,
  nouveauPin: string
): Promise<ResultatChangementPin> {
  // Le brut voyage (hachage scrypt SERVEUR, MODE-936) ; ancienPin déclenche
  // la vérification serveur AVANT écriture. Le payload rejeté en file est
  // rejoué VERBATIM par le handler 'merchant-update' existant.
  const payload = { phone, authMethod: 'pin', pin: nouveauPin, ancienPin }
  try {
    const res = await fetch('/api/merchant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) return { statut: 'synced' }
    if (res.status === 404) return { statut: 'local_seul' }
    if (estTransient(res.status)) {
      const queued = await queuePendingSync('merchant-update', payload)
      return queued.ok
        ? { statut: 'queued' }
        : { statut: 'lost', raison: 'Serveur momentanément indisponible et mise en file impossible.' }
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return { statut: 'rejet', raison: body?.error || `Refus du serveur (${res.status})` }
  } catch {
    // Réseau indisponible — mise en file (rejeu verbatim au retour).
    try {
      const queued = await queuePendingSync('merchant-update', payload)
      if (queued.ok) return { statut: 'queued' }
    } catch {
      // filet : queuePendingSync ne jette pas, mais rien ne doit sortir du catch
    }
    return { statut: 'lost', raison: 'Hors ligne et mise en file impossible — stockage local indisponible.' }
  }
}
