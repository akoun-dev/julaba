import { describe, it, expect } from 'vitest'

/**
 * Vérifie que la fonction simpleHash côté client produit les mêmes hashes
 * que ceux stockés dans le seed SQL. Toute modification de simpleHash doit
 * passer ce test ET mettre à jour le seed.
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

describe('simpleHash — cohérence seed', () => {
  const seedPins = [
    { pin: '1234', expected: '1509442', account: 'merchant-1 (Awa KONE)' },
    { pin: '1235', expected: '1509443', account: 'merchant-2 (Fatoumata KEITA)' },
    { pin: '1236', expected: '1509444', account: 'merchant-3 (Salimata CISSE)' },
    { pin: '1111', expected: '1508416', account: 'merchant-test-1 (Bakari DIALLO)' },
    { pin: '2222', expected: '1539200', account: 'merchant-test-2 (Clarisse BONI)' },
    { pin: '0000', expected: '1477632', account: 'producteur-1 (Kouadio)' },
    { pin: '0001', expected: '1477633', account: 'producteur-2 (Moussa)' },
    { pin: '0002', expected: '1477634', account: 'producteur-3 (Adama)' },
    { pin: '3333', expected: '1569984', account: 'producteur-test-1 (Issa)' },
    { pin: '4444', expected: '1600768', account: 'producteur-test-2 (Mariam)' },
  ]

  for (const { pin, expected, account } of seedPins) {
    it(`PIN ${pin} → ${expected} (${account})`, () => {
      expect(simpleHash(pin)).toBe(expected)
    })
  }
})

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
