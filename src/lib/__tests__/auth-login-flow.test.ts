import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * auth-login-flow — couche extraite de auth-screen.tsx (MODE-987 / DET-001
 * tranche 1). Comportement VERBATIM : ces tests pinent les helpers qui
 * pilotent le login unifié (marchand/producteur/coopérateur) — clés
 * SecureStorage par rôle, hash djb2 local (jamais serveur), formatage
 * affichage du numéro, instructions vocales par étape, découverte du compte
 * (/api/auth/lookup) et vérification serveur du login (routes par rôle).
 */
import {
  instructionFor,
  patternToHash,
  simpleHash,
  secureKeysFor,
  formatPhoneDisplay,
  checkUnifiedAccount,
  verifyServerLogin,
  VISUAL_LOGIN_LENGTH,
} from '../auth-login-flow'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('simpleHash / patternToHash — djb2 local', () => {
  it('hash vide = 0, déterministe, sensible à l entrée', () => {
    expect(simpleHash('')).toBe('0')
    expect(simpleHash('1234')).toBe(simpleHash('1234'))
    expect(simpleHash('1234')).not.toBe(simpleHash('1235'))
  })

  it('patternToHash joint les points par des tirets', () => {
    expect(patternToHash([0, 1, 2, 3])).toBe(simpleHash('0-1-2-3'))
    expect(patternToHash([3, 2, 1, 0])).not.toBe(patternToHash([0, 1, 2, 3]))
  })
})

describe('secureKeysFor — préfixes par rôle', () => {
  it('marchand = merchant-*, producteur = prod-*, cooperateur = coop-*', () => {
    expect(secureKeysFor('marchand', '07 07 08 45 12')).toEqual({
      pin: 'merchant-pin-0707084512',
      pattern: 'merchant-pattern-0707084512',
      visual: 'merchant-visual-0707084512',
    })
    expect(secureKeysFor('producteur', '0707084512').pin).toBe(
      'prod-pin-0707084512'
    )
    expect(secureKeysFor('cooperateur', '0707084512').pin).toBe(
      'coop-pin-0707084512'
    )
  })

  it('normalise le téléphone (espaces retirés)', () => {
    expect(secureKeysFor('marchand', '07 07 08 45 12').pin).toBe(
      secureKeysFor('marchand', '0707084512').pin
    )
  })
})

describe('formatPhoneDisplay — paires de chiffres, 10 max', () => {
  it('formate en paires', () => {
    expect(formatPhoneDisplay('0707084512')).toBe('07 07 08 45 12')
  })

  it('tranche à 10 chiffres et ignore les non-chiffres', () => {
    expect(formatPhoneDisplay('abc0707084512xyz')).toBe('07 07 08 45 12')
    expect(formatPhoneDisplay('07070845121234')).toBe('07 07 08 45 12')
  })
})

describe('instructionFor — instruction vocale par étape', () => {
  it('couvre toutes les étapes connues', () => {
    expect(instructionFor('name')).toContain('muméro')
    expect(instructionFor('confirm')).toContain('oui ou non')
    expect(instructionFor('recovery')).toContain('identité')
    expect(instructionFor('recovery-pin')).toContain('nouveau code secret')
    expect(instructionFor('recovery-confirm')).toContain('Confirmez')
    expect(instructionFor('pattern-login')).toContain('schéma')
    expect(instructionFor('visual-login')).toContain('symboles')
    expect(instructionFor('login-pin')).toContain('code secret')
  })
})

describe('checkUnifiedAccount — découverte /api/auth/lookup', () => {
  it('renvoie le compte quand found=true (authMethods de secours)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          found: true,
          role: 'producteur',
          firstName: 'Awa',
          authMethod: 'pin',
          authMethods: [],
          sexe: 'feminin',
        }),
        { status: 200 }
      )
    )
    const account = await checkUnifiedAccount('0707084512')
    expect(account).toEqual({
      role: 'producteur',
      firstName: 'Awa',
      authMethod: 'pin',
      authMethods: ['pin'],
      sexe: 'feminin',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/lookup?phone=0707084512'
    )
  })

  it('authMethods non vide est respecté tel quel', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          found: true,
          role: 'marchand',
          firstName: 'Kofi',
          authMethod: 'pattern',
          authMethods: ['pattern', 'pin'],
        })
      )
    )
    const account = await checkUnifiedAccount('0707084512')
    expect(account?.authMethods).toEqual(['pattern', 'pin'])
  })

  it('found=false → null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ found: false }), { status: 200 })
    )
    expect(await checkUnifiedAccount('0707084512')).toBeNull()
  })

  it('HTTP non-ok → null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 500 })
    )
    expect(await checkUnifiedAccount('0707084512')).toBeNull()
  })

  it('réseau en échec → null (jamais de throw)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await checkUnifiedAccount('0707084512')).toBeNull()
  })
})

describe('verifyServerLogin — route par rôle, refus lisible', () => {
  it('route le marchand vers /api/merchant/login avec le code brut (MODE-936)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 'm1', firstName: 'Kofi', categorie: 'grossiste' }),
        { status: 200 }
      )
    )
    const result = await verifyServerLogin('0707084512', 'pin', '1234', 'marchand')
    expect(result).toEqual({ id: 'm1', firstName: 'Kofi', categorie: 'grossiste' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/merchant/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      phone: '0707084512',
      method: 'pin',
      code: '1234',
    })
  })

  it('route le producteur et le coopérateur vers leurs routes dédiées', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'x', firstName: 'A' }), { status: 200 })
    )
    await verifyServerLogin('07', 'pin', '1', 'producteur')
    await verifyServerLogin('07', 'pin', '1', 'cooperateur')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/producteur/login')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/cooperatives/cooperateurs/login')
  })

  it('refus serveur avec message → { serverError } (raison réelle)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Compte lié à un autre appareil' }),
        { status: 403 }
      )
    )
    const result = await verifyServerLogin('07', 'pin', '1', 'marchand')
    expect(result).toEqual({ serverError: 'Compte lié à un autre appareil' })
  })

  it('refus sans corps JSON lisible → null (générique)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('null', { status: 500 })
    )
    expect(await verifyServerLogin('07', 'pin', '1', 'marchand')).toBeNull()
  })

  it('réseau en échec → null (jamais de throw)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await verifyServerLogin('07', 'pin', '1', 'marchand')).toBeNull()
  })
})

describe('constantes de design', () => {
  it('le code symboles reste une suite de 3 (alignement enrôlement ident)', () => {
    expect(VISUAL_LOGIN_LENGTH).toBe(3)
  })
})
