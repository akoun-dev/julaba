import { describe, it, expect } from 'vitest'
import {
  getVoiceTestPhrase,
  getVoiceTestCaption,
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

describe('légende écrite du test de voix (remontée terrain 2026-09-20)', () => {
  it('dyu, avant le clic : dit la vérité sur ce qui va parler (installée ou non)', () => {
    const ok = getVoiceTestCaption('dyu', 'avant', { dyuVoiceReady: true })
    expect(ok).toContain('dioula')
    expect(ok).toContain('dira')
    expect(ok).not.toContain('Installe')
    const ko = getVoiceTestCaption('dyu', 'avant', { dyuVoiceReady: false })
    expect(ko).toContain('non installée dans ce navigateur')
    expect(ko).toContain('français')
    expect(ko).toContain('ci-dessous')
    // Readiness absente = non installée (jamais supposée prête).
    expect(getVoiceTestCaption('dyu', 'avant')).toBe(ko)
  })

  it('dyu, succès : la chaîne RÉELLE fait foi (MMS dioula vs repli français)', () => {
    const mms = getVoiceTestCaption('dyu', 'succes', { dyuVoiceReady: true }, 'mms-dyu')
    expect(mms).toContain('voix dioula')
    expect(mms).toContain('hors ligne')
    const repli = getVoiceTestCaption('dyu', 'succes', { dyuVoiceReady: true }, 'webspeech')
    expect(repli).toContain('voix française')
    expect(repli).toContain('pas pu être utilisée')
    // Chaîne inconnue/null = repli (honnêteté par défaut).
    expect(getVoiceTestCaption('dyu', 'succes', { dyuVoiceReady: true }, null)).toBe(repli)
  })

  it('bci, avant et succès : pilote MMS vs repli français, toujours explicite', () => {
    const ok = getVoiceTestCaption('bci', 'avant', { bciVoiceReady: true })
    expect(ok).toContain('baoulé pilote')
    const ko = getVoiceTestCaption('bci', 'avant', { bciVoiceReady: false })
    expect(ko).toContain('non installée dans ce navigateur')
    expect(ko).toContain('ci-dessous')
    const mms = getVoiceTestCaption('bci', 'succes', { bciVoiceReady: true }, 'mms-bci')
    expect(mms).toContain('baoulé pilote')
    const repli = getVoiceTestCaption('bci', 'succes', { bciVoiceReady: true }, 'native')
    expect(repli).toContain('voix française')
    expect(repli).toContain('pas pu être utilisée')
  })

  it('fr : inchangée par la readiness et par la chaîne (voix française)', () => {
    const avant = getVoiceTestCaption('fr', 'avant')
    expect(avant).toContain('française')
    expect(getVoiceTestCaption('fr', 'avant', { dyuVoiceReady: true, bciVoiceReady: true })).toBe(avant)
    const succes = getVoiceTestCaption('fr', 'succes', undefined, 'native')
    expect(succes).toContain('française')
    expect(getVoiceTestCaption('fr', 'succes', undefined, 'webspeech')).toBe(succes)
  })

  it('lecture : état transitoire unique, quelle que soit la langue', () => {
    expect(getVoiceTestCaption('fr', 'lecture')).toBe('Lecture en cours…')
    expect(getVoiceTestCaption('dyu', 'lecture', { dyuVoiceReady: true })).toBe('Lecture en cours…')
    expect(getVoiceTestCaption('bci', 'lecture')).toBe('Lecture en cours…')
  })
})
