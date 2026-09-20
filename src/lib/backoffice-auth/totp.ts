import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto'

// TOTP RFC-6238 (HMAC-SHA1, 6 chiffres, pas de 30 s) — MODE-934, AUDIT-003 S-02.
//
// Contexte (AUDIT-003) : le challenge MFA du back-office hashait un code à 6
// chiffres généré côté serveur mais AUCUN canal ne le livrait (pas de
// mailer/SMS dans le dépôt) — en production, la connexion back-office était
// impossible hors mode test. La bascule vers TOTP supprime cette dépendance :
// le facteur de possession devient une application d'authentification
// (Google Authenticator, Authy…) alimentée par un secret provisionné à la
// première connexion, offline, sans infrastructure d'envoi.
//
// Implémentation maison assumée (NORM : aucune nouvelle dépendance) — la
// logique est testée contre les vecteurs officiels du RFC 6238 (§B, HMAC-SHA1)
// et du RFC 4226 (appendix D) dans src/lib/__tests__/totp.test.ts.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_PERIOD_S = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1 // tolère ±1 pas (dérive d'horloge modérée)

// ── Base32 (RFC 4648) ────────────────────────────────────────────────────

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// ── HOTP (RFC 4226) / TOTP (RFC 6238) ───────────────────────────────────

function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
  counterBuf.writeUInt32BE(counter >>> 0, 4)
  const hmac = createHmac('sha1', secret).update(counterBuf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

/** Code TOTP attendu pour un secret base32 à l'instant `timeMs` (ms). */
export function totpAt(secretBase32: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / TOTP_PERIOD_S)
  return hotp(base32Decode(secretBase32), counter)
}

/** Pas temporel courant (pour les tests). */
export function totpStepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD_S)
}

export type TotpVerdict =
  | { ok: true; step: number }
  | { ok: false; reason: 'format' | 'mismatch' | 'replay' }

/**
 * Vérifie un code TOTP soumis, avec fenêtre ±TOTP_WINDOW pas et garde de
 * rejeu : un pas de temps déjà consommé (<= lastStep) est refusé, même si
 * le code correspond — un code intercepté n'est pas rejouable.
 * Comparaison à temps constant (timingSafeEqual).
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastStep: number | null,
  window = TOTP_WINDOW
): TotpVerdict {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'format' }
  const secret = base32Decode(secretBase32)
  if (secret.length === 0) return { ok: false, reason: 'format' }

  const currentStep = Math.floor(nowMs / 1000 / TOTP_PERIOD_S)
  for (let offset = -window; offset <= window; offset++) {
    const step = currentStep + offset
    const expected = hotp(secret, step)
    const a = Buffer.from(expected)
    const b = Buffer.from(code)
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // Le code correspond : s'il pointe sur un pas déjà consommé, c'est un
      // rejeu (code intercepté réutilisé) — refus explicite, jamais validé.
      if (lastStep !== null && step <= lastStep) return { ok: false, reason: 'replay' }
      return { ok: true, step }
    }
  }
  return { ok: false, reason: 'mismatch' }
}

// ── Provisioning ─────────────────────────────────────────────────────────

/** Nouveau secret TOTP : 20 octets aléatoires (160 bits, recommandation RFC 4226 §4). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** URI otpauth:// compatible Google Authenticator / Authy / Aegis…
 *  Issuer volontairement ASCII (les encodeurs QR/authenticators gèrent mal
 *  les accents) ; encodage manuel %20 — URLSearchParams produirait « + ». */
export function buildOtpauthUri(secretBase32: string, account: string, issuer = 'Julaba Backoffice'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = [
    `secret=${secretBase32}`,
    `issuer=${encodeURIComponent(issuer)}`,
    'algorithm=SHA1',
    `digits=${TOTP_DIGITS}`,
    `period=${TOTP_PERIOD_S}`,
  ].join('&')
  return `otpauth://totp/${label}?${params}`
}

// ── Codes de récupération (fallback perte de l'application) ─────────────

export const RECOVERY_CODE_COUNT = 8

/** Code lisible « XXXX-XXXX » sur l'alphabet base32 (32^8 ≈ 1,1 × 10^12). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): Array<{ code: string; hash: string }> {
  const codes: Array<{ code: string; hash: string }> = []
  const seen = new Set<string>()
  while (codes.length < count) {
    const raw = base32Encode(randomBytes(5)) // 40 bits → 8 caractères base32
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`
    if (seen.has(code)) continue
    seen.add(code)
    codes.push({ code, hash: sha256Hex(normalizeRecoveryCode(code)) })
  }
  return codes
}

/** Normalise une saisie de code de récupération (casse, espaces, tirets). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

export function isRecoveryCodeFormat(input: string): boolean {
  return normalizeRecoveryCode(input).length === 8
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Retourne l'INDEX dans `hashedCodes` du code de récupération correspondant,
 * ou -1. La comparaison hash→hash à temps constant est inutile ici (les
 * hashes ne sont pas secrets entre eux) ; la consommation se fait par index.
 */
export function findRecoveryCodeIndex(code: string, hashedCodes: string[]): number {
  const hash = sha256Hex(normalizeRecoveryCode(code))
  const index = hashedCodes.indexOf(hash)
  return index
}
