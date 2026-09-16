import { queuePendingSync, flushAllPendingSync } from '@/lib/offline-db'

export type ClaimSubjectType = 'merchant' | 'producteur' | 'identificateur'

/**
 * Client-side counterpart to POST /api/session/claim (see device-session.ts
 * for why this exists). Called right after a local login/registration
 * succeeds — safe to call repeatedly (a claim from the same device that
 * already owns the subject is just a renewal). Offline or on failure, the
 * claim is queued like any other write so it lands the moment the device
 * reconnects, instead of leaving every subsequent marchand/producteur/
 * identificateur API call rejected until the user happens to relaunch online.
 */
export async function claimDeviceSession(subjectType: ClaimSubjectType, id: string): Promise<void> {
  const payload = { subjectType, id }
  try {
    const res = await fetch('/api/session/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok && res.status !== 409) throw new Error(`Erreur ${res.status}`)
    // The device is now server-bound: everything queued before the claim
    // existed (previous session's writes, or this claim itself queued by
    // an earlier offline attempt) is replayable — flush immediately instead
    // of waiting for the next network transition.
    flushAllPendingSync().catch(() => {})
  } catch {
    const queued = await queuePendingSync('device-claim', payload)
    if (!queued.ok) {
      // Neither the live request nor the offline queue worked — this
      // device's claim genuinely didn't happen. Not surfaced to the user
      // here (this runs as a background reconciliation step after login,
      // with no natural place to show a failure), but logged loudly rather
      // than silently swallowed — the app-store.ts caller chains a
      // follow-up request on this that depends on the claim having set a
      // cookie, so a lost claim here can cascade.
      console.error('[claim-device-session] claim lost: neither synced nor queued', payload)
    }
  }
}
