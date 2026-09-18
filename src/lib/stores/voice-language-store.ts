import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Langue de la voix Jùlaba (Task 32, Baoulé intégré Task 35, réglage par
 * défaut Task 40).
 *
 * Deux facettes réglées ensemble depuis les écrans de réglages (marchand
 * « Voix & Langue », producteur « Réglages de la voix ») via
 * setVoiceLanguage :
 *  - sttLanguage : langue de DICTÉE par défaut — lu par stt-factory au
 *    moment de créer chaque session STT quand options.lang est absent.
 *    'fr' route vers VoiceService natif (sherpa-onnx batch) puis chaîne
 *    historique ; 'bci' route vers le slot Baoulé du VoiceService — erreur
 *    explicite BAOULE_NOT_READY tant que le modèle n'est pas embarqué
 *    (mission §18, aucun fallback silencieux vers le français).
 *  - ttsLanguage : langue de NARRATION Tata — lu par tata-tts. Aucune
 *    synthèse vocale baoulé n'existe dans la pile (natif/Web Speech/Kokoro/
 *    Piper = français) : en 'bci', Tata narré en français et le signale
 *    explicitement (notifyBciNarrationLimitOnce) — jamais un échec muet.
 *
 * Le sélecteur des modales vocales écrit les deux facettes (setVoiceLanguage) ;
 * setSTTLanguage reste pour compat (Task 32) et ne touche que la dictée.
 */
export type SelectedVoiceLanguage = 'fr' | 'bci'

interface VoiceLanguageState {
  sttLanguage: SelectedVoiceLanguage
  ttsLanguage: SelectedVoiceLanguage
  setSTTLanguage: (lang: SelectedVoiceLanguage) => void
  setTTSLanguage: (lang: SelectedVoiceLanguage) => void
  /** Réglage par défaut (écrans de réglages + sélecteur des modales). */
  setVoiceLanguage: (lang: SelectedVoiceLanguage) => void
}

export const useVoiceLanguageStore = create<VoiceLanguageState>()(
  persist(
    (set) => ({
      sttLanguage: 'fr',
      ttsLanguage: 'fr',
      setSTTLanguage: (sttLanguage) => set({ sttLanguage }),
      setTTSLanguage: (ttsLanguage) => set({ ttsLanguage }),
      setVoiceLanguage: (lang) => set({ sttLanguage: lang, ttsLanguage: lang }),
    }),
    { name: 'julaba-voice-language' }
  )
)

/** Accès hors React (stt-factory, helpers) — sans hook. */
export function getSelectedVoiceLanguage(): SelectedVoiceLanguage {
  return useVoiceLanguageStore.getState().sttLanguage
}

/** Accès hors React à la langue de narration Tata (tata-tts). */
export function getSelectedTtsLanguage(): SelectedVoiceLanguage {
  return useVoiceLanguageStore.getState().ttsLanguage
}
