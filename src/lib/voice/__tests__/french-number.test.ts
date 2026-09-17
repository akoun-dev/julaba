import { describe, it, expect } from 'vitest'
import { numberToFrenchWords } from '../french-number'

describe('numberToFrenchWords', () => {
  it('convertit les cas de référence exigés', () => {
    expect(numberToFrenchWords(0)).toBe('zéro')
    expect(numberToFrenchWords(1)).toBe('un')
    expect(numberToFrenchWords(5)).toBe('cinq')
    expect(numberToFrenchWords(21)).toBe('vingt et un')
    expect(numberToFrenchWords(80)).toBe('quatre-vingts')
    expect(numberToFrenchWords(100)).toBe('cent')
    expect(numberToFrenchWords(1000)).toBe('mille')
    expect(numberToFrenchWords(1500)).toBe('mille cinq cents')
    expect(numberToFrenchWords(25000)).toBe('vingt-cinq mille')
    expect(numberToFrenchWords(100000)).toBe('cent mille')
    expect(numberToFrenchWords(1000000)).toBe('un million')
  })

  it('gère la famille des dizaines irrégulières (70/80/90)', () => {
    expect(numberToFrenchWords(70)).toBe('soixante-dix')
    expect(numberToFrenchWords(71)).toBe('soixante et onze')
    expect(numberToFrenchWords(79)).toBe('soixante-dix-neuf')
    expect(numberToFrenchWords(81)).toBe('quatre-vingt-un')
    expect(numberToFrenchWords(89)).toBe('quatre-vingt-neuf')
    expect(numberToFrenchWords(90)).toBe('quatre-vingt-dix')
    expect(numberToFrenchWords(91)).toBe('quatre-vingt-onze')
    expect(numberToFrenchWords(99)).toBe('quatre-vingt-dix-neuf')
  })

  it('applique les accords de « vingt » et « cent »', () => {
    expect(numberToFrenchWords(200)).toBe('deux cents')
    expect(numberToFrenchWords(201)).toBe('deux cent un')
    expect(numberToFrenchWords(280)).toBe('deux cent quatre-vingts')
    expect(numberToFrenchWords(300)).toBe('trois cents')
    // « mille » est un adjectif numéral : perte du « s » devant lui
    expect(numberToFrenchWords(80000)).toBe('quatre-vingt mille')
    expect(numberToFrenchWords(200000)).toBe('deux cent mille')
    expect(numberToFrenchWords(21000)).toBe('vingt et un mille')
    expect(numberToFrenchWords(1000000)).toBe('un million')
  })

  it('accorde « million » et « milliard » comme des noms', () => {
    expect(numberToFrenchWords(2000000)).toBe('deux millions')
    expect(numberToFrenchWords(80000000)).toBe('quatre-vingts millions')
    expect(numberToFrenchWords(1000000000)).toBe('un milliard')
    expect(numberToFrenchWords(2500000000)).toBe('deux milliards cinq cents millions')
  })

  it('lit un montant composite sans perdre de groupe', () => {
    expect(numberToFrenchWords(1234567)).toBe(
      'un million deux cent trente-quatre mille cinq cent soixante-sept',
    )
    expect(numberToFrenchWords(1000000000000 - 1)).toBe(
      'neuf cent quatre-vingt-dix-neuf milliards neuf cent quatre-vingt-dix-neuf millions ' +
        'neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf',
    )
  })

  it('rejette proprement les entrées non convertibles (chaîne vide)', () => {
    expect(numberToFrenchWords(-5)).toBe('')
    expect(numberToFrenchWords(1.5)).toBe('')
    expect(numberToFrenchWords(Number.NaN)).toBe('')
    expect(numberToFrenchWords(Number.POSITIVE_INFINITY)).toBe('')
  })
})
