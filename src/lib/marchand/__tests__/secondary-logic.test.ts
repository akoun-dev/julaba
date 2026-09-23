import { describe, expect, it } from 'vitest'
import {
  clampOrderQuantity,
  clampTontineMembers,
  deriveLoyaltySubjectRole,
  isTontineFormValid,
} from '../secondary-logic'

describe('deriveLoyaltySubjectRole', () => {
  it('producteur → producteur (avant toute lecture de catégorie)', () => {
    expect(deriveLoyaltySubjectRole('producteur', null)).toBe('producteur')
    expect(deriveLoyaltySubjectRole('producteur', 'grossiste')).toBe('producteur')
  })

  it('cooperateur → cooperateur', () => {
    expect(deriveLoyaltySubjectRole('cooperateur', null)).toBe('cooperateur')
  })

  it('marchand grossiste → grossiste', () => {
    expect(deriveLoyaltySubjectRole('marchand', 'grossiste')).toBe('grossiste')
  })

  it('marchand semi_grossiste → semi_grossiste', () => {
    expect(deriveLoyaltySubjectRole('marchand', 'semi_grossiste')).toBe('semi_grossiste')
  })

  it('marchand detaillant → marchand (pas de rôle dédié)', () => {
    expect(deriveLoyaltySubjectRole('marchand', 'detaillant')).toBe('marchand')
  })

  it('marchand sans catégorie (null) → marchand', () => {
    expect(deriveLoyaltySubjectRole('marchand', null)).toBe('marchand')
  })

  it('rôles non marchands sans catégorie → marchand (défaut historique)', () => {
    expect(deriveLoyaltySubjectRole('identificateur', null)).toBe('marchand')
    expect(deriveLoyaltySubjectRole('backoffice', null)).toBe('marchand')
  })

  it('la catégorie est ignorée pour producteur/cooperateur mais lue pour marchand', () => {
    expect(deriveLoyaltySubjectRole('cooperateur', 'grossiste')).toBe('cooperateur')
    expect(deriveLoyaltySubjectRole('identificateur', 'grossiste')).toBe('grossiste')
  })
})

describe('clampOrderQuantity', () => {
  it('valeur normale conservée', () => {
    expect(clampOrderQuantity('1')).toBe(1)
    expect(clampOrderQuantity('25')).toBe(25)
    expect(clampOrderQuantity('999')).toBe(999)
  })

  it('sous 1 ou non finit → 1', () => {
    expect(clampOrderQuantity('0')).toBe(1)
    expect(clampOrderQuantity('-3')).toBe(1)
    expect(clampOrderQuantity('')).toBe(1)
    expect(clampOrderQuantity('abc')).toBe(1)
  })

  it('au-delà de 999 → 999', () => {
    expect(clampOrderQuantity('1000')).toBe(999)
    expect(clampOrderQuantity('99999')).toBe(999)
  })

  it('parse préfixe numérique comme Number.parseInt', () => {
    expect(clampOrderQuantity('12abc')).toBe(12)
  })
})

describe('clampTontineMembers', () => {
  it('valeur normale conservée', () => {
    expect(clampTontineMembers('2')).toBe(2)
    expect(clampTontineMembers('5')).toBe(5)
    expect(clampTontineMembers('100')).toBe(100)
  })

  it('sous 2 ou non finit → 2', () => {
    expect(clampTontineMembers('1')).toBe(2)
    expect(clampTontineMembers('0')).toBe(2)
    expect(clampTontineMembers('')).toBe(2)
    expect(clampTontineMembers('xyz')).toBe(2)
  })

  it('au-delà de 100 → 100', () => {
    expect(clampTontineMembers('101')).toBe(100)
    expect(clampTontineMembers('5000')).toBe(100)
  })
})

describe('isTontineFormValid', () => {
  it('formulaire complet valide', () => {
    expect(isTontineFormValid('Tontine Adjamé', 5000, 5)).toBe(true)
  })

  it('nom vide ou espaces seul invalide', () => {
    expect(isTontineFormValid('', 5000, 5)).toBe(false)
    expect(isTontineFormValid('   ', 5000, 5)).toBe(false)
  })

  it('montant non finit ou <= 0 invalide', () => {
    expect(isTontineFormValid('Nom', Number.NaN, 5)).toBe(false)
    expect(isTontineFormValid('Nom', 0, 5)).toBe(false)
    expect(isTontineFormValid('Nom', -100, 5)).toBe(false)
  })

  it('moins de 2 membres invalide', () => {
    expect(isTontineFormValid('Nom', 5000, 1)).toBe(false)
    expect(isTontineFormValid('Nom', 5000, 2)).toBe(true)
  })
})
