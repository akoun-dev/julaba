import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * auth-phone-flows — flux téléphone/navigation extraits de auth-screen
 * (MODE-988 / DET-001 tranche 2). Comportement VERBATIM pinné : dicté du
 * numéro, routage vers l'écran de code selon la méthode, retour numéro,
 * soumission du téléphone (cache local d'abord, découverte serveur ensuite).
 */
vi.mock('@/lib/auth-multi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/auth-multi')>()
  return { ...actual, loadStoredAccount: vi.fn(), saveStoredAccount: vi.fn() }
})
vi.mock('@/lib/voice/tata-tts', () => ({
  tataSpeak: vi.fn(),
  tataStop: vi.fn(),
  playBeep: vi.fn(),
  haptic: vi.fn(),
}))

import { loadStoredAccount, normalizeAuthPhone } from '@/lib/auth-multi'
import { haptic, tataSpeak } from '@/lib/voice/tata-tts'
import {
  goBackToPhoneFlow,
  parseVoicePhone,
  routeToLoginStepFlow,
  submitPhoneFlow,
} from '../auth-phone-flows'
import type { AuthFlowContext } from '../auth-flow-context'
import type { StoredAccount } from '@/lib/auth-multi'

const loadMock = vi.mocked(loadStoredAccount)
const fetchMock = vi.fn()

function makeCtx(overrides: Partial<AuthFlowContext> = {}): AuthFlowContext {
  return {
    phone: '',
    pin: '',
    pinDisplay: [],
    mode: 'login',
    confirmPin: '',
    stepRef: { current: 'name' },
    modeRef: { current: 'login' },
    phoneRef: { current: '' },
    pinRef: { current: '' },
    firstNameRef: { current: '' },
    accountRoleRef: { current: null },
    pinInputModeRef: { current: 'keyboard' },
    voiceAttemptsRef: { current: 0 },
    setPhone: vi.fn(),
    setError: vi.fn(),
    setIsProcessing: vi.fn(),
    setMode: vi.fn(),
    setAccountRole: vi.fn(),
    setFirstName: vi.fn(),
    setAvailableMethods: vi.fn(),
    setAuthMethod: vi.fn(),
    setStep: vi.fn(),
    setPin: vi.fn(),
    setPinDisplay: vi.fn(),
    setConfirmPin: vi.fn(),
    setPinInputMode: vi.fn(),
    setVoiceAttempts: vi.fn(),
    setPatternSuccess: vi.fn(),
    setPatternError: vi.fn(),
    setVisualSuccess: vi.fn(),
    setVisualError: vi.fn(),
    setAuth: vi.fn(),
    setUserRole: vi.fn(),
    doLogin: vi.fn(),
    ...overrides,
  }
}

function account(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    role: 'marchand',
    id: 'm-1',
    firstName: 'Kofi',
    phone: '0707084512',
    pinHash: '1111',
    authMethod: 'pin',
    ...overrides,
  }
}

beforeEach(() => {
  loadMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseVoicePhone — dicté du numéro', () => {
  it('chiffres directs (≥ 8)', () => {
    expect(parseVoicePhone('zero sept zero sept zero huit quatre cinq')).toBe(
      '07070845'
    )
    expect(parseVoicePhone('07 07 08 45 12')).toBe('0707084512')
  })

  it('mots-nombres français (zéro, une…)', () => {
    expect(parseVoicePhone('zéro une zéro une zéro deux zéro un')).toBe(
      '01010201'
    )
  })

  it('moins de 8 chiffres → null', () => {
    expect(parseVoicePhone('mon numéro est 0707')).toBeNull()
    expect(parseVoicePhone('bonjour')).toBeNull()
  })
})

describe('routeToLoginStepFlow — routage par méthode', () => {
  it('pattern → étape schéma + annonce vocale', () => {
    const ctx = makeCtx()
    routeToLoginStepFlow(ctx, 'pattern', 'Awa')
    expect(ctx.setAuthMethod).toHaveBeenCalledWith('pattern')
    expect(ctx.setStep).toHaveBeenCalledWith('pattern-login')
    expect(ctx.stepRef.current).toBe('pattern-login')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Bonjour Awa ! Dessinez votre schéma.'
    )
  })

  it('visual → étape symboles, suite de 3', () => {
    const ctx = makeCtx()
    routeToLoginStepFlow(ctx, 'visual', 'Awa')
    expect(ctx.setStep).toHaveBeenCalledWith('visual-login')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Bonjour Awa ! Touchez vos 3 symboles.'
    )
  })

  it('pin → étape login-pin', () => {
    const ctx = makeCtx()
    routeToLoginStepFlow(ctx, 'pin', 'Kofi')
    expect(ctx.setStep).toHaveBeenCalledWith('login-pin')
    expect(ctx.stepRef.current).toBe('login-pin')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Bonjour Kofi ! Entrez votre code à 4 chiffres.'
    )
  })
})

