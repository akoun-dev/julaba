import { describe, it, expect, beforeEach } from 'vitest'
import {
  notifySpokenChain,
  getLastSpokenChain,
  resetSpokenChainForTests,
} from '../spoken-chain'

/**
 * spoken-chain — traçabilité de la chaîne de lecture réellement utilisée
 * (remontée terrain 2026-09-20 : l'écran Voix & Langue doit pouvoir dire ce
 * qui vient de parler ; si la voix MMS a laissé place au repli français, la
 * légende affichée doit le refléter au lieu d'afficher un succès mensonger).
 */
describe('spoken-chain (traçabilité de la chaîne de lecture)', () => {
  beforeEach(() => {
    resetSpokenChainForTests()
  })

  it('aucune narration → null (rien n\u2019a encore parlé)', () => {
    expect(getLastSpokenChain()).toBeNull()
  })

  it('la dernière chaîne notifiée gagne (les moteurs se déclarent au moment de parler)', () => {
    notifySpokenChain('mms-dyu')
    expect(getLastSpokenChain()).toBe('mms-dyu')
    notifySpokenChain('mms-bci')
    expect(getLastSpokenChain()).toBe('mms-bci')
    notifySpokenChain('webspeech')
    notifySpokenChain('native')
    notifySpokenChain('kokoro')
    notifySpokenChain('piper')
    expect(getLastSpokenChain()).toBe('piper')
  })

  it('reset → null (isolation des tests)', () => {
    notifySpokenChain('mms-dyu')
    resetSpokenChainForTests()
    expect(getLastSpokenChain()).toBeNull()
  })
})
