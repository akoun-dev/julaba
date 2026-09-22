import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isNativeTtsAvailable, TataTts } from '../native-tts'

// Task 121 — DET-002 (AUDIT-001) : test dédié du pont natif TTS. Ce module
// n'était jusqu'ici testé que PAR PROCURATION — mocké intégralement dans
// tata-tts.test.ts et via un pont inerte dans stt-routing.test.ts — alors
// qu'il porte DEUX contrats : le nom EXACT du plugin natif (renommer
// 'TataTts' casserait silencieusement les ponts Android/iOS du même nom,
// TataTtsPlugin.java / TataTtsPlugin.swift) et le garde isNativeTtsAvailable
// qui décide du routage voix natif vs Web Speech (cf. tata-tts.ts).
// registerPlugin est appelé UNE FOIS au chargement du module : l'état est
// capturé via un holder hoisted plutôt que via l'historique du mock, que
// beforeEach.clearAllMocks effacerait.

const state = vi.hoisted(() => ({
  native: false,
  boom: false,
  registerCalls: 0,
  registeredName: undefined as string | undefined,
  bridge: undefined as Record<string, unknown> | undefined,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => {
      if (state.boom) throw new Error('Capacitor indisponible')
      return state.native
    },
  },
  registerPlugin: (name: string) => {
    state.registerCalls += 1
    state.registeredName = name
    state.bridge = { isAvailable: vi.fn(), speak: vi.fn(), stop: vi.fn() }
    return state.bridge
  },
  WebPlugin: class {},
}))

beforeEach(() => {
  state.native = false
  state.boom = false
})

describe('pont natif TataTts (native-tts)', () => {
  it('enregistre le plugin natif sous le nom EXACT « TataTts » au chargement', () => {
    // Contrat natif : le nom doit rester aligné sur TataTtsPlugin.java et
    // TataTtsPlugin.swift — toute divergence est une régression silencieuse.
    expect(state.registerCalls).toBe(1)
    expect(state.registeredName).toBe('TataTts')
  })

  it('expose l\'objet pont renvoyé par registerPlugin comme TataTts', () => {
    expect(TataTts).toBe(state.bridge)
  })

  describe('isNativeTtsAvailable', () => {
    it('vrai uniquement dans la coquille native (Android/iOS)', () => {
      state.native = true
      expect(isNativeTtsAvailable()).toBe(true)
    })

    it('faux dans un navigateur pur (Web Speech est la sortie de repli)', () => {
      state.native = false
      expect(isNativeTtsAvailable()).toBe(false)
    })

    it('faux si Capacitor lève (WebView dégradé) — jamais de crash', () => {
      state.boom = true
      expect(() => isNativeTtsAvailable()).not.toThrow()
      expect(isNativeTtsAvailable()).toBe(false)
    })
  })
})
