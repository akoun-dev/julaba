import { describe, it, expect } from 'vitest'
import {
  getVoiceTestPhrase,
  VOICE_TEST_PHRASE_FR,
  VOICE_TEST_PHRASE_DYU,
} from '../test-phrase'

/**
 * MODE-913 — phrase de test de voix consciente de la langue.
 *
 * Remontée terrain : le marchand sélectionne « Dioula » dans Voix & Langue,
 * appuie sur « Tester la voix »… et entend du français sans explication (le
 * seul signal du repli était un console.info invisible). Le test doit
 * s'expliquer lui-même : en dyu, la phrase annonce écoute dioula OK +
 * réponse française ; en fr/bci, la phrase historique reste inchangée
 * (bci : elle est lue par la voix pilote MMS quand elle est installée).
 */
describe('phrase de test de voix selon la langue sélectionnée (MODE-913)', () => {
  it('fr : phrase historique STRICTEMENT inchangée', () => {
    expect(getVoiceTestPhrase('fr')).toBe(VOICE_TEST_PHRASE_FR)
    expect(getVoiceTestPhrase('fr')).toBe(
      'Bonjour ! Je suis Tata Nanti Lou. Tu m\'entends bien ?'
    )
  })

  it('bci : phrase historique (test de la voix pilote MMS quand installée)', () => {
    expect(getVoiceTestPhrase('bci')).toBe(VOICE_TEST_PHRASE_FR)
    expect(getVoiceTestPhrase('bci')).not.toBe(VOICE_TEST_PHRASE_DYU)
  })

  it('dyu : phrase d\'explication audible (écoute OK, réponse française)', () => {
    const phrase = getVoiceTestPhrase('dyu')
    expect(phrase).toBe(VOICE_TEST_PHRASE_DYU)
    // L'honnêteté de la phrase : elle nomme la langue, l'écoute qui marche,
    // la réponse française et l'absence temporaire de la voix.
    expect(phrase).toContain('dioula')
    expect(phrase).toContain('français')
    expect(phrase).toContain('pas encore disponible')
    expect(phrase).toContain('comprends')
  })

  it('dyu : la phrase diffère VRAIMENT de la phrase historique (plus de surprise)', () => {
    expect(getVoiceTestPhrase('dyu')).not.toBe(getVoiceTestPhrase('fr'))
  })
})
