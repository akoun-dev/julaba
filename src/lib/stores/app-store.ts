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
  // Onboarding
  hasCompletedOnboarding: boolean
  completeOnboarding: () => void

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
  voiceModalKey: number
  openVoiceModal: () => void
  closeVoiceModal: () => void
  showDaySummary: boolean
  toggleDaySummary: () => void
  showCloseDay: boolean
  openCloseDay: () => void
  closeCloseDay: () => void

  // Cart state derived from caisse-store (no longer stored here)

  // Voice state
  voiceEnabled: boolean
  toggleVoice: () => void
  voiceHistory: VoiceEntry[]
  addVoiceEntry: (entry: VoiceEntry) => void
  voiceAutoRecord: boolean
  setVoiceAutoRecord: (v: boolean) => void
  voiceStopRequested: boolean
  requestVoiceStop: () => void

  // Wake word
  wakeWordEnabled: boolean
  toggleWakeWord: () => void
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
      // Onboarding
      hasCompletedOnboarding: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

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
        if (prev) {
          // Prevent navigating back to auth when authenticated
          const isAuth = prev === 'auth' || prev === 'register'
          if (get().isAuthenticated && isAuth) {
            set({ currentScreen: 'home', previousScreen: null })
          } else {
            set({ currentScreen: prev, previousScreen: null })
          }
        }
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
          previousScreen: null,
          showVoiceModal: false,
          voiceAutoRecord: false,
          voiceStopRequested: false,
          showDaySummary: false,
          showCloseDay: false,
        }),

      // UI
      soleilMode: false,
      toggleSoleil: () => set({ soleilMode: !get().soleilMode }),
      showVoiceModal: false,
      voiceModalKey: 0,
      openVoiceModal: () => set({ showVoiceModal: true, voiceModalKey: get().voiceModalKey + 1 }),
      closeVoiceModal: () => set({ showVoiceModal: false }),
      showDaySummary: false,
      toggleDaySummary: () => set({ showDaySummary: !get().showDaySummary }),
      showCloseDay: false,
      openCloseDay: () => set({ showCloseDay: true }),
      closeCloseDay: () => set({ showCloseDay: false }),

      // Cart (managed by caisse-store)

      // Voice
      voiceEnabled: true,
      toggleVoice: () => set({ voiceEnabled: !get().voiceEnabled }),
      voiceAutoRecord: false,
      setVoiceAutoRecord: (v) => set({ voiceAutoRecord: v }),
      voiceStopRequested: false,
      requestVoiceStop: () => set({ voiceStopRequested: true }),

      // Wake word
      wakeWordEnabled: true,
      toggleWakeWord: () => set({ wakeWordEnabled: !get().wakeWordEnabled }),
      voiceHistory: [],
      addVoiceEntry: (entry) =>
        set((s) => ({
          voiceHistory: [entry, ...s.voiceHistory].slice(0, 20),
        })),
    }),
    {
      name: 'julaba-app-store',
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        soleilMode: state.soleilMode,
        voiceEnabled: state.voiceEnabled,
        voiceHistory: state.voiceHistory,
        isAuthenticated: state.isAuthenticated,
        merchantId: state.merchantId,
        merchantName: state.merchantName,
        merchantPhone: state.merchantPhone,
        wakeWordEnabled: state.wakeWordEnabled,
        currentScreen: state.currentScreen,
      }),
      // Ensure auth state consistency on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // If authenticated but on auth screen, redirect to home
          if (state.isAuthenticated && (state.currentScreen === 'auth' || state.currentScreen === 'register')) {
            state.currentScreen = 'home'
          }
          // If not authenticated but on a protected screen, go back to auth
          if (!state.isAuthenticated && state.currentScreen !== 'auth' && state.currentScreen !== 'register') {
            state.currentScreen = 'auth'
          }
        }
      },
    }
  )
)
