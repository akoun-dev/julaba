// Phrase de test de voix consciente de la langue sélectionnée (MODE-913,
// étendu MODE-914).
//
// Le bouton « Tester la voix » de l'écran Voix & Langue prononçait une
// phrase française fixe quelle que soit la langue choisie : le marchand qui
// sélectionnait le dioula entendait du français sans explication — le seul
// signal du repli était un console.info invisible (remontée terrain
// 2026-09-20). Mission §« jamais de repli silencieux » : le test doit
// s'expliquer LUI-MÊME, à voix haute, au moment précis où l'écart est
// entendu.
//
//  - 'fr'  : phrase historique, inchangée ;
//  - 'bci' : phrase historique — elle est lue par la voix pilote MMS quand
//    elle est installée (c'est précisément son test), sinon repli français
//    déjà documenté par la carte pilote et la notice de l'écran ;
//  - 'dyu' : DEUX phrases (MODE-914) :
//      • voix dioula INSTALLÉE → phrase réelle en dioula, lue par la voix
//        MMS dyu (port facebook/mms-tts-dyu — c'est son test) ;
//      • voix NON installée → phrase d'explication française (écoute dioula
//        OK, réponse française, voix à installer) — lue par la chaîne
//        française de repli.
//
// Module PUR (aucun import moteur) : testable sans DOM, consommé par
// voix-settings.tsx (qui sonde isMmsDyuVoiceReady() au clic).
import type { SelectedVoiceLanguage } from '../stores/voice-language-store'

/** Phrase historique (fr et bci — comportement inchangé). */
export const VOICE_TEST_PHRASE_FR =
  'Bonjour ! Je suis Tata Nanti Lou. Tu m\'entends bien ?'

/**
 * Phrase dioula RÉELLE (voix installée) — énoncés jula simples, dans le
 * vocab du checkpoint (a-z + ŋ ɔ ɛ ɲ) : « Bonjour ! Je suis Tata. On peut
 * travailler. » Segments proches des échantillons validés par le produit
 * (synthèse Python, download/voix-dyu/).
 */
export const VOICE_TEST_PHRASE_DYU =
  'I ni ce ! N ye Tata ye. An bɛ se ka baara kɛ.'

/** Phrase dyu de repli (voix NON installée) : s'explique elle-même. */
export const VOICE_TEST_PHRASE_DYU_FALLBACK =
  'Dioula sélectionné. Je comprends quand tu me parles en dioula, ' +
  'mais je te réponds en français : la voix dioula n\'est pas encore installée.'

export function getVoiceTestPhrase(
  lang: SelectedVoiceLanguage,
  options?: { dyuVoiceReady?: boolean },
): string {
  if (lang === 'dyu') {
    return options?.dyuVoiceReady ? VOICE_TEST_PHRASE_DYU : VOICE_TEST_PHRASE_DYU_FALLBACK
  }
  return VOICE_TEST_PHRASE_FR
}
