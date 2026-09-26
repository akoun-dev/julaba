import type { Dossier } from '@/lib/stores/identificateur-store'
import { useAppStore } from '@/lib/stores/app-store'
import { claimDeviceSession } from '@/lib/claim-device-session'
import { queuePendingSync } from '@/lib/offline-db'

function generateFallbackDossierNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `ID-${year}-${rand}`
}

export type SubmitStatus = 'synced' | 'queued' | 'lost'

// DET-COOP-007 (MODE-978) — grammaire agent du verdict d'adhésion. PUR :
// aucune dépendance, testée directement. null = rien à dire (pas
// d'intention exprimée). Le dossier reste soumis dans TOUS les cas —
// ces phrases informent, elles ne masquent jamais un échec d'adhésion.
export function messageAdhesionCoop(
  verdict: string | undefined,
  coopNom: string | undefined
): { titre: string; description: string } | null {
  const nom = coopNom?.trim() || 'la coopérative choisie'
  switch (verdict) {
    case 'creee':
      return { titre: 'Adhésion coopérative enregistrée', description: `Le marchand est désormais membre actif de ${nom}.` }
    case 'deja_membre':
      return { titre: 'Adhésion déjà en place', description: `Ce marchand figure déjà dans ${nom} — aucune modification n'a été faite.` }
    case 'deja_actif_ailleurs':
      return { titre: 'Marchand déjà membre ailleurs', description: 'Il a déjà une adhésion active dans une autre coopérative — il n\'a pas été déplacé.' }
    case 'coop_absente':
      return { titre: 'Coopérative introuvable', description: 'La coopérative choisie n\'existe plus ou est désactivée — l\'adhésion n\'a pas été créée.' }
    case 'erreur':
      return { titre: 'Adhésion non créée', description: 'Le dossier est bien envoyé, mais l\'adhésion n\'a pas pu être créée — le président peut l\'ajouter manuellement.' }
    default:
      return null
  }
}

export interface SubmitOutcome {
  status: SubmitStatus
  /** User-facing explanation, only set when status === 'lost'. */
  reason?: string
  /** MODE-937 — code de liaison one-shot (30 j) du compte provisionné,
   *  renvoyé par le serveur lors d'une soumission synced ; affiché une
   *  seule fois à l'agent pour qu'il le communique à l'acteur enrôlé. */
  codeLiaison?: string
  /** DET-COOP-007 (MODE-978) — verdict honnête de l'adhésion automatique
   *  (marchand + intention cochée) : creee | deja_membre | deja_actif_ailleurs
   *  | coop_absente | erreur. Absent (undefined) quand l'intention n'était
   *  pas exprimée. Le message agent est dérivé dans messageAdhesionCoop. */
  adhesionCooperative?: string
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
    // DET-COOP-007 (MODE-978) — l'intention d'adhésion ne part que pour un
    // marchand, avec la coopérative ciblée. Les brouillons pré-update
    // (champ absent) restent soumissibles : undefined = pas d'adhésion.
    estMembreCooperative: dossier.actorType === 'marchand' ? (dossier.estMembreCooperative ?? false) : undefined,
    cooperativeId: dossier.actorType === 'marchand' && dossier.estMembreCooperative ? dossier.cooperativeId : undefined,
    identificateurId,
    identificateurName: dossier.agentName,
    phone: dossier.phone,
    hasPhoto: !!dossier.photoBase64,
    hasGps: !!dossier.gps,
    // AUDIT-013 (MODE-1014) — les pièces partent RÉELLEMENT, pas seulement
    // leurs indicateurs : images (DataURLs base64 capturées au wizard) et
    // coordonnées GPS complètes. Les has_* ci-dessus restent des indicateurs
    // dérivés (jamais un substitut au fichier). Le serveur valide (2 Mo/pièce,
    // JPEG/PNG/WebP) et dépose dans Storage ; seul le chemin voyage ensuite
    // en DB. CNI scannée à l'étape 1 : les numéros lus par OCR partent
    // toujours, cette fois AVEC les images elles-mêmes.
    hasCniRecto: !!dossier.cniRecto,
    hasCniVerso: !!dossier.cniVerso,
    cniNumero: dossier.cniNumero || undefined,
    nni: dossier.nni || undefined,
    // GPSCoords (store) porte lon ; le fil porte la convention DB lng.
    // accuracy n'est transmis que si mesurée (champ optionnel honnête).
    gps: dossier.gps
      ? {
          lat: dossier.gps.lat,
          lng: dossier.gps.lon,
          ...(dossier.gps.accuracy !== undefined ? { accuracy: dossier.gps.accuracy } : {}),
        }
      : undefined,
    photoBase64: dossier.photoBase64 || undefined,
    cniRecto: dossier.cniRecto || undefined,
    cniVerso: dossier.cniVerso || undefined,
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

