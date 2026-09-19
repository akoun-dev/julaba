// Phrase de test de voix consciente de la langue sélectionnée (MODE-913).
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
//  - 'dyu' : aucune voix dioula n'existe dans la pile (mms-tts-dyu sans
//    port ONNX) — la phrase annonce explicitement que l'écoute dioula
//    fonctionne et que la réponse reste française.
//
// Module PUR (aucun import moteur) : testable sans DOM, consommé par
// voix-settings.tsx.
import type { SelectedVoiceLanguage } from '../stores/voice-language-store'

/** Phrase historique (fr et bci — comportement inchangé). */
export const VOICE_TEST_PHRASE_FR =
  'Bonjour ! Je suis Tata Nanti Lou. Tu m\'entends bien ?'

/** Phrase dyu : s'explique elle-même (écoute OK, réponse française). */
export const VOICE_TEST_PHRASE_DYU =
  'Écoute en dioula activée. Je comprends quand tu me parles en dioula, ' +
  'mais je te réponds en français : la voix dioula n\'est pas encore disponible.'

export function getVoiceTestPhrase(lang: SelectedVoiceLanguage): string {
  if (lang === 'dyu') return VOICE_TEST_PHRASE_DYU
  return VOICE_TEST_PHRASE_FR
}
