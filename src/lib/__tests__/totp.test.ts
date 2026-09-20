import { describe, it, expect } from 'vitest'
import {
  base32Encode,
  base32Decode,
  totpAt,
  totpStepAt,
  verifyTotpCode,
  generateTotpSecret,
  buildOtpauthUri,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  isRecoveryCodeFormat,
  findRecoveryCodeIndex,
  TOTP_PERIOD_S,
} from '../backoffice-auth/totp'

// Vecteurs officiels RFC 6238 (§B) pour HMAC-SHA1, 6 chiffres.
// Secret : ASCII « 12345678901234567890 » (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
]

describe('base32 (RFC 4648)', () => {
  it('encode le secret RFC en base32 attendue', () => {
    expect(base32Encode(Buffer.from('12345678901234567890', 'ascii'))).toBe(RFC_SECRET)
  })

  it('décode la base32 RFC vers le secret original', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890')
  })

  it('roundtrip sur des tampons variés', () => {
    for (const size of [1, 5, 10, 20, 32]) {
      const buf = Buffer.alloc(size, 0xa5)
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
    }
  })

  it('ignore casse, espaces et tirets au décodage', () => {
    expect(base32Decode('gez dgn-bvgy').toString('ascii')).toBe(base32Decode('GEZDGNBVGY').toString('ascii'))
  })
})

describe('TOTP RFC 6238 (HMAC-SHA1, 6 chiffres)', () => {
  it.each(RFC_VECTORS)('t=%d s → code %s', (tSeconds, expected) => {
    expect(totpAt(RFC_SECRET, tSeconds * 1000)).toBe(expected)
  })

  it('le pas temporel avance de 1 toutes les 30 s', () => {
    expect(totpStepAt(0)).toBe(0)
    expect(totpStepAt(59_000)).toBe(1)
    expect(totpStepAt((TOTP_PERIOD_S * 3 + 5) * 1000)).toBe(3)
  })
})

describe('verifyTotpCode', () => {
  const T = 1_234_567_890_000 // ms arbitraire
  const step = totpStepAt(T)

  it('accepte le code du pas courant', () => {
    const code = totpAt(RFC_SECRET, T)
    expect(verifyTotpCode(RFC_SECRET, code, T, null)).toEqual({ ok: true, step })
  })

  it('tolère la fenêtre ±1 (dérive d\'horloge)', () => {
    const previous = totpAt(RFC_SECRET, (step - 1) * 30_000)
    expect(verifyTotpCode(RFC_SECRET, previous, T, null)).toEqual({ ok: true, step: step - 1 })
    const next = totpAt(RFC_SECRET, (step + 1) * 30_000)
    expect(verifyTotpCode(RFC_SECRET, next, T, null)).toEqual({ ok: true, step: step + 1 })
  })

  it('refuse un pas antérieur au dernier consommé (anti-rejeu)', () => {
    const previous = totpAt(RFC_SECRET, (step - 1) * 30_000)
    expect(verifyTotpCode(RFC_SECRET, previous, T, step - 1)).toEqual({ ok: false, reason: 'replay' })
  })

  it('accepte un pas strictement postérieur au dernier consommé', () => {
    const code = totpAt(RFC_SECRET, T)
    expect(verifyTotpCode(RFC_SECRET, code, T, step - 5).ok).toBe(true)
  })

  it('refuse un code erroné (raison mismatch)', () => {
    const real = totpAt(RFC_SECRET, T)
    const wrong = real === '000000' ? '000001' : '000000'
    expect(verifyTotpCode(RFC_SECRET, wrong, T, null)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('refuse un format non numérique ou de mauvaise longueur', () => {
    expect(verifyTotpCode(RFC_SECRET, '12345', T, null)).toEqual({ ok: false, reason: 'format' })
    expect(verifyTotpCode(RFC_SECRET, '1234567', T, null)).toEqual({ ok: false, reason: 'format' })
    expect(verifyTotpCode(RFC_SECRET, '12 456', T, null)).toEqual({ ok: false, reason: 'format' })
    expect(verifyTotpCode(RFC_SECRET, 'abcdef', T, null)).toEqual({ ok: false, reason: 'format' })
  })

  it('refuse un secret vide (format)', () => {
    expect(verifyTotpCode('', '123456', T, null)).toEqual({ ok: false, reason: 'format' })
  })
})

describe('provisioning', () => {
  it('génère un secret de 32 caractères base32 (160 bits)', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret)).toHaveLength(20)
  })

  it('génère des secrets uniques', () => {
    const a = generateTotpSecret()
    const b = generateTotpSecret()
    expect(a).not.toBe(b)
  })

  it('construit une URI otpauth conforme (label, secret, params)', () => {
    const uri = buildOtpauthUri(RFC_SECRET, 'admin@julaba.ci')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(encodeURIComponent('Julaba Backoffice:admin@julaba.ci'))
    expect(uri).toContain(`secret=${RFC_SECRET}`)
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
    expect(uri).toContain(encodeURIComponent('Julaba Backoffice'))
    // pas de « + » ambigu (URLSearchParams) dans les paramètres
    expect(uri).not.toContain('+')
  })

  it('le secret provisionné produit les codes attendus', () => {
    const secret = generateTotpSecret()
    const T = 1_700_000_000_000
    expect(verifyTotpCode(secret, totpAt(secret, T), T, null).ok).toBe(true)
  })
})

describe('codes de récupération', () => {
  it('en génère 8 au format XXXX-XXXX, uniques, hashés sha256', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(8)
    const seen = new Set<string>()
    for (const { code, hash } of codes) {
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      seen.add(code)
    }
    expect(seen.size).toBe(8)
  })

  it('normalise la saisie (casse, espaces, tirets)', () => {
    expect(normalizeRecoveryCode('abcd-2345')).toBe('ABCD2345')
    expect(normalizeRecoveryCode(' ab cd 23 45 ')).toBe('ABCD2345')
    expect(normalizeRecoveryCode('abcd2345')).toBe('ABCD2345')
  })

  it('isRecoveryCodeFormat distingue un code de récupération d\'un TOTP', () => {
    expect(isRecoveryCodeFormat('abcd-2345')).toBe(true)
    expect(isRecoveryCodeFormat('287082')).toBe(false)
    expect(isRecoveryCodeFormat('')).toBe(false)
  })

  it('retrouve le bon index du code consommé et rejette les autres', () => {
    const codes = generateRecoveryCodes()
    const hashes = codes.map((c) => c.hash)
    expect(findRecoveryCodeIndex(codes[3].code, hashes)).toBe(3)
    expect(findRecoveryCodeIndex(codes[3].code.toLowerCase(), hashes)).toBe(3)
    expect(findRecoveryCodeIndex('ZZZZ-9999', hashes)).toBe(-1)
  })

  it('un code consommé (retiré de la liste) ne marche plus', () => {
    const codes = generateRecoveryCodes()
    const hashes = codes.map((c) => c.hash)
    const consumed = hashes.findIndex((h) => h === codes[0].hash)
    hashes.splice(consumed, 1)
    expect(findRecoveryCodeIndex(codes[0].code, hashes)).toBe(-1)
  })
})
