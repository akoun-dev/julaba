import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * auth-code-flows — flux de vérification extraits de auth-screen (MODE-988
 * / DET-001 tranche 2). Comportement VERBATIM pinné : doLogin (rôle posé
 * AVANT setAuth), biométrie, tentative PIN (cache local → serveur en
 * repli → refus honnête), confirmation vocale oui/non, saisie du pavé,
 * récupération marchand-only avec PATCH best-effort, orchestration vocale
 * par étape, vérification schéma/symboles.
 */
vi.mock('@/lib/auth-multi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/auth-multi')>()
  return { ...actual, loadStoredAccount: vi.fn(), saveStoredAccount: vi.fn() }
})
vi.mock('@/lib/secure-storage', () => ({
  getPinHash: vi.fn(() => Promise.resolve(null)),
  savePinHash: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/voice/tata-tts', () => ({
  tataSpeak: vi.fn(),
  tataStop: vi.fn(),
  playBeep: vi.fn(),
  haptic: vi.fn(),
}))
vi.mock('@/lib/biometric-auth', () => ({
  isBiometricUnlockAvailable: vi.fn(async () => false),
  unlockWithBiometrics: vi.fn(),
}))
vi.mock('@/lib/offline-db', () => ({
  queuePendingSync: vi.fn(async () => {}),
}))

import { loadStoredAccount, type StoredAccount } from '@/lib/auth-multi'
import { getPinHash } from '@/lib/secure-storage'
import { haptic, playBeep, tataSpeak } from '@/lib/voice/tata-tts'
import { unlockWithBiometrics } from '@/lib/biometric-auth'
import { queuePendingSync } from '@/lib/offline-db'
import {
  attemptLoginFlow,
  biometricRecoveryFlow,
  biometricUnlockFlow,
  completeRecoveryFlow,
  confirmVoicePinFlow,
  doLoginFlow,
  handleDeletePinFlow,
  handlePinDigitFlow,
  handleVoiceResultFlow,
} from '../auth-code-flows'
import {
  verifyPatternFlow,
  verifyVisualFlow,
} from '../auth-credential-flows'
import { parseVoicePhone } from '../auth-phone-flows'
import type { AuthFlowContext } from '../auth-flow-context'
import { simpleHash } from '../auth-login-flow'

const loadMock = vi.mocked(loadStoredAccount)
const getPinHashMock = vi.mocked(getPinHash)
const unlockMock = vi.mocked(unlockWithBiometrics)
const fetchMock = vi.fn()

function makeCtx(overrides: Partial<AuthFlowContext> = {}): AuthFlowContext {
  return {
    phone: '0707084512',
    pin: '',
    pinDisplay: [],
    mode: 'login',
    confirmPin: '',
    stepRef: { current: 'name' },
    modeRef: { current: 'login' },
    phoneRef: { current: '0707084512' },
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
    pinHash: simpleHash('1234'),
    authMethod: 'pin',
    ...overrides,
  }
}

const serverOk = (body: Record<string, unknown>) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
const serverErr = (error: string, status = 401) =>
  Promise.resolve(new Response(JSON.stringify({ error }), { status }))

