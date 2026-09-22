'use client'

// MODE-985 (DET-COOP-011 tranche 2) — déclaration de commune du MARCHAND.
//
// Miroir de /api/producteur/profil/commune (MODE-979) côté écriture, avec
// le contrat de verdict du PIN marchand (DET-AUTH-001, MODE-978) : le
// verdict dit toujours ce qui s'est RÉELLEMENT passé —
//   • synced — serveur mis à jour ;
//   • queued — serveur injoignable, écriture en file offline
//              ('marchand-commune', rejeu verbatim — le handler
//              reconstruit l'URL ?marchandId=) ;
//   • rejet  — refus définitif du serveur (400 commune inconnue, 403,
//              404) : RIEN n'est appliqué, le choix reste à l'écran ;
//   • lost   — ni serveur ni file : le choix n'existe nulle part, dit
//              explicitement.
//
// La commune est stockée SERVEUR (merchants.commune_id, migration
// 20260923100000) : c'est elle que la liste membres de la coopérative
// lit pour les filtres région/commune — une écriture locale-seule serait
// invisible pour le président, d'où l'absence délibérée d'un verdict
// « local_seul » : ici, hors serveur, il n'y a RIEN à mettre en cache.

import { queuePendingSync } from '@/lib/offline-db'

export type ResultatChoixCommune =
  | { statut: 'synced' }
  | { statut: 'queued' }
  | { statut: 'rejet'; raison: string }
  | { statut: 'lost'; raison: string }

function estTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export async function choisirCommuneMarchand(
  marchandId: string,
  communeId: string
): Promise<ResultatChoixCommune> {
  // Payload AUTOPORTEUR : le rejeu reconstruit l'URL exacte
  // (?marchandId=) à partir du payload, comme producteur-commune.
  const payload = { marchandId, communeId }
  try {
    const res = await fetch(
      `/api/marchand/profil/commune?marchandId=${encodeURIComponent(marchandId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    if (res.ok) return { statut: 'synced' }
    if (estTransient(res.status)) {
      const queued = await queuePendingSync('marchand-commune', payload)
      return queued.ok
        ? { statut: 'queued' }
        : { statut: 'lost', raison: 'Serveur momentanément indisponible et mise en file impossible.' }
    }
    const body = (await res.json().catch(() => null)) as { erreur?: string } | null
    return { statut: 'rejet', raison: body?.erreur || `Refus du serveur (${res.status})` }
  } catch {
    // Réseau indisponible — mise en file (rejeu verbatim au retour).
    try {
      const queued = await queuePendingSync('marchand-commune', payload)
      if (queued.ok) return { statut: 'queued' }
    } catch {
      // filet : queuePendingSync ne jette pas, mais rien ne doit sortir du catch
    }
    return { statut: 'lost', raison: 'Hors ligne et mise en file impossible — stockage local indisponible.' }
  }
}
