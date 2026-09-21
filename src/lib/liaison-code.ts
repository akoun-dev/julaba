import { createHash, randomBytes } from 'crypto'

/**
 * MODE-937 (AUDIT-003 S-04) — codes de liaison appareil one-shot.
 *
 * Un appareil ne lie plus un compte en présentant son ID (devinable —
 * l'audit a montré qu'un tiers connaissant l'id d'un coopérateur ou d'un
 * identificateur pouvait s'approprier le compte via /api/session/claim) :
 * il présente un CODE DE LIAISON à usage unique, émis :
 *   - par les routes de login après un code vérifié (TTL 10 min) ;
 *   - par le back-office identificateur (TTL 30 jours, pour qu'un agent
 *     lie son appareil sans jamais avoir de credential serveur).
 *
 * Format lisible et dictable : « ABCD-EFGH » — 8 lettres d'un alphabet
 * SANS I ni O (confusion visuelle à la dictée), stocké en sha256 (le code
 * en clair ne vit que le temps de la réponse HTTP), consommé ATOMIQUEMENT
 * en SQL (update ... where consumed_at is null returning — un seul appel
 * gagne, fin de la course, leçon I-07).
 *
 * Ce module est volontairement PUR (aucun import Next/Supabase).
 */

/** 24 lettres sans I ni O — jamais de « ma lettre c'est un I ou un l ? ». */
export const LIAISON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export const LIAISON_CODE_LENGTH = 8
export const LIAISON_TTL_LOGIN_MS = 10 * 60 * 1000
export const LIAISON_TTL_BACKOFFICE_MS = 30 * 24 * 60 * 60 * 1000

/** Source d'aléa injectable (tests) ; par défaut crypto.randomBytes. */
export type LiaisonRandomSource = (byteCount: number) => Uint8Array

/** Génère un code au format « ABCD-EFGH ». */
export function generateLiaisonCode(rng: LiaisonRandomSource = (n) => randomBytes(n)): string {
  const bytes = rng(LIAISON_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < LIAISON_CODE_LENGTH; i++) {
    // Rejet modulo-biaisé : l'alphabet (24) ne divise pas 256, on échantillonne
    // jusqu'à tomber dans la zone répartie uniformément (rejection sampling).
    code += LIAISON_ALPHABET[bytes[i] % LIAISON_ALPHABET.length]
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/**
 * Normalise une saisie (dictée, copier-coller, SMS) vers « ABCD-EFGH » :
 * lettres seules conservées, majuscules, 8 exactement exigées — null sinon.
 */
export function normalizeLiaisonCode(input: string): string | null {
  if (typeof input !== 'string') return null
  const letters = input.toUpperCase().replace(/[^A-Z]/g, '')
  if (letters.length !== LIAISON_CODE_LENGTH) return null
  if (!/^[A-Z]+$/.test(letters)) return null
  return `${letters.slice(0, 4)}-${letters.slice(4)}`
}

/** sha256 hex du code SANS séparateurs, en majuscules — format stocké en base. */
export function hashLiaisonCode(code: string): string {
  return createHash('sha256').update(code.replace(/[^A-Za-z]/g, '').toUpperCase()).digest('hex')
}
