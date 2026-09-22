import { describe, it, expect } from 'vitest'
import { accesCoopAutorise } from '../coop-access'

// MODE-975 (AUDIT-007 G6) — garde de session LÉGÈRE de l'espace
// coopérative président. Fonction pure testée en node (pas de DOM/RTL
// dans ce projet). Contrats :
//  1. rôle coopérateur + identité → accès (le gate est non bloquant
//     offline : AUCUNE revalidation réseau, le serveur reste l'autorité) ;
//  2. identité absente (re-claim Capacitor renvoyant null — le cas
//     documenté G6) → refus, l'écran « Connexion requise » s'affiche ;
//  3. tout autre rôle (marchand, producteur, BO…) → refus ;
//  4. chaîne vide = pas d'identité.

describe('coop-access — accesCoopAutorise (MODE-975, AUDIT-007 G6)', () => {
  it('coopérateur avec identité → accès autorisé (non bloquant offline)', () => {
    expect(accesCoopAutorise({ userRole: 'cooperateur', identite: 'c1' })).toBe(true)
  })

  it('coopérateur SANS identité (session perdue, re-claim null) → refus', () => {
    expect(accesCoopAutorise({ userRole: 'cooperateur', identite: null })).toBe(false)
  })

  it('chaîne vide = pas d\u2019identité utilisable → refus', () => {
    expect(accesCoopAutorise({ userRole: 'cooperateur', identite: '' })).toBe(false)
  })

  it('marchand / producteur / backoffice → refus (espace réservé au président)', () => {
    expect(accesCoopAutorise({ userRole: 'marchand', identite: 'm1' })).toBe(false)
    expect(accesCoopAutorise({ userRole: 'producteur', identite: 'p1' })).toBe(false)
    expect(accesCoopAutorise({ userRole: 'backoffice', identite: 'b1' })).toBe(false)
  })

  it('rôle null (état avant rehydratation) → refus, jamais d\u2019accès par défaut', () => {
    expect(accesCoopAutorise({ userRole: null, identite: 'c1' })).toBe(false)
    expect(accesCoopAutorise({ userRole: null, identite: null })).toBe(false)
  })
})