beforeEach(() => {
  loadMock.mockReset()
  getPinHashMock.mockReset()
  unlockMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('doLoginFlow — connexion réussie', () => {
  it('pose le rôle AVANT setAuth (redirection lit le rôle courant)', () => {
    const ctx = makeCtx()
    doLoginFlow(ctx, '0707084512', 'Kofi', 'producteur', 'm-9')
    const order = vi.mocked(ctx.setUserRole).mock.invocationCallOrder[0]
    const orderAuth = vi.mocked(ctx.setAuth).mock.invocationCallOrder[0]
    expect(order).toBeLessThan(orderAuth)
    expect(ctx.setUserRole).toHaveBeenCalledWith('producteur')
    expect(ctx.setAuth).toHaveBeenCalledWith(
      'm-9',
      'Kofi',
      '0707084512',
      undefined,
      undefined
    )
    expect(ctx.setIsProcessing).toHaveBeenNthCalledWith(1, true)
    expect(ctx.setIsProcessing).toHaveBeenNthCalledWith(2, false)
    expect(playBeep).toHaveBeenCalledWith('success')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Bonjour Kofi ! Bienvenue sur Jùlaba.'
    )
  })

  it('id de secours via crypto.randomUUID', () => {
    const ctx = makeCtx()
    doLoginFlow(ctx, '07', 'A', 'marchand')
    const id = vi.mocked(ctx.setAuth).mock.calls[0][0]
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('échec store → erreur affichée + beep', () => {
    const ctx = makeCtx({ setAuth: vi.fn(() => { throw new Error('boom') }) })
    doLoginFlow(ctx, '07', 'A', 'marchand')
    expect(ctx.setError).toHaveBeenCalledWith('Erreur de connexion.')
    expect(playBeep).toHaveBeenCalledWith('error')
    expect(ctx.setIsProcessing).toHaveBeenLastCalledWith(false)
  })
})

describe('biometricUnlockFlow / biometricRecoveryFlow — empreinte', () => {
  it('déverrouillage : pas de compte → rien', async () => {
    loadMock.mockReturnValue(null)
    const ctx = makeCtx()
    await biometricUnlockFlow(ctx)
    expect(unlockMock).not.toHaveBeenCalled()
  })

  it('déverrouillage OK → doLogin avec le compte stocké', async () => {
    loadMock.mockReturnValue(account({ sexe: 'masculin' }))
    unlockMock.mockResolvedValue(true)
    const ctx = makeCtx()
    await biometricUnlockFlow(ctx)
    expect(unlockMock).toHaveBeenCalledWith('Déverrouiller le compte de Kofi')
    expect(ctx.doLogin).toHaveBeenCalledWith(
      '0707084512',
      'Kofi',
      'marchand',
      'm-1',
      'masculin'
    )
  })

  it('récupération refusée aux non-marchands', async () => {
    loadMock.mockReturnValue(account({ role: 'producteur' }))
    const ctx = makeCtx()
    await biometricRecoveryFlow(ctx)
    expect(ctx.setError).toHaveBeenCalledWith(
      'Réinitialisation disponible pour les comptes marchands. Contactez un agent Jùlaba.'
    )
    expect(unlockMock).not.toHaveBeenCalled()
  })

  it('récupération marchand OK → étape recovery-pin vierge', async () => {
    loadMock.mockReturnValue(account())
    unlockMock.mockResolvedValue(true)
    const ctx = makeCtx({ pinRef: { current: '9999' } })
    await biometricRecoveryFlow(ctx)
    expect(ctx.setMode).toHaveBeenCalledWith('recovery')
    expect(ctx.setPin).toHaveBeenCalledWith('')
    expect(ctx.setStep).toHaveBeenCalledWith('recovery-pin')
    expect(ctx.stepRef.current).toBe('recovery-pin')
    expect(tataSpeak).toHaveBeenCalledWith(
      'Créez votre nouveau code secret à 4 chiffres.'
    )
  })
})

describe('attemptLoginFlow — cache local, serveur en repli', () => {
  it('cache local valable → doLogin, aucun fetch', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue(simpleHash('1234'))
    const ctx = makeCtx({ pinRef: { current: '1234' } })
    await attemptLoginFlow(ctx, '1234')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctx.doLogin).toHaveBeenCalledWith(
      '0707084512',
      'Kofi',
      'marchand',
      'm-1',
      undefined
    )
    expect(ctx.setIsProcessing).toHaveBeenLastCalledWith(false)
  })

  it('cache périmé → serveur tranche, compte re-caché (categorie passée)', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue('ancien-hash')
    fetchMock.mockReturnValue(
      serverOk({
        id: 'm-2',
        firstName: 'Kofi',
        categorie: 'grossiste',
      })
    )
    const ctx = makeCtx()
    await attemptLoginFlow(ctx, '1234')
    expect(fetchMock).toHaveBeenCalledWith('/api/merchant/login', expect.any(Object))
    expect(ctx.doLogin).toHaveBeenCalledWith(
      '0707084512',
      'Kofi',
      'marchand',
      'm-2',
      undefined,
      'grossiste'
    )
  })

  it('refus serveur lisible → {serverError} affiché tel quel, PIN réinitialisé', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue('ancien-hash')
    fetchMock.mockReturnValue(serverErr('Compte lié à un autre appareil', 403))
    const ctx = makeCtx({ pinRef: { current: '1234' } })
    await attemptLoginFlow(ctx, '1234')
    expect(ctx.setError).toHaveBeenCalledWith('Compte lié à un autre appareil')
    expect(tataSpeak).toHaveBeenCalledWith('Connexion refusée. Réessayez.')
    expect(ctx.setPin).toHaveBeenCalledWith('')
    expect(ctx.pinRef.current).toBe('')
    expect(ctx.setPinDisplay).toHaveBeenCalledWith([])
    expect(ctx.doLogin).not.toHaveBeenCalled()
    expect(ctx.setIsProcessing).toHaveBeenLastCalledWith(false)
  })

  it('sans cache + code faux → « Code incorrect. Réessayez. »', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockRejectedValue(new Error('offline')) // verifyServerLogin → null
    const ctx = makeCtx({ pinRef: { current: '1234' } })
    await attemptLoginFlow(ctx, '1234')
    expect(ctx.setError).toHaveBeenCalledWith('Code incorrect. Réessayez.')
    expect(tataSpeak).toHaveBeenCalledWith('Code incorrect.')
    expect(ctx.doLogin).not.toHaveBeenCalled()
    expect(ctx.setIsProcessing).toHaveBeenLastCalledWith(false)
  })

  it('sans cache + code bon → persisté puis doLogin', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockReturnValue(serverOk({ id: 'm-3', firstName: 'Awa' }))
    const ctx = makeCtx({ accountRoleRef: { current: 'producteur' } })
    await attemptLoginFlow(ctx, '1234')
    expect(fetchMock).toHaveBeenCalledWith('/api/producteur/login', expect.any(Object))
    expect(ctx.doLogin).toHaveBeenCalledWith(
      '0707084512',
      'Awa',
      'producteur',
      'm-3',
      undefined,
      undefined
    )
  })
})