  const attemptSubmit = async (): Promise<{ ok: true; codeLiaison?: string; adhesionCooperative?: string } | { ok: false; message: string; httpStatus?: number }> => {
    const res = await fetch('/api/backoffice/enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrolmentPayload),
    })
    if (res.ok) {
      const body = await res.json().catch(() => null) as { codeLiaison?: string; adhesionCooperative?: string } | null
      return { ok: true, codeLiaison: body?.codeLiaison || undefined, adhesionCooperative: body?.adhesionCooperative || undefined }
    }
    const body = await res.json().catch(() => null)
    if (res.status >= 500) console.error('[submitDossierToServer]', res.status, body)
    return { ok: false, message: body?.erreur || `Erreur ${res.status}`, httpStatus: res.status }
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

    if (result.ok) return { status: 'synced', codeLiaison: result.codeLiaison, adhesionCooperative: result.adhesionCooperative }

    // MODE-943 (AUDIT-003 F-19) — FIN du « lost » assumé : un échec
    // RÉSEAU (hors ligne, flakiness) ou un 5xx transitoire met le dossier
    // en FILE offline (handler 'ident-dossier', rejeu verbatim du POST).
    // Le statut 'queued' promis par le contrat existe enfin : l'agent voit
    // que son dossier partira au retour du réseau au lieu de croire à une
    // perte. Les refus DÉFINITIFS (validation, session expirée après
    // re-claim) restent des 'lost' parlés — rejouer ne les réussira jamais.
    const reseauIndisponible = !(result.message.startsWith('Champs obligatoires'))
      && !DEVICE_SESSION_ERRORS.has(result.message)
    const reseau5xx = (result.httpStatus ?? 0) >= 500
    if (reseauIndisponible || reseau5xx) {
      // AUDIT-013 (MODE-1014) — le payload en file est le MÊME que le live :
      // médias inclus (DataURLs + GPS). La file IndexedDB supporte ces
      // volumes sans souci ; le repli localStorage peut, lui, échouer en
      // quota sur de gros dossiers — queuePendingSync le dit honnêtement
      // ({ ok: false }), traduit ici en 'lost' parlé (jamais de silence).
      const queued = await queuePendingSync('ident-dossier', enrolmentPayload)
      if (queued.ok) return { status: 'queued' }
      // File indisponible (stockage local saturé) : perte assumée et dite.
      return { status: 'lost', reason: 'Stockage local indisponible — le dossier n\'a pas pu être mis en attente. Réessayez.' }
    }

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
    // MODE-943 (F-19) — exception réseau (hors ligne, fetch rejeté) :
    // le dossier part en file au lieu d'être perdu. Si MÊME la file est
    // indisponible, la perte est dite (jamais de silence).
    console.warn('[submitDossierToServer] réseau indisponible — mise en file', err)
    try {
      const queued = await queuePendingSync('ident-dossier', enrolmentPayload)
      if (queued.ok) return { status: 'queued' }
    } catch {
      // filet : queuePendingSync ne jette pas, mais rien ne doit sortir du catch
    }
    return { status: 'lost', reason: 'Stockage local indisponible — le dossier n’a pas pu être mis en attente. Réessayez.' }
  }
}
