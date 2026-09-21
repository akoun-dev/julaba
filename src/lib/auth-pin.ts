import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * MODE-936 (AUDIT-003 S-03) — vérification serveur du code d'authentification
 * des comptes identifiés (marchands, producteurs, coopérateurs).
 *
 * AVANT : le client calculait un djb2 32 bits du code (simpleHash) et le
 * serveur stockait/comparait ce hash TEL QUEL — un djb2 de PIN 4 chiffres se
 * bruteforce en 10 000 essais sans sel, et la fuite de la base = prise de
 * contrôle immédiate (le hash lui-même était rejouable sur le fil).
 *
 * APRÈS : le client envoie le code BRUT (canal HTTPS), le serveur vérifie
 * contre un hash scrypt salé — le MÊME format que le back-office
 * (backoffice-auth/password.ts : « scrypt:<saltHex>:<hashHex> », clé 64
 * octets, sel 16 octets). Les comptes enrôlés avant la bascule portent
 * encore l'ancien djb2 : verifyCode le reconnaît (branche legacy) et la
 * route de login re-hash transparentment après un succès (needsRehash).
 *
 * Ce module est volontairement PUR (aucun import Next/Supabase) pour rester
 * testable sous vitest (environment node), comme backoffice-auth/password.ts.
 */

const SCRYPT_PREFIX = 'scrypt'
const KEY_LENGTH = 64

/** Politique de verrouillage — compte : 5 échecs → 15 min de verrou. */
export const ACCOUNT_MAX_FAILURES = 5
export const ACCOUNT_WINDOW_MINUTES = 15
export const ACCOUNT_LOCK_MINUTES = 15
/** Politique de verrouillage — IP : 20 échecs en 5 min → 15 min de verrou. */
export const IP_MAX_FAILURES = 20
export const IP_WINDOW_MINUTES = 5
export const IP_LOCK_MINUTES = 15

/**
 * Hash scrypt salé d'un code brut. Format stocké :
 * "scrypt:<saltHex>:<hashHex>" — strictement le format du back-office,
 * pour qu'un seul outil (verifyCode ici comme verifyPassword BO) sache le
 * relire.
 */
export function hashCodeScrypt(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${SCRYPT_PREFIX}:${salt}:${hash}`
}

/** djb2 32 bits signé — réplique EXACTE du simpleHash client (auth-screens). */
export function djb2Legacy(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

function isScryptHash(stored: string): boolean {
  return stored.startsWith(`${SCRYPT_PREFIX}:`)
}

/** True si le hash stocké doit être re-haché en scrypt (legacy djb2). */
export function needsRehash(stored: string): boolean {
  return Boolean(stored) && !isScryptHash(stored)
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Vérifie un code brut contre le hash stocké :
 *  - format scrypt ("scrypt:<salt>:<hash>") → scryptSync + comparaison
 *    à temps constant ;
 *  - format legacy (djb2 décimal signé, comptes pré-bascule) → djb2 du
 *    candidat + comparaison à temps constant ; la route re-hashera après
 *    le succès (needsRehash) — jamais la vérification elle-même.
 */
export function verifyCode(plain: string, stored: string): boolean {
  if (!stored) return false
  if (!isScryptHash(stored)) {
    return timingSafeStringEqual(djb2Legacy(plain), stored)
  }
  const [, salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const candidate = scryptSync(plain, salt, KEY_LENGTH)
  const expected = Buffer.from(hashHex, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

/**
 * Portée du verrou pour un compte donné (une ligne par compte dans
 * auth_lockouts — la table porte le compteur d'échecs et le verrou).
 */
export function accountScope(table: string, id: string): string {
  return `${table}:${id}`
}

/**
 * Portée du verrou réseau. L'IP est stockée telle quelle dans
 * auth_lockouts (table de sécurité à durée de vie courte, purge au succès)
 * ; « inconnu » regroupe les appelants sans X-Forwarded-For (réseau interne).
 */
export function ipScope(ip: string): string {
  return `ip:${ip}`
}

/**
 * Extrait l'IP appelante d'un en-tête X-Forwarded-For (premier maillon,
 * posé par le reverse proxy Caddy en production). Retourne le repli
 * (« inconnu ») si l'en-tête est absent ou vide — jamais une IP forgée
 * à partir d'autre chose.
 */
export function normalizeIp(xff: string | null, fallback = 'inconnu'): string {
  if (!xff) return fallback
  const first = xff.split(',')[0]?.trim()
  return first || fallback
}