describe('confirmVoicePinFlow — branche « oui » de la confirmation vocale', () => {
  it('PIN correct via cache → doLogin, étape conservée', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue(simpleHash('1234'))
    const ctx = makeCtx({ pinRef: { current: '1234' } })
    await confirmVoicePinFlow(ctx)
    expect(ctx.doLogin).toHaveBeenCalled()
    expect(ctx.setStep).not.toHaveBeenCalledWith('login-pin')
  })

  it('PIN faux → refus + retour login-pin (jamais de login)', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockReturnValue(serverErr('Code incorrect'))
    const ctx = makeCtx({ pinRef: { current: '0000' } })
    await confirmVoicePinFlow(ctx)
    expect(ctx.setError).toHaveBeenCalledWith('Code incorrect')
    expect(tataSpeak).toHaveBeenCalledWith('Connexion refusée. Réessayez.')
    expect(ctx.setStep).toHaveBeenCalledWith('login-pin')
    expect(ctx.stepRef.current).toBe('login-pin')
    expect(ctx.doLogin).not.toHaveBeenCalled()
  })
})

describe('handlePinDigitFlow — pavé PIN', () => {
  it('garde : 4 chiffres déjà saisis → ignore', async () => {
    const ctx = makeCtx({ pin: '1234' })
    await handlePinDigitFlow(ctx, '5')
    expect(ctx.setPin).not.toHaveBeenCalled()
  })

  it('saisie partielle → accumulation, pas de tentative', async () => {
    const ctx = makeCtx({ pin: '12', pinDisplay: ['•', '•'] })
    await handlePinDigitFlow(ctx, '3')
    expect(ctx.setPin).toHaveBeenCalledWith('123')
    expect(ctx.setPinDisplay).toHaveBeenCalledWith(['•', '•', '•'])
    expect(ctx.doLogin).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('4e chiffre (mode login) → tentative', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue(simpleHash('1234'))
    const ctx = makeCtx({ pin: '123', pinDisplay: ['•', '•', '•'] })
    await handlePinDigitFlow(ctx, '4')
    expect(ctx.setPin).toHaveBeenCalledWith('1234')
    // la tentative part en void — on attend sa complétion
    await vi.waitFor(() => expect(ctx.doLogin).toHaveBeenCalled())
  })

  it('recovery : premier code → confirmation demandée', async () => {
    const ctx = makeCtx({ mode: 'recovery', confirmPin: '', pin: '123' })
    await handlePinDigitFlow(ctx, '4')
    expect(ctx.setConfirmPin).toHaveBeenCalledWith('1234')
    expect(ctx.setPin).toHaveBeenCalledWith('')
    expect(ctx.setStep).toHaveBeenCalledWith('recovery-confirm')
    expect(tataSpeak).toHaveBeenCalledWith('Confirmez votre nouveau code.')
  })

  it('recovery : codes différents → erreur + retour recovery-pin', async () => {
    const ctx = makeCtx({
      mode: 'recovery',
      confirmPin: '1234',
      pin: '567',
    })
    await handlePinDigitFlow(ctx, '8')
    expect(ctx.setError).toHaveBeenCalledWith('Les codes ne correspondent pas.')
    expect(ctx.setStep).toHaveBeenCalledWith('recovery-pin')
    expect(playBeep).toHaveBeenCalledWith('error')
  })
})

describe('handleDeletePinFlow — effacement', () => {
  it('retire le dernier chiffre', () => {
    const ctx = makeCtx({ pin: '123', pinDisplay: ['•', '•', '•'] })
    handleDeletePinFlow(ctx)
    expect(ctx.setPin).toHaveBeenCalledWith('12')
    expect(ctx.setPinDisplay).toHaveBeenCalledWith(['•', '•'])
  })

  it('vide → no-op', () => {
    const ctx = makeCtx({ pin: '', pinDisplay: [] })
    handleDeletePinFlow(ctx)
    expect(ctx.setPin).not.toHaveBeenCalled()
  })
})

describe('completeRecoveryFlow — réinitialisation marchand', () => {
  it('sans compte stocké → erreur', async () => {
    loadMock.mockReturnValue(null)
    const ctx = makeCtx()
    await completeRecoveryFlow(ctx, '5678')
    expect(ctx.setError).toHaveBeenCalledWith('Compte introuvable. Réessayez.')
  })

  it('marchand : PATCH OK → persisté + doLogin', async () => {
    loadMock.mockReturnValue(account())
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const ctx = makeCtx()
    await completeRecoveryFlow(ctx, '5678')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/merchant',
      expect.objectContaining({ method: 'PATCH' })
    )
    expect(ctx.doLogin).toHaveBeenCalledWith(
      '0707084512',
      'Kofi',
      'marchand',
      'm-1',
      undefined
    )
    expect(queuePendingSync).not.toHaveBeenCalled()
    expect(ctx.setIsProcessing).toHaveBeenLastCalledWith(false)
  })

  it('PATCH 404 toléré (compte non migré)', async () => {
    loadMock.mockReturnValue(account())
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    const ctx = makeCtx()
    await completeRecoveryFlow(ctx, '5678')
    expect(ctx.doLogin).toHaveBeenCalled()
  })

  it('PATCH en échec réseau → file offline puis doLogin quand même', async () => {
    loadMock.mockReturnValue(account())
    fetchMock.mockRejectedValue(new Error('offline'))
    const ctx = makeCtx()
    await completeRecoveryFlow(ctx, '5678')
    expect(queuePendingSync).toHaveBeenCalledWith(
      'merchant-update',
      expect.objectContaining({ pin: '5678', authMethod: 'pin' })
    )
    expect(ctx.doLogin).toHaveBeenCalled()
  })
})

