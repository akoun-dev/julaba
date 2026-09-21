import type { Dossier } from '@/lib/stores/identificateur-store'
import { useAppStore } from '@/lib/stores/app-store'
import { claimDeviceSession } from '@/lib/claim-device-session'

function generateFallbackDossierNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `ID-${year}-${rand}`
}

export type SubmitStatus = 'synced' | 'queued' | 'lost'

export interface SubmitOutcome {
  status: SubmitStatus
  /** User-facing explanation, only set when status === 'lost'. */
  reason?: string
}

// The device-session cookie (see device-session.ts) is what lets the server
// tell a legitimate identificateur request from anyone who simply knows the
// account's id — it's claimed right after login (app-store.ts's setAuth),
// but that claim runs in the background and can fail (a network blip, the
// server briefly down) without the agent ever seeing it. When that happens
// every later request looks unauthenticated to the server even though the
// agent is clearly logged in on-device. These are exactly the failures
// requireDeviceOwner (require-owner.ts) reports back.
const DEVICE_SESSION_ERRORS = new Set([
  'Identifiant requis',
  'Session appareil requise',
  'Accès refusé à cette ressource',
])

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
 * tell the agent when it's 'lost' instead of assuming it was queued. When
 * 'lost', `reason` carries a message safe to show the agent directly.
 */
export async function submitDossierToServer(dossier: Dossier): Promise<SubmitOutcome> {
  // Exactly one auth method is sent even if the identificateur filled in more
  // than one card in "Autorisation" — schéma wins first since it's the
  // recommended method, then PIN, then visual code.
  const authMethod = dossier.patternHash ? 'pattern' : dossier.pinHash ? 'pin' : dossier.visualCodeHash ? 'visual' : undefined

  // Old brouillons created before addDossier started generating numbers may
  // still have dossierNumber: '' — fall back to a generated number so the
  // server validation (which requires dossierId) doesn't reject the request.
  const dossierNumber = dossier.dossierNumber || generateFallbackDossierNumber()

  const identificateurId = useAppStore.getState().merchantId

  const enrolmentPayload = {
    dossierId: dossierNumber,
    actorName: `${dossier.firstName} ${dossier.lastName}`.trim(),
    firstName: dossier.firstName,
    lastName: dossier.lastName,
    sexe: dossier.sexe,
    actorType: dossier.actorType,
    zone: dossier.zone,
    // ⚠ Réparation du trou de collecte : l'activité (obligatoire dans le
    // wizard) et la classification marchand étaient silencieusement
    // abandonnées ici — le serveur ne les recevait jamais.
    activite: dossier.activite || undefined,
    categorieMarchand: dossier.actorType === 'marchand' ? (dossier.categorieMarchand ?? undefined) : undefined,
    typeCommerce: dossier.actorType === 'marchand' ? dossier.typeCommerce : undefined,
    nomCommerce: dossier.actorType === 'marchand' ? (dossier.nomCommerce || undefined) : undefined,
    identificateurId,
    identificateurName: dossier.agentName,
    phone: dossier.phone,
    hasPhoto: !!dossier.photoBase64,
    hasGps: !!dossier.gps,
    // CNI scannée à l'étape 1 : seuls les numéros lus par OCR et les
    // indicateurs de présence des photos partent au backoffice — les
    // images elles-mêmes restent locales, comme photoBase64.
    hasCniRecto: !!dossier.cniRecto,
    hasCniVerso: !!dossier.cniVerso,
    cniNumero: dossier.cniNumero || undefined,
    nni: dossier.nni || undefined,
    authMethod,
    // MODE-936 (S-03) : le code BRUT part au serveur (hachage scrypt côté
    // serveur) ; les anciens champs hashés restent envoyés pour que les
    // brouillons pré-update se soumettent encore (re-hash transparent du
    // compte au premier login du nouvel acteur).
    pin: authMethod === 'pin' ? dossier.pin : undefined,
    pattern: authMethod === 'pattern' ? dossier.pattern : undefined,
    visualCode: authMethod === 'visual' ? dossier.visualCode : undefined,
    pinHash: authMethod === 'pin' ? dossier.pinHash : undefined,
    patternHash: authMethod === 'pattern' ? dossier.patternHash : undefined,
    visualCodeHash: authMethod === 'visual' ? dossier.visualCodeHash : undefined,
  }

  const attemptSubmit = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    const res = await fetch('/api/backoffice/enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrolmentPayload),
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => null)
    if (res.status >= 500) console.error('[submitDossierToServer]', res.status, body)
    return { ok: false, message: body?.erreur || `Erreur ${res.status}` }
  }

  try {
    let result = await attemptSubmit()

    // The device wasn't recognized as this identificateur's — most often
    // because the claim right after login never landed. Re-claim and retry
    // once before giving up; this recovers silently in the common case
    // instead of forcing the agent to log out and back in.
    if (!result.ok && DEVICE_SESSION_ERRORS.has(result.message) && identificateurId) {
      await claimDeviceSession('identificateur', identificateurId)
      result = await attemptSubmit()
    }

    if (result.ok) return { status: 'synced' }

    if (!result.message.startsWith('Champs obligatoires')) {
      console.warn('[submitDossierToServer] lost', result.message)
    }

    const reason = DEVICE_SESSION_ERRORS.has(result.message)
      ? 'Votre session s’est déconnectée sur cet appareil. Déconnectez-vous puis reconnectez-vous, ensuite réessayez.'
      : result.message.startsWith('Champs obligatoires')
        ? result.message
        : undefined

    return { status: 'lost', reason }
  } catch (err) {
    console.warn('[submitDossierToServer] lost', err)
    return { status: 'lost' }
  }
}
