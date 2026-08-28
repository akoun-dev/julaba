import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SCRYPT_PREFIX = 'scrypt'
const KEY_LENGTH = 64

/**
 * Hash a plaintext password with scrypt (salted, one-way). Stored format:
 * "scrypt:<saltHex>:<hashHex>".
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${SCRYPT_PREFIX}:${salt}:${hash}`
}

function isScryptHash(stored: string): boolean {
  return stored.startsWith(`${SCRYPT_PREFIX}:`)
}

/**
 * Verify a plaintext password against a stored hash. Supports legacy
 * plaintext-stored passwords (pre-dating scrypt hashing) via direct
 * comparison so existing accounts keep working; callers should rehash
 * with hashPassword() and persist it after a successful legacy match.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false
  if (!isScryptHash(stored)) {
    // Legacy plaintext account — constant-time compare, then let the
    // caller upgrade the stored hash.
    const a = Buffer.from(plain)
    const b = Buffer.from(stored)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  const [, salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const candidate = scryptSync(plain, salt, KEY_LENGTH)
  const expected = Buffer.from(hashHex, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function needsRehash(stored: string): boolean {
  return !isScryptHash(stored)
}
