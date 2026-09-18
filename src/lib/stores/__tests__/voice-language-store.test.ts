import { beforeEach, describe, expect, it } from 'vitest'

import {
  getSelectedTtsLanguage,
  getSelectedVoiceLanguage,
  useVoiceLanguageStore,
} from '../voice-language-store'

// Task 40 — la langue de la voix a deux facettes : dictée (sttLanguage, lue
// par stt-factory) et narration Tata (ttsLanguage, lue par tata-tts). Le
// réglage des écrans « Langue de la voix » (marchand + producteur) et le
// sélecteur des modales vocales les règlent ENSEMBLE via setVoiceLanguage.

describe('voice-language-store — langue de la voix (Task 40)', () => {
  beforeEach(() => {
    useVoiceLanguageStore.setState({ sttLanguage: 'fr', ttsLanguage: 'fr' })
  })

  it('setVoiceLanguage règle dictée ET Tata en une action', () => {
    useVoiceLanguageStore.getState().setVoiceLanguage('bci')
    expect(useVoiceLanguageStore.getState().sttLanguage).toBe('bci')
    expect(useVoiceLanguageStore.getState().ttsLanguage).toBe('bci')
    expect(getSelectedVoiceLanguage()).toBe('bci')
    expect(getSelectedTtsLanguage()).toBe('bci')
  })

  it('retour à fr via setVoiceLanguage — les deux facettes suivent', () => {
    useVoiceLanguageStore.getState().setVoiceLanguage('bci')
    useVoiceLanguageStore.getState().setVoiceLanguage('fr')
    expect(getSelectedVoiceLanguage()).toBe('fr')
    expect(getSelectedTtsLanguage()).toBe('fr')
  })

  it('setSTTLanguage ne touche que la dictée (compat Task 32)', () => {
    useVoiceLanguageStore.getState().setSTTLanguage('bci')
    expect(useVoiceLanguageStore.getState().sttLanguage).toBe('bci')
    expect(useVoiceLanguageStore.getState().ttsLanguage).toBe('fr')
  })

  it('setTTSLanguage ne touche que la narration Tata', () => {
    useVoiceLanguageStore.getState().setTTSLanguage('bci')
    expect(useVoiceLanguageStore.getState().sttLanguage).toBe('fr')
    expect(useVoiceLanguageStore.getState().ttsLanguage).toBe('bci')
  })
})