describe('handleVoiceResultFlow — orchestration vocale par étape', () => {
  it('étape name : numéro dicté → submitPhone (serveur consulté)', async () => {
    loadMock.mockReturnValue(null)
    fetchMock.mockReturnValue(
      serverOk({ found: true, role: 'marchand', firstName: 'Kofi', authMethod: 'pin', authMethods: ['pin'] })
    )
    const ctx = makeCtx({ stepRef: { current: 'name' } })
    await handleVoiceResultFlow(ctx, 'zero sept zero sept zero huit quatre cinq')
    expect(parseVoicePhone('zero sept zero sept zero huit quatre cinq')).toBe('07070845')
    // le submit part en void — on attend sa complétion
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/lookup?phone=07070845')
    )
    await vi.waitFor(() => expect(ctx.setStep).toHaveBeenCalledWith('login-pin'))
  })

  it('étape name : numéro incompris → erreur + voix', async () => {
    const ctx = makeCtx({ stepRef: { current: 'name' } })
    await handleVoiceResultFlow(ctx, 'bonjour')
    expect(ctx.setError).toHaveBeenCalledWith(
      "Je n'ai pas compris le numéro. Réessayez."
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('étape login-pin : 4 chiffres dictés → confirmation sans répétition + écoute automatique', async () => {
    const ctx = makeCtx({
      stepRef: { current: 'login-pin' },
      voiceAttemptsRef: { current: 0 },
      startVoiceListening: vi.fn(),
    })
    await handleVoiceResultFlow(ctx, 'un deux trois quatre')
    expect(ctx.setPinInputMode).toHaveBeenCalledWith('voice')
    expect(ctx.pinInputModeRef.current).toBe('voice')
    expect(ctx.setPin).toHaveBeenCalledWith('1234')
    expect(ctx.setPinDisplay).toHaveBeenCalledWith(['•', '•', '•', '•'])
    expect(ctx.setStep).toHaveBeenCalledWith('confirm')
    expect(ctx.stepRef.current).toBe('confirm')
    expect(tataSpeak).toHaveBeenCalledWith('Dites oui ou non.', expect.any(Function))
    const speakCallback = vi.mocked(tataSpeak).mock.calls.at(-1)?.[1]
    if (typeof speakCallback === 'function') speakCallback('done')
    expect(ctx.startVoiceListening).toHaveBeenCalledTimes(1)
  })

  it('étape login-pin : 2 échecs → pavé numérique conseillé', async () => {
    const ctx = makeCtx({
      stepRef: { current: 'login-pin' },
      voiceAttemptsRef: { current: 1 },
    })
    await handleVoiceResultFlow(ctx, 'bonjour')
    expect(ctx.setVoiceAttempts).toHaveBeenCalledWith(2)
    expect(ctx.voiceAttemptsRef.current).toBe(2)
    expect(tataSpeak).toHaveBeenCalledWith('Utilisez le pavé numérique.')
    expect(ctx.setError).toHaveBeenCalledWith(
      'Trop de tantatives vocales. Utilisez le pavé.'
    )
  })

  it('étape confirm : « oui » → tentative de connexion', async () => {
    loadMock.mockReturnValue(account())
    getPinHashMock.mockResolvedValue(simpleHash('1234'))
    const ctx = makeCtx({
      stepRef: { current: 'confirm' },
      pinRef: { current: '1234' },
    })
    await handleVoiceResultFlow(ctx, "c'est bon")
    expect(ctx.doLogin).toHaveBeenCalled()
  })

  it('étape confirm : « non » → retour saisie PIN', async () => {
    const ctx = makeCtx({
      stepRef: { current: 'confirm' },
      pinRef: { current: '1234' },
    })
    await handleVoiceResultFlow(ctx, 'non')
    expect(tataSpeak).toHaveBeenCalledWith("D'accord, réentrez votre code.")
    expect(ctx.setStep).toHaveBeenCalledWith('login-pin')
    expect(ctx.pinRef.current).toBe('')
  })
})

describe('verifyPatternFlow / verifyVisualFlow — schéma et symboles', () => {
  it('schéma : cache valable → succès + doLogin différé (400 ms)', async () => {
    vi.useFakeTimers()
    try {
      loadMock.mockReturnValue(
        account({ authMethod: 'pattern', patternHash: 'p' })
      )
      getPinHashMock.mockResolvedValue(simpleHash('0-1-2-3'))
      const ctx = makeCtx()
      const done = verifyPatternFlow(ctx, [0, 1, 2, 3])
      await vi.runAllTimersAsync()
      await done
      expect(ctx.setPatternSuccess).toHaveBeenCalledWith(true)
      expect(haptic).toHaveBeenCalledWith('success')
      expect(ctx.doLogin).toHaveBeenCalled()
      expect(ctx.setPatternError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('schéma : refus → erreur + beep + reset du drapeau après 1200 ms', async () => {
    vi.useFakeTimers()
    try {
      loadMock.mockReturnValue(
        account({ authMethod: 'pattern', patternHash: 'p' })
      )
      getPinHashMock.mockResolvedValue('autre-hash')
      fetchMock.mockRejectedValue(new Error('offline')) // verifyServerLogin → null → refus générique
      const ctx = makeCtx()
      const done = verifyPatternFlow(ctx, [0, 1, 2, 3])
      await vi.runAllTimersAsync()
      await done
      expect(ctx.setPatternError).toHaveBeenCalledWith(true)
      expect(ctx.setError).toHaveBeenCalledWith('Schéma incorrect.')
      expect(tataSpeak).toHaveBeenCalledWith('Schéma incorrect. Réessayez.')
      expect(ctx.setPatternError).toHaveBeenLastCalledWith(false)
      expect(ctx.doLogin).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('symboles : cache périmé → serveur tranche (visual>, hash séquence)', async () => {
    vi.useFakeTimers()
    try {
      loadMock.mockReturnValue(
        account({ authMethod: 'pin', visualCodeHash: undefined })
      )
      getPinHashMock.mockResolvedValue('pas-le-bon')
      fetchMock.mockReturnValue(serverOk({ id: 'm-2', firstName: 'Kofi' }))
      const ctx = makeCtx()
      const done = verifyVisualFlow(ctx, ['panier', 'soleil', 'cle'])
      await vi.runAllTimersAsync()
      await done
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/merchant/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            phone: '0707084512',
            method: 'visual',
            code: 'panier>soleil>cle',
          }),
        })
      )
      expect(ctx.setVisualSuccess).toHaveBeenCalledWith(true)
      expect(ctx.doLogin).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
