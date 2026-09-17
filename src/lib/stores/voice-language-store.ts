import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Sélecteur de langue de reconnaissance vocale (Task 32).
 *
 * État global persisté (localStorage) lu par stt-factory au moment de créer
 * chaque session STT : 'fr' route vers VoiceService natif (sherpa-onnx
 * batch) puis chaîne historique ; 'bci' route vers le slot Baoulé du
 * VoiceService — erreur explicite BAOULE_NOT_READY tant que le benchmark
 * du POC julaba-baoule-asr-poc n'est pas validé (mission §18, aucun
 * fallback silencieux vers le français).
 */
export type SelectedVoiceLanguage = 'fr' | 'bci'

interface VoiceLanguageState {
  sttLanguage: SelectedVoiceLanguage
  setSTTLanguage: (lang: SelectedVoiceLanguage) => void
}

export const useVoiceLanguageStore = create<VoiceLanguageState>()(
  persist(
    (set) => ({
      sttLanguage: 'fr',
      setSTTLanguage: (sttLanguage) => set({ sttLanguage }),
    }),
    { name: 'julaba-voice-language' }
  )
)

/** Accès hors React (stt-factory, helpers) — sans hook. */
export function getSelectedVoiceLanguage(): SelectedVoiceLanguage {
  return useVoiceLanguageStore.getState().sttLanguage
}
