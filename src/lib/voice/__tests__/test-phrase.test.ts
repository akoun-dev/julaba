import { describe, it, expect } from 'vitest'
import {
  getVoiceTestPhrase,
  VOICE_TEST_PHRASE_FR,
  VOICE_TEST_PHRASE_DYU,
  VOICE_TEST_PHRASE_DYU_FALLBACK,
} from '../test-phrase'

/**
 * MODE-913 + MODE-914 — phrase de test de voix consciente de la langue.
 *
 * Remontée terrain : le marchand sélectionne « Dioula » dans Voix & Langue,
 * appuie sur « Tester la voix »… et entend du français sans explication. Le
 * test doit s'expliquer lui-même. Depuis MODE-914 (voix dioula opt-in), la
 * phrase dyu a DEUX régimes :
 *  - voix installée  → phrase RÉELLE en dioula, lue par la voix MMS dyu ;
 *  - voix absente    → phrase d'explication française (chaîne de repli).
 */
describe('phrase de test de voix selon la langue sélectionnée (MODE-913/914)', () => {
  it('fr : phrase historique STRICTEMENT inchangée', () => {
    expect(getVoiceTestPhrase('fr')).toBe(VOICE_TEST_PHRASE_FR)
    expect(getVoiceTestPhrase('fr')).toBe(
      'Bonjour ! Je suis Tata Nanti Lou. Tu m\'entends bien ?'
    )
    // L'option dyuVoiceReady ne touche PAS la langue française.
    expect(getVoiceTestPhrase('fr', { dyuVoiceReady: true })).toBe(VOICE_TEST_PHRASE_FR)
  })

  it('bci : phrase historique (test de la voix pilote MMS quand installée)', () => {
    expect(getVoiceTestPhrase('bci')).toBe(VOICE_TEST_PHRASE_FR)
    expect(getVoiceTestPhrase('bci', { dyuVoiceReady: true })).toBe(VOICE_TEST_PHRASE_FR)
    expect(getVoiceTestPhrase('bci')).not.toBe(VOICE_TEST_PHRASE_DYU)
  })

  it('dyu sans voix installée : phrase d\'explication audible (écoute OK, réponse française)', () => {
    const phrase = getVoiceTestPhrase('dyu')
    expect(phrase).toBe(VOICE_TEST_PHRASE_DYU_FALLBACK)
    expect(getVoiceTestPhrase('dyu', { dyuVoiceReady: false })).toBe(VOICE_TEST_PHRASE_DYU_FALLBACK)
    // L'honnêteté de la phrase : elle nomme la langue, l'écoute qui marche,
    // la réponse française et la voix à installer.
    expect(phrase).toContain('dioula')
    expect(phrase).toContain('français')
    expect(phrase).toContain('pas encore installée')
    expect(phrase).toContain('comprends')
  })

  it('dyu avec voix installée : phrase RÉELLE en dioula (test de la voix MMS dyu)', () => {
    const phrase = getVoiceTestPhrase('dyu', { dyuVoiceReady: true })
    expect(phrase).toBe(VOICE_TEST_PHRASE_DYU)
    // Énoncés jula simples (vocab checkpoint : a-z + ɛ ɔ, sans tons).
    expect(phrase).toContain('I ni ce')
    expect(phrase).toContain('N ye Tata ye')
    expect(phrase).toContain('baara')
    // Aucun caractère hors vocab du checkpoint (le normalisateur transformerait
    // tout symbolétranger en pause) : lettres, espaces, apostrophes, ɛ.
    expect(phrase).toMatch(/^[A-Za-zÀ-ÿŋɔɛɲ' !.?]+$/u)
  })

  it('dyu : la phrase dioula diffère VRAIMENT de l\'explication et du français', () => {
    expect(VOICE_TEST_PHRASE_DYU).not.toBe(VOICE_TEST_PHRASE_DYU_FALLBACK)
    expect(VOICE_TEST_PHRASE_DYU).not.toBe(VOICE_TEST_PHRASE_FR)
  })
})
