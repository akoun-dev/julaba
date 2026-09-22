/**
 * MODE-989 (DET-001 tranche 3) — logique pure de l'enrôlement
 * identificateur, extraite du wizard ident-identification-screen.
 *
 * Règles de la famille DET-001 : chaque corps est repris VERBATIM du
 * composant d'origine (seul le paramètre est nommé) ; le comportement est
 * verrouillé par des tests — pré-remplissage OCR « doux » (une valeur
 * saisie par l'agent n'est jamais écrasée), caps multi-select/documents,
 * validation d'identité par étape, mapping des erreurs GPS web, et le
 * djb2 local (jamais serveur — voir auth-pin.ts côté scrypt).
 */
import type { Dossier } from '@/lib/stores/identificateur-store'
import type { CniFields } from '@/lib/vision/document-ocr'

// Hash local djb2 — identique à l'auth marchand (auth-login-flow.ts) et au
// formulaire qu'il remplace ici ; NE JAMAIS l'utiliser côté serveur. Sert
// au pinHash/patternHash des brouillons (le BRUT part au serveur, MODE-936).
export const simpleHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}
export const patternToHash = (pattern: number[]) => simpleHash(pattern.join('-'))

/**
 * Validation de l'étape 2 (Photo & Identité) — corps verbatim du
 * validateStep2 du wizard ; le paramètre accepte null (dossier pas encore
 * initialisé) pour garder l'appel du composant à une expression.
 */
export const validateIdentiteDossier = (dossier: Dossier | null): string | null => {
  if (!dossier) return 'Dossier non disponible'
  if (!dossier.actorType) return 'Type d\'acteur obligatoire'
  if (!dossier.firstName.trim()) return 'Prénom obligatoire'
  if (!dossier.lastName.trim()) return 'Nom obligatoire'
  if (!dossier.phone.trim()) return 'Téléphone obligatoire'
  if (!dossier.activite) return 'Activité obligatoire'
  if (!dossier.zone) return 'Zone / Marché obligatoire'
  // La classification détaillant / semi-grossiste / grossiste est le
  // socle du profil marchand : sans elle, ni prix de gros ni recommandations
  // fournisseurs cohérentes côté app.
  if (dossier.actorType === 'marchand' && !dossier.categorieMarchand) {
    return 'Catégorie du marchand obligatoire'
  }
  // DET-COOP-007 : une adhésion cochée sans coopérative serait rejetée
  // par le serveur (400) — autant la refuser à la source, avec un
  // message qui dit quoi corriger.
  if (dossier.actorType === 'marchand' && dossier.estMembreCooperative && !dossier.cooperativeId) {
    return 'Coopérative obligatoire quand l’adhésion est cochée'
  }
  return null
}

/**
 * Pré-remplissage OCR « doux » — corps verbatim du setDossier de
 * runCniOcr : seuls les champs vides sont renseignés (une valeur saisie
 * par l'agent n'est jamais écrasée) ; sexe tolère l'alternative ??.
 */
export const fusionnerChampsCni = (prev: Dossier | null, fields: CniFields): Dossier | null =>
  prev
    ? {
        ...prev,
        lastName: prev.lastName.trim() || fields.lastName || prev.lastName,
        firstName: prev.firstName.trim() || fields.firstName || prev.firstName,
        sexe: prev.sexe ?? fields.sexe ?? prev.sexe,
        cniNumero: prev.cniNumero || fields.cniNumero,
        nni: prev.nni || fields.nni,
      }
    : prev

/**
 * Bascule d'un élément dans une sélection multiple bornée — extrait du
 * toggleProduit (cap 5 : produits principaux, cultures, domaines).
 * refuse = true quand l'ajout est refusé parce que le cap est atteint.
 */
export const basculeMulti = (
  current: string[],
  item: string,
  max = 5
): { next: string[] | null; refuse: boolean } => {
  if (current.includes(item)) {
    return { next: current.filter((p) => p !== item), refuse: false }
  }
  if (current.length >= max) {
    return { next: null, refuse: true }
  }
  return { next: [...current, item], refuse: false }
}

/**
 * Ajout d'un document au dossier — corps verbatim du setDossier de
 * handleDocumentAdd : la liste est bornée (max 10, slice final).
 */
export const avecDocumentAjoute = (
  prev: Dossier | null,
  docEntry: { name: string; base64: string; type: string; ocrText?: string },
  max = 10
): Dossier | null => {
  if (!prev) return prev
  const docs = [...(prev.documents || []), docEntry].slice(0, max)
  return { ...prev, documents: docs }
}

/**
 * Message + statut d'une erreur de géolocalisation web — extrait du
 * callback d'échec de captureGPS (codes GeolocationPositionError 1/2/3).
 */
export const erreurGpsWeb = (code: number): { message: string; statut: 'refused' | 'unavailable' } => {
  let message = 'Erreur lors de la capture de la position'
  if (code === 1) message = 'Permission de localisation refusée'
  if (code === 2) message = 'Position non disponible'
  if (code === 3) message = 'Délai de localisation expiré'
  return { message, statut: code === 1 ? 'refused' : 'unavailable' }
}
