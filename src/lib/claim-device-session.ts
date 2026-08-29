import { queuePendingSync } from '@/lib/offline-db'

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
  } catch {
    await queuePendingSync('device-claim', payload)
  }
}
