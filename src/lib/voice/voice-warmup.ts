import type { SelectedVoiceLanguage } from '../stores/voice-language-store'

/**
 * Préchauffe les moteurs déjà installés après un changement de langue.
 * Les imports restent dynamiques afin que le sélecteur français n'alourdisse
 * pas le bundle initial avec NLLB, MMS et ONNX Runtime.
 */
export function warmMultilingualVoice(language: Exclude<SelectedVoiceLanguage, 'fr'>): void {
  void Promise.all([
    import('./nllb-translation').then(({ warmNllbModel }) => warmNllbModel(language)),
    import('./mms-tts').then(({ warmMmsVoice }) => warmMmsVoice(language)),
  ])
}
