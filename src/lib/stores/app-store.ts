import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'marchand' | 'identificateur' | 'backoffice' | 'producteur'

function homeScreenForRole(role: UserRole): ScreenRoute {
  if (role === 'identificateur') return 'ident-home'
  if (role === 'backoffice') return 'bo-dashboard'
  if (role === 'producteur') return 'prod-home'
  return 'home'
}

function authScreenForRole(role: UserRole): ScreenRoute {
  if (role === 'identificateur') return 'ident-auth'
  if (role === 'backoffice') return 'bo-auth'
  if (role === 'producteur') return 'prod-auth'
  return 'auth'
}

export type ScreenRoute =
  // Marchand routes
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
  | 'profil'
  // Identificateur routes
  | 'ident-auth'
  | 'ident-home'
  | 'ident-suivi'
  | 'ident-brouillons'
  | 'ident-identification'
  | 'ident-profil'
  | 'ident-parametres'
  // Producteur routes
  | 'prod-auth'
  | 'prod-home'
  | 'prod-recoltes'
  | 'prod-commandes'
  | 'prod-stock'
  | 'prod-profil'
  // Backoffice routes
  | 'bo-auth'
  | 'bo-administration'
  | 'bo-dashboard'
  | 'bo-acteurs'
  | 'bo-enrolement'
  | 'bo-zones'
  | 'bo-missions'
  | 'bo-supervision'
  | 'bo-utilisateurs'
  | 'bo-rapports'
  | 'bo-audit'
  | 'bo-institutions'
  | 'bo-moderation'
  | 'bo-mutations'
  | 'bo-contenus'
  | 'bo-monitoring-ia'
  | 'bo-events'
  | 'bo-analytics'
  | 'bo-scores'
  | 'bo-api-keys'
  | 'bo-marketplace'
  | 'bo-livraison'
  | 'bo-communication'
  | 'bo-cron'
  | 'bo-config-institution'
  | 'bo-keiwa'

interface AppState {
  // Onboarding
  hasCompletedOnboarding: boolean
  completeOnboarding: () => void

  // User role
  userRole: UserRole
  setUserRole: (role: UserRole) => void

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

      // User role
      userRole: 'marchand' as UserRole,
      setUserRole: (role) => set({ userRole: role }),

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
          const isAuth = prev === 'auth' || prev === 'register' || prev === 'ident-auth' || prev === 'prod-auth'
          if (get().isAuthenticated && isAuth) {
            set({ currentScreen: homeScreenForRole(get().userRole), previousScreen: null })
          } else {
            set({ currentScreen: prev, previousScreen: null })
          }
        } else {
          // No previous screen — go to role-appropriate home
          set({ currentScreen: homeScreenForRole(get().userRole) })
        }
      },

      // Auth
      isAuthenticated: false,
      merchantId: null,
      merchantName: null,
      merchantPhone: null,
      setAuth: (id, name, phone) => {
        set({
          isAuthenticated: true,
          merchantId: id,
          merchantName: name,
          merchantPhone: phone,
          currentScreen: homeScreenForRole(get().userRole),
        })
      },
      logout: () => {
        const authScreen = authScreenForRole(get().userRole)
        set({
          isAuthenticated: false,
          merchantId: null,
          merchantName: null,
          merchantPhone: null,
          currentScreen: authScreen,
          previousScreen: null,
          showVoiceModal: false,
          voiceAutoRecord: false,
          voiceStopRequested: false,
          showDaySummary: false,
          showCloseDay: false,
        })
      },

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
        userRole: state.userRole,
      }),
      // Ensure auth state consistency on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isAuthScreen = state.currentScreen === 'auth' || state.currentScreen === 'register' || state.currentScreen === 'ident-auth' || state.currentScreen === 'bo-auth' || state.currentScreen === 'prod-auth'
          const homeScreen = homeScreenForRole(state.userRole)
          const authScreen = authScreenForRole(state.userRole)
          // If authenticated but on auth screen, redirect to home
          if (state.isAuthenticated && isAuthScreen) {
            state.currentScreen = homeScreen
          }
          // If not authenticated but on a protected screen, go back to auth
          if (!state.isAuthenticated && !isAuthScreen) {
            state.currentScreen = authScreen
          }
          // If authenticated but missing merchant data, redirect to home (except backoffice uses name only)
          if (state.isAuthenticated && !state.merchantName && state.userRole !== 'backoffice') {
            state.isAuthenticated = false
            state.currentScreen = authScreen
          }
          // Never restore to identification screen directly (always go through home)
          if (state.currentScreen === 'ident-identification') {
            state.currentScreen = homeScreen
          }
          // Never restore BO screens to auth
          if (state.userRole === 'backoffice' && state.isAuthenticated && state.currentScreen === 'bo-auth') {
            state.currentScreen = 'bo-dashboard'
          }
        }
      },
    }
  )
)
