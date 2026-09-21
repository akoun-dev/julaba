/**
 * MODE-937 (S-04) — client de liaison appareil.
 *
 * Deux chemins vers POST /api/session/claim :
 *  - claimDeviceSession(subjectType, id) : RENOUVELLEMENT pur — ne réussit
 *    que si l'appareil est déjà lié au compte (cookie prouve la possession).
 *    Si le serveur répond 403/409, l'appareil n'est PAS lié : `needsCode`
 *    signale à l'écran qu'il faut un code de liaison (S-04 : connaître un
 *    id ne lie plus jamais un compte).
 *  - claimDeviceSessionWithCode(code) : PREMIÈRE liaison par code de
 *    liaison one-shot « ABCD-EFGH » (émis par les logins 10 min ou le
 *    back-office 30 j — voir lib/liaison-code.ts).
 *
 * Hors ligne, les deux se mettent en file comme n'importe quelle écriture
 * (handlers 'device-claim' / 'device-claim-code') pour aboutir dès la
 * reconnexion, au lieu de laisser chaque appel API suivant 401.
 */

import { queuePendingSync, flushAllPendingSync } from '@/lib/offline-db'

export type ClaimSubjectType = 'merchant' | 'producteur' | 'identificateur' | 'cooperateur'

export type ClaimOutcome =
  | { ok: true }
  | { ok: false; needsCode: boolean; queued: boolean }

async function postClaim(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number } | null> {
  try {
    const res = await fetch('/api/session/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return null
  }
}

/** Réconciliation commune : tout ce qui était en file devient rejouable. */
function onClaimSuccess(): void {
  flushAllPendingSync().catch(() => {})
}

/** File offline partagée (payload + clé), verdict selon la cause du repli. */
async function queueClaim(key: 'device-claim' | 'device-claim-code', payload: Record<string, unknown>): Promise<ClaimOutcome> {
  const queued = await queuePendingSync(key, payload)
  if (!queued.ok) {
    // Ni la requête live ni la file n'ont fonctionné — log bruyant plutôt
    // que silence : un claim perdu casse tous les appels API suivants.
    console.error('[claim-device-session] claim perdu : ni synchronisé ni mis en file', payload)
    throw new Error('claim lost')
  }
  return { ok: false, needsCode: false, queued: true }
}

export async function claimDeviceSession(subjectType: ClaimSubjectType, id: string): Promise<ClaimOutcome> {
  const payload = { subjectType, id }
  const result = await postClaim(payload)
  if (result?.ok) {
    onClaimSuccess()
    return { ok: true }
  }
  // 403 : aucune session existante (premier lien exigera un code) —
  // 409 : compte lié à un autre appareil (re-lien exigera un code aussi).
  if (result && (result.status === 403 || result.status === 409)) {
    return { ok: false, needsCode: true, queued: false }
  }
  return queueClaim('device-claim', payload)
}

export async function claimDeviceSessionWithCode(code: string): Promise<ClaimOutcome> {
  const payload = { code }
  const result = await postClaim(payload)
  if (result?.ok) {
    onClaimSuccess()
    return { ok: true }
  }
  // 401 (code invalide/consommé/expiré) et 429 (verrou IP) : définitifs,
  // rien à mettre en file — l'écran redemande la saisie.
  if (result && (result.status === 400 || result.status === 401 || result.status === 429)) {
    return { ok: false, needsCode: true, queued: false }
  }
  return queueClaim('device-claim-code', payload)
}
