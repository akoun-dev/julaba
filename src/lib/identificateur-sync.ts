import type { Dossier } from '@/lib/stores/identificateur-store'
import { queuePendingSync } from '@/lib/offline-db'
import { useAppStore } from '@/lib/stores/app-store'

/**
 * Sends a submitted dossier to the backoffice server; if that fails (offline,
 * flaky network), queues it locally instead of losing it — the agent must be
 * able to keep enrolling actors without a connection. Shared by both places a
 * dossier can be submitted: the wizard's own "Envoyer" step
 * (ident-identification-screen.tsx) and the quick "Soumettre" action on a
 * saved draft (ident-brouillons-screen.tsx).
 *
 * Returns true if it reached the server just now, false if it was queued.
 */
export async function submitDossierToServer(dossier: Dossier): Promise<boolean> {
  const enrolmentPayload = {
    dossierId: dossier.dossierNumber,
    actorName: `${dossier.firstName} ${dossier.lastName}`.trim(),
    actorType: dossier.actorType,
    zone: dossier.zone,
    identificateurId: useAppStore.getState().merchantId,
    identificateurName: dossier.agentName,
    phone: dossier.phone,
    hasPhoto: !!dossier.photoBase64,
    hasGps: !!dossier.gps,
  }
  try {
    const res = await fetch('/api/backoffice/enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrolmentPayload),
    })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return true
  } catch {
    await queuePendingSync('enrolment', enrolmentPayload)
    return false
  }
}
