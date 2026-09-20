// Phrase de test de voix consciente de la langue sélectionnée (MODE-913,
// étendu MODE-914, puis MODE-916 pour le régime baoulé).
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
//  - 'bci' : DEUX phrases (MODE-916, remontée terrain 2026-09-20 « le
//    baoulé parle français ») :
//      • voix pilote INSTALLÉE → phrase RÉELLE en baoulé (traduction du
//        finetune nllb-baoule-v1), lue par la voix pilote MMS (donor akan —
//        c'est précisément son test) ;
//      • voix NON installée → phrase d'explication française — l'ancien
//        régime (phrase historique française lue par la voix pilote) faisait
//        croire que « le baoulé parle français » même quand tout marchait ;
//  - 'dyu' : DEUX phrases (MODE-914) :
//      • voix dioula INSTALLÉE → phrase réelle en dioula, lue par la voix
//        MMS dyu (port facebook/mms-tts-dyu — c'est son test) ;
//      • voix NON installée → phrase d'explication française (écoute dioula
//        OK, réponse française, voix à installer) — lue par la chaîne
//        française de repli.
//
// Module PUR (aucun import moteur) : testable sans DOM, consommé par
// voix-settings.tsx (qui sonde isMmsDyuVoiceReady() ET isMmsBciVoiceReady()
// au clic et en continu).
import type { SelectedVoiceLanguage } from '../stores/voice-language-store'
import type { SpokenChain } from './spoken-chain'

/**
 * Chaîne de lecture réellement utilisée par la dernière narration Tata
 * (remontée par tata-tts/mms-tts via spoken-chain.ts). Permet à l'écran
 * d'afficher la VÉRITÉ après un test : si la voix MMS a échoué au moment de
 * la lecture et que le repli français a pris le relais, la légende le dit —
 * jamais de succès affiché qui contredise ce que l'utilisateur vient
 * d'entendre.
 */
export type VoiceTestSpokenChain = SpokenChain

/** État de préparation des voix MMS, sondé par l'écran (jamais supposé). */
export type VoiceTestReadiness = {
  bciVoiceReady?: boolean
  dyuVoiceReady?: boolean
}

/** Moment de la légende : avant le clic, pendant, ou après un succès. */
export type VoiceTestCaptionPhase = 'avant' | 'lecture' | 'succes'

/** Phrase historique (fr — comportement inchangé). */
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

/**
 * Phrase baoulé RÉELLE (voix pilote installée) — MODE-916. Traduction
 * fra→bci générée par le finetune GaindeNdiaye/nllb-baoule-v1 (port ONNX q8,
 * génération vérifiée au sandbox le 2026-09-20 : « Yo! N ti Baba Nanti Lou. »
 * et « A ti min nuan? » — phrases des échantillons écoutés par le produit).
 * Décision produit documentée : le nom propre TATA est conservé (le modèle
 * l'avait retraduit « Baba »). Bêta — chrF++ du finetune 10,4 (fr→bci) :
 * à revalider avec des locuteurs natifs.
 */
export const VOICE_TEST_PHRASE_BCI =
  'Yo! N ti Tata Nanti Lou. A ti min nuan?'

/** Phrase bci de repli (voix pilote NON installée) : s'explique elle-même. */
export const VOICE_TEST_PHRASE_BCI_FALLBACK =
  'Baoulé sélectionné. Je comprends quand tu me parles en baoulé, ' +
  'mais je te réponds en français : la voix baoulé pilote n\'est pas encore installée.'

/** Phrase dyu de repli (voix NON installée) : s'explique elle-même. */
export const VOICE_TEST_PHRASE_DYU_FALLBACK =
  'Dioula sélectionné. Je comprends quand tu me parles en dioula, ' +
  'mais je te réponds en français : la voix dioula n\'est pas encore installée.'

export function getVoiceTestPhrase(
  lang: SelectedVoiceLanguage,
  options?: { dyuVoiceReady?: boolean; bciVoiceReady?: boolean },
): string {
  if (lang === 'dyu') {
    return options?.dyuVoiceReady ? VOICE_TEST_PHRASE_DYU : VOICE_TEST_PHRASE_DYU_FALLBACK
  }
  if (lang === 'bci') {
    return options?.bciVoiceReady ? VOICE_TEST_PHRASE_BCI : VOICE_TEST_PHRASE_BCI_FALLBACK
  }
  return VOICE_TEST_PHRASE_FR
}

/**
 * Légende ÉCRITE du test de voix (remontée terrain 2026-09-20 : « le test ne
 * fonctionne pas » quand le repli français s'applique — l'utilisateur ne
 * savait pas quelle voix allait parler ni ce qui venait de parler).
 *
 *  - 'avant'   : ce que dira le test selon la langue ET les voix réellement
 *                installées dans CE navigateur (sondées, jamais supposées) —
 *                pointe vers la carte d'installation quand il manque quelque
 *                chose ;
 *  - 'lecture' : état transitoire pendant la synthèse/lecture ;
 *  - 'succes'  : ce qui a RÉELLEMENT parlé (chain remonté par tata-tts) —
 *                si la voix MMS espérée a laissé place au repli français,
 *                la légende le dit explicitement.
 */
export function getVoiceTestCaption(
  lang: SelectedVoiceLanguage,
  phase: VoiceTestCaptionPhase,
  readiness?: VoiceTestReadiness,
  spokenChain?: VoiceTestSpokenChain | null,
): string {
  if (phase === 'lecture') return 'Lecture en cours…'

  if (lang === 'dyu') {
    const ready = readiness?.dyuVoiceReady === true
    if (phase === 'avant') {
      return ready
        ? 'Le test dira la phrase en dioula avec la voix dioula (hors ligne).'
        : 'Voix dioula non installée dans ce navigateur : le test s\'expliquera en français. Installe la voix dioula ci-dessous (~114 Mo).'
    }
    return spokenChain === 'mms-dyu'
      ? 'Lu avec la voix dioula (hors ligne).'
      : 'Lu avec la voix française : la voix dioula n\'a pas pu être utilisée — réinstalle-la ci-dessous si besoin.'
  }

  if (lang === 'bci') {
    const ready = readiness?.bciVoiceReady === true
    if (phase === 'avant') {
      return ready
        ? 'Le test dira la phrase en baoulé avec la voix baoulé pilote (hors ligne, qualité limitée).'
        : 'Voix baoulé pilote non installée dans ce navigateur : le test s\'expliquera en français. Installe la voix pilote ci-dessous (~114 Mo).'
    }
    return spokenChain === 'mms-bci'
      ? 'Lu avec la voix baoulé pilote (hors ligne).'
      : 'Lu avec la voix française : la voix baoulé pilote n\'a pas pu être utilisée — réinstalle-la ci-dessous si besoin.'
  }

  if (phase === 'avant') {
    return 'Le test dira la phrase historique avec la voix française de l\'appareil.'
  }
  return 'Lu avec la voix française de l\'appareil.'
}
