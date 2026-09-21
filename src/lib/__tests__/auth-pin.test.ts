import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_LOCK_MINUTES,
  ACCOUNT_MAX_FAILURES,
  ACCOUNT_WINDOW_MINUTES,
  IP_LOCK_MINUTES,
  IP_MAX_FAILURES,
  IP_WINDOW_MINUTES,
  accountScope,
  djb2Legacy,
  hashCodeScrypt,
  ipScope,
  needsRehash,
  normalizeIp,
  verifyCode,
} from '../auth-pin'

/**
 * MODE-936 (AUDIT-003 S-03) — module de vérification serveur du code.
 * Le vecteur legacy djb2 « 1234 → 1509442 » est le MÊME que celui du seed
 * SQL (voir simple-hash-seed.test.ts) : il prouve que les comptes enrôlés
 * avant la bascule restent vérifiables (re-hash transparent au 1er login).
 */
describe('hashCodeScrypt — format back-office', () => {
  it('produit le format scrypt:<saltHex>:<hashHex> (identique à password.ts BO)', () => {
    const stored = hashCodeScrypt('1234')
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('scrypt')
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/) // sel de 16 octets
    expect(parts[2]).toMatch(/^[0-9a-f]{128}$/) // clé de 64 octets
  })

  it('salle deux hash du même code (sel aléatoire)', () => {
    expect(hashCodeScrypt('1234')).not.toBe(hashCodeScrypt('1234'))
  })

  it('verifyCode valide le code contre son hash scrypt', () => {
    expect(verifyCode('2468', hashCodeScrypt('2468'))).toBe(true)
  })

  it('verifyCode refuse un code erroné contre un hash scrypt', () => {
    expect(verifyCode('2469', hashCodeScrypt('2468'))).toBe(false)
  })
})

describe('verifyCode — compatibilité legacy djb2 (comptes pré-bascule)', () => {
  it('vérifie le vecteur du seed SQL : PIN 1234 → 1509442', () => {
    expect(verifyCode('1234', '1509442')).toBe(true)
  })

  it('vérifie le vecteur du seed SQL : PIN 0000 → 1477632', () => {
    expect(verifyCode('0000', '1477632')).toBe(true)
  })

  it('refuse un code erroné contre un hash legacy', () => {
    expect(verifyCode('1235', '1509442')).toBe(false)
  })

  it('refuse un hash scrypt tronqué / malformé sans lever', () => {
    expect(verifyCode('1234', 'scrypt:abc')).toBe(false)
    expect(verifyCode('1234', 'scrypt::')).toBe(false)
  })

  it('refuse un stockage vide', () => {
    expect(verifyCode('1234', '')).toBe(false)
  })
})

describe('djb2Legacy — réplique exacte du simpleHash client', () => {
  it('hash vide = 0', () => {
    expect(djb2Legacy('')).toBe('0')
  })

  it('vecteur seed 1234 → 1509442', () => {
    expect(djb2Legacy('1234')).toBe('1509442')
  })

  it("déterministe et sensible à l'entrée", () => {
    expect(djb2Legacy('2468')).toBe(djb2Legacy('2468'))
    expect(djb2Legacy('2468')).not.toBe(djb2Legacy('1357'))
  })

  it('peut porter des valeurs signées (32 bits)', () => {
    // Le schéma client « hash |= 0 » produit des négatifs pour certaines
    // entrées — la réplique serveur doit les reproduire à l'identique.
    expect(Number.isInteger(Number(djb2Legacy('a')))).toBe(true)
  })
})

describe('needsRehash — bascule progressive', () => {
  it('un hash legacy djb2 doit être re-hashé', () => {
    expect(needsRehash('1509442')).toBe(true)
  })

  it('un hash scrypt ne doit PAS être re-hashé', () => {
    expect(needsRehash(hashCodeScrypt('1234'))).toBe(false)
  })

  it("un stockage vide n'est jamais « re-hashable » (compte sans code)", () => {
    expect(needsRehash('')).toBe(false)
  })
})

describe('politique de verrouillage (constantes partagées routes/pgTAP)', () => {
  it('compte : 5 échecs → 15 min (fenêtre 15 min)', () => {
    expect(ACCOUNT_MAX_FAILURES).toBe(5)
    expect(ACCOUNT_WINDOW_MINUTES).toBe(15)
    expect(ACCOUNT_LOCK_MINUTES).toBe(15)
  })

  it('IP : 20 échecs en 5 min → 15 min', () => {
    expect(IP_MAX_FAILURES).toBe(20)
    expect(IP_WINDOW_MINUTES).toBe(5)
    expect(IP_LOCK_MINUTES).toBe(15)
  })
})

describe('portées et IP', () => {
  it('accountScope préfixe par table', () => {
    expect(accountScope('merchants', 'm-1')).toBe('merchants:m-1')
    expect(accountScope('cooperateurs', 'c-9')).toBe('cooperateurs:c-9')
  })

  it('ipScope préfixe ip:', () => {
    expect(ipScope('10.0.0.7')).toBe('ip:10.0.0.7')
  })

  it('normalizeIp prend le premier maillon du X-Forwarded-For', () => {
    expect(normalizeIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
    expect(normalizeIp('  198.51.100.2 ')).toBe('198.51.100.2')
  })

  it('normalizeIp retombe sur le repli sans en-tête', () => {
    expect(normalizeIp(null)).toBe('inconnu')
    expect(normalizeIp('')).toBe('inconnu')
    expect(normalizeIp(null, 'local')).toBe('local')
  })
})
