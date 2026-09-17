import { describe, it, expect } from 'vitest'
import {
  normalizeAuthPhone,
  accountCacheKey,
  loadStoredAccount,
  saveStoredAccount,
  clearStoredAccount,
  type StoredAccount,
  type StorageLike,
} from '@/lib/auth-multi'

/** Stockage en mémoire fidèle à l'API localStorage (pour vitest environment node). */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { keys: () => string[] } {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: key => void map.delete(key),
    keys: () => [...map.keys()],
  }
}

const marchand: StoredAccount = {
  role: 'marchand',
  id: 'merchant-1',
  firstName: 'Awa',
  phone: '0701020304',
  pinHash: '1509442',
  authMethod: 'pin',
  sexe: 'feminin',
}

const producteur: StoredAccount = {
  role: 'producteur',
  id: 'producteur-1',
  firstName: 'Kouadio',
  phone: '0744444444',
  pinHash: '639270',
  authMethod: 'pattern',
}

describe('normalizeAuthPhone', () => {
  it('conserve les chiffres et retire espaces/séparateurs', () => {
    expect(normalizeAuthPhone('07 01 02 03 04')).toBe('0701020304')
    expect(normalizeAuthPhone('07-01-02-03-04')).toBe('0701020304')
  })

  it('retire le préfixe international +225', () => {
    expect(normalizeAuthPhone('+2250701020304')).toBe('0701020304')
    expect(normalizeAuthPhone('+225 07 01 02 03 04')).toBe('0701020304')
    // Saisi sans le « + » (le + n'est conservé par aucun clavier téléphone)
    expect(normalizeAuthPhone('2250701020304')).toBe('0701020304')
  })

  it('ne retire pas 225 dans un numéro local court', () => {
    // 10 chiffres commençant par 225 : c'est un numéro local, pas l'indicatif
    expect(normalizeAuthPhone('2250123456')).toBe('2250123456')
    // Numéro national standard : inchangé
    expect(normalizeAuthPhone('0701020304')).toBe('0701020304')
  })

  it('ne garde que les chiffres', () => {
    expect(normalizeAuthPhone('tel: 05.55.55.55.55')).toBe('0555555555')
  })
})

describe('cache unifié par compte', () => {
  it('sauvegarde puis recharge un compte marchand', () => {
    const storage = fakeStorage()
    saveStoredAccount(marchand, storage)
    const loaded = loadStoredAccount('07 01 02 03 04', storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.role).toBe('marchand')
    expect(loaded?.id).toBe('merchant-1')
    expect(loaded?.firstName).toBe('Awa')
  })

  it('sauvegarde puis recharge un compte producteur', () => {
    const storage = fakeStorage()
    saveStoredAccount(producteur, storage)
    const loaded = loadStoredAccount('+225 07 44 44 44 44', storage)
    expect(loaded?.role).toBe('producteur')
    expect(loaded?.authMethod).toBe('pattern')
  })

  it('stocke le téléphone normalisé (une clé par compte)', () => {
    const storage = fakeStorage()
    saveStoredAccount(marchand, storage)
    saveStoredAccount(producteur, storage)
    const keys = storage.keys()
    expect(keys).toContain('julaba-account-0701020304')
    expect(keys).toContain('julaba-account-0744444444')
  })

  it('replie sur le cache marchand legacy (rôle marchand implicite)', () => {
    const storage = fakeStorage({
      'julaba-merchant-0701020304': JSON.stringify({
        id: 'merchant-1',
        firstName: 'Awa',
        phone: '0701020304',
        pinHash: '1509442',
        authMethod: 'pin',
      }),
    })
    const loaded = loadStoredAccount('0701020304', storage)
    expect(loaded?.role).toBe('marchand')
    expect(loaded?.pinHash).toBe('1509442')
  })

  it('retourne null pour un téléphone sans cache ou sans compte valide', () => {
    const storage = fakeStorage()
    expect(loadStoredAccount('0699999999', storage)).toBeNull()
    expect(loadStoredAccount('', storage)).toBeNull()
  })

  it('ignore un cache corrompu ou avec un rôle inconnu', () => {
    const storage = fakeStorage({
      'julaba-account-0600000001': '{{{pas du json',
      'julaba-account-0600000002': JSON.stringify({ role: 'pirate', id: 'x' }),
    })
    expect(loadStoredAccount('0600000001', storage)).toBeNull()
    expect(loadStoredAccount('0600000002', storage)).toBeNull()
  })

  it('clearStoredAccount ne touche pas aux autres comptes de l\'appareil', () => {
    const storage = fakeStorage()
    saveStoredAccount(marchand, storage)
    saveStoredAccount(producteur, storage)
    clearStoredAccount('0701020304', storage)
    expect(loadStoredAccount('0701020304', storage)).toBeNull()
    expect(loadStoredAccount('0744444444', storage)).not.toBeNull()
  })

  it('tolère un stockage indisponible (vitest node / SSR)', () => {
    expect(() => saveStoredAccount(marchand, null)).not.toThrow()
    expect(loadStoredAccount('0701020304', null)).toBeNull()
    expect(() => clearStoredAccount('0701020304', null)).not.toThrow()
  })
})

describe('accountCacheKey', () => {
  it('dépend uniquement du téléphone normalisé', () => {
    expect(accountCacheKey('+225 07 01 02 03 04')).toBe('julaba-account-0701020304')
    expect(accountCacheKey('0701020304')).toBe('julaba-account-0701020304')
  })
})
