import type { Dossier } from '@/lib/stores/identificateur-store'
import { useAppStore } from '@/lib/stores/app-store'

/**
 * Sends a submitted dossier to the backoffice server; if that fails (offline,
 * flaky network), queues it locally instead of losing it — the agent must be
 * able to keep enrolling actors without a connection. Shared by both places a
 * dossier can be submitted: the wizard's own "Envoyer" step
 * (ident-identification-screen.tsx) and the quick "Soumettre" action on a
 * saved draft (ident-brouillons-screen.tsx).
 *
 * Returns 'synced' if it reached the server just now, 'queued' if it was
 * saved to the offline queue for later, or 'lost' if neither happened —
 * the dossier is only actually safe on the first two, and the caller must
 * tell the agent when it's 'lost' instead of assuming it was queued.
 */
export async function submitDossierToServer(dossier: Dossier): Promise<'synced' | 'queued' | 'lost'> {
  // Exactly one auth method is sent even if the identificateur filled in more
  // than one card in "Autorisation" — schéma wins first since it's the
  // recommended method, then PIN, then visual code.
  const authMethod = dossier.patternHash ? 'pattern' : dossier.pinHash ? 'pin' : dossier.visualCodeHash ? 'visual' : undefined

  const enrolmentPayload = {
    dossierId: dossier.dossierNumber,
    actorName: `${dossier.firstName} ${dossier.lastName}`.trim(),
    firstName: dossier.firstName,
    actorType: dossier.actorType,
    zone: dossier.zone,
    identificateurId: useAppStore.getState().merchantId,
    identificateurName: dossier.agentName,
    phone: dossier.phone,
    hasPhoto: !!dossier.photoBase64,
    hasGps: !!dossier.gps,
    authMethod,
    pinHash: authMethod === 'pin' ? dossier.pinHash : undefined,
    patternHash: authMethod === 'pattern' ? dossier.patternHash : undefined,
    visualCodeHash: authMethod === 'visual' ? dossier.visualCodeHash : undefined,
  }
  try {
    const res = await fetch('/api/backoffice/enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrolmentPayload),
    })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return 'synced'
  } catch {
    return 'lost'
  }
}
