'use client'

import { registerSyncHandler, SyncConflictError } from '@/lib/offline-db'
import { uploadDevicePhotoValue, uploadRecoltePhotos } from '@/lib/storage/device-upload'

/**
 * Replay handlers for the offline queue (src/lib/offline-db.ts), one per
 * queued entity — each one issues the exact same request the original
 * live attempt used (same URL, same method, same body shape), so the
 * online path and the replay path always agree. See docs/OFFLINE.md.
 *
 * Mount once via registerAllSyncHandlers() from the SyncFlusher component.
 * registerSyncHandler overwrites silently, and every module that imports
 * this file shares one registry, so double-mounting the component is
 * harmless.
 */

/** Statuses that mean "the server got the request but choked" — retrying
 * later is meaningful, unlike a plain 4xx. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function jsonRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  payload: unknown,
  opts?: { tolerate?: number[] }
): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Network-level failure — transient by definition.
    throw new Error('Réseau indisponible')
  }
  if (res.ok || (opts?.tolerate ?? []).includes(res.status)) return
  if (isTransientStatus(res.status)) {
    throw new Error(`Erreur serveur ${res.status} — réessai plus tard`)
  }
  // Definitive rejection (400/401/403/404/409/410/422...): retrying this
  // exact payload can never succeed, so surface a conflict and drop it.
  throw new SyncConflictError(`Rejet définitif du serveur (${res.status})`)
}

/** URL d'une route membres/:id reconstruite depuis un payload autoporeteur
 * (MODE-977 — le store embarque membreId dans la charge en file). */
function membreUrl(payload: unknown): string {
  const p = payload as { membreId?: string }
  return `/api/cooperatives/membres/${encodeURIComponent(String(p.membreId ?? ''))}`
}

let registered = false

