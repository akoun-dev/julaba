import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ScreenRoute =
  | 'auth'
  | 'register'
  | 'home'
  | 'caisse'
  | 'stock'
  | 'depenses'
  | 'ventes'
  | 'marche'
  | 'commandes'
  | 'tontines'
  | 'keiwa'
  | 'fidelite'
  | 'protection-sociale'
  | 'academy'
  | 'support'
  | 'profil'
  | 'parametres'

interface AppState {
  // Navigation
  currentScreen: ScreenRoute
  previousScreen: ScreenRoute | null
  navigate: (screen: ScreenRoute) => void
  goBack: () => void

  // Auth state
  isAuthenticated: boolean
  merchantId: string | null
  merchantName: string | null
  merchantPhone: string | null
  setAuth: (id: string, name: string, phone: string) => void
  logout: () => void

  // UI state
  soleilMode: boolean
  toggleSoleil: () => void
  showVoiceModal: boolean
  openVoiceModal: () => void
  closeVoiceModal: () => void
  showDaySummary: boolean
  toggleDaySummary: () => void
  showCloseDay: boolean
  openCloseDay: () => void
  closeCloseDay: () => void

  // Cart state (for caisse)
  hasActiveCart: boolean
  setHasActiveCart: (v: boolean) => void

  // Voice state
  voiceEnabled: boolean
  toggleVoice: () => void
  voiceHistory: VoiceEntry[]
  addVoiceEntry: (entry: VoiceEntry) => void
}

export interface VoiceEntry {
  id: string
  transcript: string
  intent: string
  response: string
  timestamp: number
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentScreen: 'auth',
      previousScreen: null,
      navigate: (screen) =>
        set({
          previousScreen: get().currentScreen,
          currentScreen: screen,
        }),
      goBack: () => {
        const prev = get().previousScreen
        if (prev) set({ currentScreen: prev, previousScreen: null })
      },

      // Auth
      isAuthenticated: false,
      merchantId: null,
      merchantName: null,
      merchantPhone: null,
      setAuth: (id, name, phone) =>
        set({
          isAuthenticated: true,
          merchantId: id,
          merchantName: name,
          merchantPhone: phone,
          currentScreen: 'home',
        }),
      logout: () =>
        set({
          isAuthenticated: false,
          merchantId: null,
          merchantName: null,
          merchantPhone: null,
          currentScreen: 'auth',
        }),

      // UI
      soleilMode: false,
      toggleSoleil: () => set({ soleilMode: !get().soleilMode }),
      showVoiceModal: false,
      openVoiceModal: () => set({ showVoiceModal: true }),
      closeVoiceModal: () => set({ showVoiceModal: false }),
      showDaySummary: false,
      toggleDaySummary: () => set({ showDaySummary: !get().showDaySummary }),
      showCloseDay: false,
      openCloseDay: () => set({ showCloseDay: true }),
      closeCloseDay: () => set({ showCloseDay: false }),

      // Cart
      hasActiveCart: false,
      setHasActiveCart: (v) => set({ hasActiveCart: v }),

      // Voice
      voiceEnabled: true,
      toggleVoice: () => set({ voiceEnabled: !get().voiceEnabled }),
      voiceHistory: [],
      addVoiceEntry: (entry) =>
        set((s) => ({
          voiceHistory: [entry, ...s.voiceHistory].slice(0, 20),
        })),
    }),
    {
      name: 'julaba-app-store',
      partialize: (state) => ({
        soleilMode: state.soleilMode,
        voiceEnabled: state.voiceEnabled,
        voiceHistory: state.voiceHistory,
        isAuthenticated: state.isAuthenticated,
        merchantId: state.merchantId,
        merchantName: state.merchantName,
        merchantPhone: state.merchantPhone,
        hasActiveCart: state.hasActiveCart,
      }),
    }
  )
)
