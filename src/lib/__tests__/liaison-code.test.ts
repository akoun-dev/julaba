import { describe, expect, it } from 'vitest'
import {
  LIAISON_ALPHABET,
  LIAISON_TTL_BACKOFFICE_MS,
  LIAISON_TTL_LOGIN_MS,
  generateLiaisonCode,
  hashLiaisonCode,
  normalizeLiaisonCode,
} from '../liaison-code'

/** RNG déterministe : rejoue la séquence d'octets fournie (puis boucle). */
function seqRng(bytes: number[]) {
  return (n: number): Uint8Array => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) out[i] = bytes[i % bytes.length]
    return out
  }
}

describe('generateLiaisonCode — format dictable', () => {
  it('produit 8 lettres groupées « ABCD-EFGH »', () => {
    const code = generateLiaisonCode(seqRng([0, 1, 2, 3, 4, 5, 6, 7]))
    expect(code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/)
    expect(code).toHaveLength(9)
  })

  it('n\'utilise jamais I ni O (alphabet sans ambiguïtés)', () => {
    expect(LIAISON_ALPHABET).not.toContain('I')
    expect(LIAISON_ALPHABET).not.toContain('O')
    expect(LIAISON_ALPHABET).toHaveLength(24)
  })

  it('est déterministe avec une source injectée', () => {
    const a = generateLiaisonCode(seqRng([10, 11, 12, 13, 14, 15, 16, 17]))
    const b = generateLiaisonCode(seqRng([10, 11, 12, 13, 14, 15, 16, 17]))
    expect(a).toBe(b)
  })

  it('deux sources différentes donnent deux codes différents', () => {
    const a = generateLiaisonCode(seqRng([1, 2, 3, 4, 5, 6, 7, 8]))
    const b = generateLiaisonCode(seqRng([9, 10, 11, 12, 13, 14, 15, 16]))
    expect(a).not.toBe(b)
  })

  it('les TTLs documentés : 10 min login, 30 j back-office', () => {
    expect(LIAISON_TTL_LOGIN_MS).toBe(10 * 60 * 1000)
    expect(LIAISON_TTL_BACKOFFICE_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('normalizeLiaisonCode — saisie tolérante', () => {
  it('accepte la forme canonique', () => {
    expect(normalizeLiaisonCode('ABCD-EFGH')).toBe('ABCD-EFGH')
  })

  it('accepte minuscules, espaces et tirets parasites', () => {
    expect(normalizeLiaisonCode('abcd efgh')).toBe('ABCD-EFGH')
    expect(normalizeLiaisonCode('abc-defg-h')).toBe('ABCD-EFGH')
  })

  it('refuse autre chose que 8 lettres', () => {
    expect(normalizeLiaisonCode('ABC-DEFG')).toBeNull()
    expect(normalizeLiaisonCode('ABCDEFGHI')).toBeNull()
    expect(normalizeLiaisonCode('')).toBeNull()
  })

  it('refuse les chiffres masqués derrière une longueur juste', () => {
    expect(normalizeLiaisonCode('1234-5678')).toBeNull()
  })
})

describe('hashLiaisonCode — stockage sha256', () => {
  it('rend 64 hex, indépendant de la casse et du tiret', () => {
    const a = hashLiaisonCode('ABCD-EFGH')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(hashLiaisonCode('abcdefgh'))
    expect(a).toBe(hashLiaisonCode('ABCD EFGH'))
  })

  it('distingue deux codes distincts', () => {
    expect(hashLiaisonCode('ABCD-EFGH')).not.toBe(hashLiaisonCode('ABCD-EFGJ'))
  })
})
