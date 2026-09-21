import { describe, it, expect } from 'vitest'

/**
 * simpleHash (djb2) — propriétés de base.
 *
 * AUDIT-005 : la cohérence avec les valeurs du SEED est retirée — le seed
 * ne stocke plus de djb2 (format scrypt:<salt>:<hash>, cf.
 * seed-pin-hashes.test.ts). djb2 reste utilisé UNIQUEMENT côté client pour
 * le cache local du PIN (ident-auth-screen), jamais côté serveur.
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString()
}

describe('simpleHash — propriétés de base', () => {
  it('hash vide = 0', () => {
    expect(simpleHash('')).toBe('0')
  })

  it('hash déterministe', () => {
    expect(simpleHash('1234')).toBe(simpleHash('1234'))
  })

  it('hash différent pour entrées différentes', () => {
    expect(simpleHash('1234')).not.toBe(simpleHash('5678'))
  })

  it('retourne une chaîne numérique', () => {
    const result = simpleHash('test')
    expect(Number.isInteger(Number(result))).toBe(true)
  })
})