export function registerAllSyncHandlers(): void {
  if (registered) return
  registered = true

  // The claim is "done" when the server answers 200 (fresh claim) or 409
  // (device already bound — see /api/session/claim). 401/403 mean the
  // account is genuinely not claimable from this state → conflict.
  registerSyncHandler('device-claim', (payload) =>
    jsonRequest('/api/session/claim', 'POST', payload, { tolerate: [409] })
  )

  // MODE-937 — rejeu d'un claim par CODE de liaison one-shot (« ABCD-EFGH »,
  // { code } payload). 401 (code expiré/consommé pendant la coupure) et 429
  // (verrou IP) sont définitifs — l'agent ressaisira un code frais.
  registerSyncHandler('device-claim-code', (payload) =>
    jsonRequest('/api/session/claim', 'POST', payload, { tolerate: [409] })
  )

  // MODE-943 (AUDIT-003 F-19) — rejeu d'un dossier identificateur dont la
  // soumission a échoué pour cause de réseau (hors ligne / 5xx) : POST
  // verbatim vers /api/backoffice/enrolments (MÊME payload que le live —
  // le serveur reste l'autorité, le code brut du brouillon voyage comme
  // lors d'une soumission directe). Les refus définitifs (400 validation,
  // 401/403 session) sortent en conflit — rejouer ne les réussira jamais.
  registerSyncHandler('ident-dossier', (payload) =>
    jsonRequest('/api/backoffice/enrolments', 'POST', payload)
  )

  registerSyncHandler('sale', (payload) =>
    jsonRequest('/api/marchand/sales', 'POST', payload)
  )

  registerSyncHandler('expense', (payload) =>
    jsonRequest('/api/marchand/expenses', 'POST', payload)
  )

  registerSyncHandler('product', (payload) =>
    jsonRequest('/api/marchand/products', 'POST', payload)
  )

  registerSyncHandler('product-update', (payload) => {
    const { id, updates } = payload as { id: string; updates: Record<string, unknown> }
    return jsonRequest(`/api/marchand/products?id=${encodeURIComponent(id)}`, 'PATCH', updates)
  })

  // 404 tolerated to match the live path in auth-screen.tsx (the account
  // was registered locally-only and may not exist server-side yet).
  registerSyncHandler('merchant-update', (payload) =>
    jsonRequest('/api/merchant', 'PATCH', payload, { tolerate: [404] })
  )

  registerSyncHandler('tontine-contribution', (payload) =>
    jsonRequest('/api/marchand/tontines', 'POST', payload)
  )

  registerSyncHandler('supplier-order', (payload) =>
    jsonRequest('/api/marchand/supplier-orders', 'POST', payload)
  )

  // PF-04 — les photos DataURL partent au Storage (upload signé par
  // session appareil, /api/v1/storage/sign-upload-device) AVANT le POST :
  // la récolte voyage avec des références `harvest-photos/<…>` au lieu de
  // DataURL base64 (lignes legacy_producteur_recoltes multi-Mo). Toute
  // erreur d'upload lève → l'opération RESTE en file et sera rejouée
  // (aucune récolte ne part sans ses photos). Les entrées non-`data:`
  // passent intactes — la conversion est idempotente. Le reste du payload
  // est inchangé (le serveur reste l'autorité, idempotent sur l'id).
  registerSyncHandler('recolte-create', async (payload) => {
    const { photos, ...rest } = payload as { photos?: string[] } & Record<string, unknown>
    const preparedPhotos = photos?.length ? await uploadRecoltePhotos(photos) : photos
    return jsonRequest('/api/producteur/recoltes', 'POST', { ...rest, photos: preparedPhotos })
  })

  registerSyncHandler('recolte-update', (payload) =>
    jsonRequest('/api/producteur/recoltes', 'PATCH', payload)
  )

  // PF-04 extension journal — même contrat que recolte-create : la photo
  // DataURL de l'entrée de carnet part au Storage (upload signé) AVANT le
  // POST ; toute erreur lève → l'opération reste en file (aucune entrée
  // sans sa photo) ; null / référence / https passent intactes.
  registerSyncHandler('journal', async (payload) => {
    const { photoUrl, ...rest } = payload as { photoUrl?: string | null } & Record<string, unknown>
    const preparedPhotoUrl = await uploadDevicePhotoValue(photoUrl)
    return jsonRequest('/api/producteur/journal', 'POST', { ...rest, photoUrl: preparedPhotoUrl })
  })

  registerSyncHandler('commande-update', (payload) =>
    jsonRequest('/api/producteur/commandes', 'PATCH', payload)
  )

  // MODE-935 (audit #003, I-02) — démarrage d'un cycle culturel : la file
  // avait une entrée 'cycle-create' SANS handler — au flush, « Aucun
  // gestionnaire de synchronisation » → conflit droppé, le cycle créé hors
  // ligne disparaissait au loadFromServer suivant. Rejeu verbatim du POST
  // (l'API est idempotente sur l'id fourni par l'appareil) ; un 409 (« un
  // seul cycle en cours ») est un rejet définitif → conflit signalé.
  registerSyncHandler('cycle-create', (payload) =>
    jsonRequest('/api/producteur/cycles', 'POST', payload)
  )

  // MODE-935 (audit #003, I-03) — clôture du cycle (PATCH, quantité
  // récoltée réelle). Rejeu verbatim : l'API rend l'état courant sur une
  // clôture déjà enregistrée (idempotence) et refuse les transitions
  // interdites (4xx → conflit définitif, jamais de boucle).
  registerSyncHandler('cycle-update', (payload) =>
    jsonRequest('/api/producteur/cycles', 'PATCH', payload)
  )

  // ── Stock offline (STK-808, §2.8) ──────────────────────────────────
  // Chaque opération stock portée par la file embarque son operation_id
  // (UUID déterministe dérivé du clientId côté route, via operationUuid)
  // : rejouer la même entrée = le serveur re-reconnaît l'opération déjà
  // enregistrée, JAMAIS un double mouvement (idempotence RPC §31-32).
  // Un 422 (stock insuffisant/produit absent) est un rejet définitif →
  // SyncConflictError → conflit signalé, jamais de retry en boucle.
  registerSyncHandler('stock-movement', (payload) =>
    jsonRequest('/api/marchand/stock/movements', 'POST', payload)
  )

  registerSyncHandler('stock-count', (payload) =>
    jsonRequest('/api/marchand/stock/count', 'POST', payload)
  )

  registerSyncHandler('stock-purchase', (payload) =>
    jsonRequest('/api/marchand/purchases', 'POST', payload)
  )

  // STK-809 — transferts inter-marchands (§28) : envoi + action
  // (réception chez le destinataire / annulation chez l'expéditeur).
  // L'envoi porte son clientId (→ operation_id déterministe) ; la
  // réception est naturellement idempotente côté RPC (statut). Le rejet
  // 422 (stock insuffisant à l'envoi, transfert déjà clôturé) est un
  // conflit définitif — jamais de boucle.
  registerSyncHandler('stock-transfer', (payload) =>
    jsonRequest('/api/marchand/stock/transfers', 'POST', payload)
  )

  registerSyncHandler('stock-transfer-action', (payload) =>
    jsonRequest('/api/marchand/stock/transfers', 'PATCH', payload)
  )

  // STK-809 — réception d'une commande fournisseur : même contrat que la
  // voie en ligne (PATCH {action:'recevoir'}) ; 409 (déjà livrée/annulée)
  // et 422 (produit absent du stock) = conflits définitifs.
  registerSyncHandler('stock-reception', (payload) => {
    const { id, ...rest } = payload as { id: string } & Record<string, unknown>
    return jsonRequest(`/api/marchand/supplier-orders?id=${encodeURIComponent(id)}`, 'PATCH', rest)
  })

  // MODE-902 (§7-8) — session de journée marché : upsert idempotent par
  // client_id (le rejeu offline rejoue le MÊME payload). Un 4xx = conflit
  // définitif via jsonRequest (comportement standard, jamais de boucle).
  registerSyncHandler('market-session', (payload) =>
    jsonRequest('/api/marchand/market-sessions', 'POST', payload)
  )

  // MODE-906 (§21-22) — crédits clients. Deux entités, rejeu verbatim
  // (même URL/méthode que le live) :
  //  • 'merchant-partner' → upsert idempotent par client_id (le partenaire
  //    est créé AVANT l'op qui le référence — l'ordre FIFO de la file
  //    garantit que le partenaire part en premier) ;
  //  • 'credit-op' → op du grand livre (kind credit/repayment), idempotence
  //    sur operation_id ; un 422 REPAYMENT_EXCEEDS_DEBT est un rejet
  //    définitif → conflit signalé, jamais de boucle.
  registerSyncHandler('merchant-partner', (payload) =>
    jsonRequest('/api/marchand/partners', 'POST', payload)
  )

  registerSyncHandler('credit-op', (payload) =>
    jsonRequest('/api/marchand/credit-ops', 'POST', payload)
  )

  // MODE-908 (§18) — points de vente : upsert idempotent par client_id (le
  // rejeu offline rejoue le MÊME payload ; rename/archive voyagent par le
  // même client_id → UPDATE côté route). La file part AVANT la vente qui
  // référence le point (FIFO) : au rejeu, le point existe déjà côté serveur
  // quand la vente arrive et l'étiquette peut être résolue.
  registerSyncHandler('selling-point', (payload) =>
    jsonRequest('/api/marchand/selling-points', 'POST', payload)
  )

  // MODE-909 (§28) — annulation de vente : OPÉRATION INVERSE append-only
  // (jamais de DELETE/UPDATE de la vente). Le payload porte son clientId
  // (→ operation_id déterministe côté route) : la RPC merchant_reverse_sale
  // reconnaît le rejeu sur (merchant_id, operation_id) ET sur
  // (merchant_id, sale_client_id) — une vente ne s'annule qu'UNE fois.
  // FIFO : la reversal part APRÈS la vente qu'elle annule — au rejeu, la
  // vente est créée PUIS annulée, l'ordre reste cohérent. Un 422 (« Vente
  // introuvable » : la vente n'existera jamais côté serveur) est un rejet
  // définitif → conflit signalé, jamais de boucle.
  registerSyncHandler('sale-reversal', (payload) =>
    jsonRequest('/api/marchand/sale-reversals', 'POST', payload)
  )

  // ── Coopérative (MODE-921) ──────────────────────────────────────────
  // Cinq entités en file, rejeu verbatim (même URL/méthode que le live) :
  //  • 'cooperative-transaction' : écriture du président (en_attente côté
  //    serveur, validation = action explicite, jamais rejeu caché) ;
  //  • 'cooperative-stock-apport' : apport au pot commun — la RPC
  //    coop_apporter_stock reconnaît le rejeu sur client_id (idempotence
  //    migration 20260920100100) ;
  //  • 'cooperative-besoin' : dépôt d'un besoin d'achat groupé ;
  //  • 'cooperative-cotisation' : idempotence annuelle serveur (409 →
  //    conflit définitif, pas de double comptage) ;
  //  • 'cooperative-adhesion' : demande d'adhésion (409 si déjà active /
  //    en attente → conflit définitif).
  // NB : la DISTRIBUTION du pot commun ne passe PAS par la file — elle
  // opère sur un disponible verrouillé côté serveur (jamais de stock
  // négatif) ; la rejouer hors ligne pourrait échouer sur un disponible
  // déjà consommé, donc elle exige le réseau (voir cooperative-store).
  registerSyncHandler('cooperative-transaction', (payload) =>
    jsonRequest('/api/cooperatives/tresorerie', 'POST', payload)
  )

  registerSyncHandler('cooperative-stock-apport', (payload) =>
    jsonRequest('/api/cooperatives/stock', 'POST', payload)
  )

  registerSyncHandler('cooperative-besoin', (payload) =>
    jsonRequest('/api/cooperatives/besoins', 'POST', payload)
  )

  registerSyncHandler('cooperative-cotisation', (payload) =>
    jsonRequest('/api/cooperatives/cotisation', 'POST', payload)
  )

  registerSyncHandler('cooperative-adhesion', (payload) =>
    jsonRequest('/api/cooperatives/rejoindre', 'POST', payload)
  )

  // MODE-977 (AUDIT-007 G9) — les DÉCISIONS de gestion rejoignent la file :
  // sept entités de plus, rejeu verbatim (même URL/méthode que le live —
  // l'id cible voyage dans le payload pour reconstruire les URL
  // paramétrées) :
  //  • 'cooperative-membre-ajout' : admission d'un marchand (rejeu 409 si
  //    déjà admis → conflit définitif propre, pas de doublon) ;
  //  • 'cooperative-membre-statut' : accepter/suspendre/réactiver — PATCH
  //    idempotent (rejeu no-op 200 ; 404 = membre exclu entre-temps →
  //    conflit) ;
  //  • 'cooperative-membre-role' : promotion/rétrogradation (PATCH idem) ;
  //  • 'cooperative-membre-exclusion' : DELETE — la route lit le QUERY
  //    string (?cooperateurId=), le handler le reconstruit ;
  //  • 'cooperative-transaction-statut' : validation/annulation d'écriture
  //    (rejeu d'une écriture DÉJÀ traitée → 409 immutabilité = conflit,
  //    jamais une double validation) ;
  //  • 'cooperative-besoin-traitement' : dispatch (PATCH idempotent) ;
  //  • 'cooperative-besoins-consolidation' : consolidation (rejeu 200 avec
  //    nbConsolides: 0 — l'update ne cible que les en_attente restants).
  // NB : la DISTRIBUTION du pot commun reste HORS file (verrou serveur sur
  // le disponible, MODE-931 — voir cooperative-store).
  registerSyncHandler('cooperative-membre-ajout', (payload) =>
    jsonRequest('/api/cooperatives/membres', 'POST', payload)
  )

  registerSyncHandler('cooperative-membre-statut', (payload) =>
    jsonRequest(membreUrl(payload), 'PATCH', payload)
  )

  registerSyncHandler('cooperative-membre-role', (payload) =>
    jsonRequest(membreUrl(payload), 'PATCH', payload)
  )

  registerSyncHandler('cooperative-membre-exclusion', (payload) => {
    const p = payload as { membreId?: string; cooperateurId?: string }
    const membreId = encodeURIComponent(String(p.membreId ?? ''))
    const cooperateurId = encodeURIComponent(String(p.cooperateurId ?? ''))
    return jsonRequest(`/api/cooperatives/membres/${membreId}?cooperateurId=${cooperateurId}`, 'DELETE', payload)
  })

  registerSyncHandler('cooperative-transaction-statut', (payload) => {
    const p = payload as { transactionId?: string }
    const transactionId = encodeURIComponent(String(p.transactionId ?? ''))
    return jsonRequest(`/api/cooperatives/tresorerie/${transactionId}`, 'PATCH', payload)
  })

  registerSyncHandler('cooperative-besoin-traitement', (payload) => {
    const p = payload as { besoinId?: string }
    const besoinId = encodeURIComponent(String(p.besoinId ?? ''))
    return jsonRequest(`/api/cooperatives/besoins/${besoinId}`, 'PATCH', payload)
  })

  registerSyncHandler('cooperative-besoins-consolidation', (payload) =>
    jsonRequest('/api/cooperatives/besoins/consolider', 'POST', payload)
  )

  // MODE-979 (DET-COOP-008) — choix de la commune de la coopérative par
  // le président (PATCH idempotent, rejeu verbatim : la route lit le
  // QUERY string ?cooperateurId= et le body { communeId }).
  registerSyncHandler('cooperative-commune', (payload) => {
    const p = payload as { cooperateurId?: string }
    const cooperateurId = encodeURIComponent(String(p.cooperateurId ?? ''))
    return jsonRequest(`/api/cooperatives/commune?cooperateurId=${cooperateurId}`, 'PATCH', payload)
  })

  // MODE-979 (DET-COOP-008) — commune déclarée par le PRODUCTEUR (PATCH
  // idempotent, rejeu verbatim : QUERY ?producteurId= + body { communeId }).
  registerSyncHandler('producteur-commune', (payload) => {
    const p = payload as { producteurId?: string }
    const producteurId = encodeURIComponent(String(p.producteurId ?? ''))
    return jsonRequest(`/api/producteur/profil/commune?producteurId=${producteurId}`, 'PATCH', payload)
  })
}
