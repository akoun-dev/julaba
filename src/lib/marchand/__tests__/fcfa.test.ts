import { describe, expect, it } from 'vitest'

// MODE-984 (AUDIT-008 P2) — contrat strict d'un montant FCFA, identique
// UI/store/API : entier positif plafonné, textes et décimales refusés
// (fin du parseInt permissif « 1000abc » → 1000), espaces de dictée tolérés.

import { montantFcfaValide, parseMontantFcfaStrict, PLAFOND_FCFA } from '../fcfa'

describe('parseMontantFcfaStrict', () => {
  it('accepte un entier simple, avec espaces de dictée, à zéros de tête', () => {
    expect(parseMontantFcfaStrict('12500')).toBe(12500)
    expect(parseMontantFcfaStrict('12 500')).toBe(12500)
    expect(parseMontantFcfaStrict('  500 ')).toBe(500)
    expect(parseMontantFcfaStrict('0')).toBe(0)
    expect(parseMontantFcfaStrict('0000012')).toBe(12)
  })

  it('refuse texte mélangé, décimales, signe, vide', () => {
    expect(parseMontantFcfaStrict('1000abc')).toBeNull()
    expect(parseMontantFcfaStrict('12,5')).toBeNull()
    expect(parseMontantFcfaStrict('12.5')).toBeNull()
    expect(parseMontantFcfaStrict('-500')).toBeNull()
    expect(parseMontantFcfaStrict('')).toBeNull()
    expect(parseMontantFcfaStrict('cinq mille')).toBeNull()
  })

  it('refuse au-delà du plafond et les saisies trop longues (9 chiffres max)', () => {
    expect(parseMontantFcfaStrict(String(PLAFOND_FCFA))).toBe(PLAFOND_FCFA)
    expect(parseMontantFcfaStrict('1000000000')).toBeNull()
    expect(parseMontantFcfaStrict('10000000000')).toBeNull()
  })
})

describe('montantFcfaValide (garde API)', () => {
  it('accepte uniquement un number entier >= 0 <= plafond', () => {
    expect(montantFcfaValide(0)).toBe(true)
    expect(montantFcfaValide(12500)).toBe(true)
    expect(montantFcfaValide(PLAFOND_FCFA)).toBe(true)
  })

  it('refuse décimal, négatif, plafond dépassé, string, NaN, undefined', () => {
    expect(montantFcfaValide(12.5)).toBe(false)
    expect(montantFcfaValide(-1)).toBe(false)
    expect(montantFcfaValide(PLAFOND_FCFA + 1)).toBe(false)
    expect(montantFcfaValide('12500')).toBe(false)
    expect(montantFcfaValide(Number.NaN)).toBe(false)
    expect(montantFcfaValide(undefined)).toBe(false)
  })
})