describe('goBackToPhoneFlow — retour numéro, état transitoire réinitialisé', () => {
  it('reset complet (code, erreurs, schéma/symboles, refs)', () => {
    const ctx = makeCtx({
      pinRef: { current: '1234' },
      stepRef: { current: 'pattern-login' },
    })
    goBackToPhoneFlow(ctx)
    expect(ctx.setError).toHaveBeenCalledWith('')
    expect(ctx.setPin).toHaveBeenCalledWith('')
    expect(ctx.setPinDisplay).toHaveBeenCalledWith([])
    expect(ctx.setConfirmPin).toHaveBeenCalledWith('')
    expect(ctx.setPatternError).toHaveBeenCalledWith(false)
    expect(ctx.setPatternSuccess).toHaveBeenCalledWith(false)
    expect(ctx.setVisualError).toHaveBeenCalledWith(false)
    expect(ctx.setVisualSuccess).toHaveBeenCalledWith(false)
    expect(ctx.pinRef.current).toBe('')
    expect(ctx.setStep).toHaveBeenCalledWith('name')
    expect(ctx.stepRef.current).toBe('name')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Modifiez votre numéro de téléphone.'
    )
  })
})

describe("submitPhoneFlow — cache local d'abord, serveur ensuite", () => {
  it('numéro trop court → erreur, aucun fetch', async () => {
    const ctx = makeCtx()
    await submitPhoneFlow(ctx, '0707')
    expect(ctx.setError).toHaveBeenCalledWith('Entrez un numéro valide.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalise avant de chercher (espaces retirés)', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ found: false }), { status: 200 })
    )
    const ctx = makeCtx()
    await submitPhoneFlow(ctx, '07 07 08 45 12')
    expect(ctx.setPhone).toHaveBeenCalledWith('0707084512')
    expect(ctx.phoneRef.current).toBe('0707084512')
    expect(normalizeAuthPhone('07 07 08 45 12')).toBe('0707084512')
  })

  it('cache local : route sans réseau, méthodes enrichies par les hashes', async () => {
    loadMock.mockReturnValue(
      account({
        authMethod: 'pattern',
        patternHash: 'p',
        visualCodeHash: 'v',
      })
    )
    const ctx = makeCtx()
    await submitPhoneFlow(ctx, '0707084512')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctx.setAccountRole).toHaveBeenCalledWith('marchand')
    expect(ctx.accountRoleRef.current).toBe('marchand')
    expect(ctx.setFirstName).toHaveBeenCalledWith('Kofi')
    expect(ctx.setAvailableMethods).toHaveBeenCalledWith([
      'pattern',
      'visual',
    ])
    expect(ctx.setStep).toHaveBeenCalledWith('pattern-login')
    expect(ctx.setIsProcessing).not.toHaveBeenCalledWith(true)
    expect(haptic).toHaveBeenCalledWith('light')
  })

  it('sans cache : découverte serveur tranche le rôle', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          found: true,
          role: 'producteur',
          firstName: 'Awa',
          authMethod: 'visual',
          authMethods: ['visual'],
        }),
        { status: 200 }
      )
    )
    const ctx = makeCtx()
    await submitPhoneFlow(ctx, '0707084512')
    expect(ctx.setIsProcessing).toHaveBeenNthCalledWith(1, true)
    expect(ctx.setIsProcessing).toHaveBeenNthCalledWith(2, false)
    expect(ctx.setAccountRole).toHaveBeenCalledWith('producteur')
    expect(ctx.setStep).toHaveBeenCalledWith('visual-login')
    expect(ctx.setAvailableMethods).toHaveBeenCalledWith(['visual'])
    expect(haptic).toHaveBeenCalledWith('light')
  })

  it('compte introuvable → message honnête voix + écran', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ found: false }), { status: 200 })
    )
    const ctx = makeCtx()
    await submitPhoneFlow(ctx, '0707084512')
    expect(ctx.setError).toHaveBeenCalledWith(
      'Compte non trouvé. Demandez à un identificateur de créer votre compte.'
    )
    expect(tataSpeak).toHaveBeenCalledWith(
      'Compte introuvable. Demandez à un identificateur de créer votre compte.'
    )
    expect(haptic).toHaveBeenCalledWith('error')
    expect(ctx.setStep).not.toHaveBeenCalled()
  })
})
