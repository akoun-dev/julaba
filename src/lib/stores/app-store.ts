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
  // Marchand ET producteur partagent l'entrée multiUser : un seul écran de
  // connexion détecte le rôle du numéro (voir /api/auth/lookup) et redirige
  // vers le bon espace — l'écran prod-auth dédié n'est plus le point de
  // départ (gardé en repli dans le routeur).
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
  | 'academy-course'
  | 'profil'
  // Identificateur routes
  | 'ident-auth'
  | 'ident-home'
  | 'ident-suivi'
  | 'ident-missions'
  | 'ident-brouillons'
  | 'ident-identification'
  | 'ident-dossier-detail'
  | 'ident-profil'
  | 'ident-parametres'
  | 'ident-dossier-detail'
  // Producteur routes
  | 'prod-auth'
  | 'prod-home'
  | 'prod-recoltes'
  | 'prod-commandes'
  | 'prod-stock'
  | 'prod-cycles'
  | 'prod-profil'
  // Backoffice routes
  | 'bo-auth'
  | 'bo-administration'
  | 'bo-dashboard'
  | 'bo-acteurs'
  | 'bo-enrolement'
  | 'bo-zones'
  | 'bo-missions'
  | 'bo-identificateurs'
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
  merchantSexe: 'masculin' | 'feminin' | 'autre' | null
  /** Classification du marchand : détaillant / semi-grossiste / grossiste
   * (voir src/lib/marchand-categories.ts). Provisionnée au login, dérivée du
   * dossier d'enrôlement si le compte est antérieur à la classification. */
  merchantCategorie: 'detaillant' | 'semi_grossiste' | 'grossiste' | null
  setAuth: (
    id: string, name: string, phone: string,
    sexe?: 'masculin' | 'feminin' | 'autre' | null,
    categorie?: 'detaillant' | 'semi_grossiste' | 'grossiste' | null,
  ) => void
  logout: () => void

  // UI state
  darkMode: boolean
  toggleDarkMode: () => void
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
  voiceVolume: number
  setVoiceVolume: (v: number) => void
  voiceRate: number
  setVoiceRate: (v: number) => void
  voiceConfirmation: 'always' | 'never' | 'high-amount'
  setVoiceConfirmation: (v: 'always' | 'never' | 'high-amount') => void
  voiceHistory: VoiceEntry[]
  addVoiceEntry: (entry: VoiceEntry) => void
  voiceAutoRecord: boolean
  setVoiceAutoRecord: (v: boolean) => void
  voiceStopRequested: boolean
  requestVoiceStop: () => void

  // Wake word
  wakeWordEnabled: boolean
  toggleWakeWord: () => void

  // Caisse voice action
  showOpenCaisseModal: boolean
  openOpenCaisseModal: () => void
  closeOpenCaisseModal: () => void

  // Vente rapide voice action
  showVenteRapideModal: boolean
  openVenteRapideModal: () => void
  closeVenteRapideModal: () => void

  // Academy reader — id of the course being read on the 'academy-course'
  // screen. Kept in the store (not a modal/component state) because the
  // reader is navigated to like any other screen and must survive the
  // ScreenRouter remounting it, while deliberately NOT persisted: a session
  // restored mid-course goes back to the Academy list instead of claiming
  // to know where the merchant stopped reading.
  academyCourseId: string | null
  openAcademyCourse: (courseId: string) => void
  closeAcademyCourse: () => void
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
      merchantSexe: null,
      merchantCategorie: null,
      setAuth: (id, name, phone, sexe, categorie) => {
        const role = get().userRole
        set({
          isAuthenticated: true,
          merchantId: id,
          merchantName: name,
          merchantPhone: phone,
          merchantSexe: sexe ?? null,
          // undefined = info non disponible (login hors-ligne) : conserver la
          // valeur persistée plutôt que d'effacer la classification connue.
          // null explicite = serveur a répondu sans catégorie.
          merchantCategorie: categorie === undefined ? get().merchantCategorie : (categorie ?? null),
          currentScreen: homeScreenForRole(role),
        })
        // Binds this device to the account server-side (see
        // device-session.ts) — marchand/producteur/identificateur all
        // authenticate purely locally (PIN checked on-device), so without
        // this the API would have no way to tell a legitimate request from
        // anyone who simply knows this id.
        if (role === 'marchand' || role === 'producteur' || role === 'identificateur') {
          const subjectType = role === 'marchand' ? 'merchant' : role
          import('@/lib/claim-device-session').then(({ claimDeviceSession }) => {
            claimDeviceSession(subjectType, id).then(() => {
              // Chained after the claim (not fired in parallel) because the
              // device cookie it relies on is only set once that request's
              // response has landed — see /api/session/link-actor. Backfills
              // the backoffice's "Acteurs" registry for self-service
              // accounts, which otherwise never appear there at all.
              if (role === 'marchand' || role === 'producteur') {
                fetch('/api/session/link-actor', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ subjectType, id, firstName: name, phone }),
                }).catch(() => {})
              }
            }).catch(() => {})
          })
        }
      },
      logout: () => {
        const authScreen = authScreenForRole(get().userRole)
        set({
          isAuthenticated: false,
          merchantId: null,
          merchantName: null,
          merchantPhone: null,
          merchantSexe: null,
          merchantCategorie: null,
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
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode, soleilMode: state.darkMode ? state.soleilMode : false })),
      soleilMode: false,
      toggleSoleil: () => set((state) => ({ soleilMode: !state.soleilMode, darkMode: state.soleilMode ? state.darkMode : false })),
      showVoiceModal: false,
      voiceModalKey: 0,
      // Bumping voiceModalKey remounts VoiceModal/ProdVoiceModal (they key
      // off it), which aborts whatever that instance was mid-doing — most
      // importantly the RAF-scheduled auto-listen a wake-word detection or
      // press-and-hold just kicked off. A second openVoiceModal() call
      // while the modal is already open (a double-fired caller, a fast
      // double-press) must not tear that down, so this only bumps the key
      // on an actual open.
      openVoiceModal: () => {
        if (get().showVoiceModal) return
        set({ showVoiceModal: true, voiceModalKey: get().voiceModalKey + 1 })
      },
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
      voiceVolume: 100,
      setVoiceVolume: (v) => set({ voiceVolume: v }),
      voiceRate: 0.9,
      setVoiceRate: (v) => set({ voiceRate: v }),
      voiceConfirmation: 'always',
      setVoiceConfirmation: (v) => set({ voiceConfirmation: v }),
      voiceAutoRecord: false,
      setVoiceAutoRecord: (v) => set({ voiceAutoRecord: v }),
      voiceStopRequested: false,
      requestVoiceStop: () => set({ voiceStopRequested: true }),

      // Wake word
      wakeWordEnabled: true,
      toggleWakeWord: () => set({ wakeWordEnabled: !get().wakeWordEnabled }),

      // Caisse voice action
      showOpenCaisseModal: false,
      openOpenCaisseModal: () => set({ showOpenCaisseModal: true }),
      closeOpenCaisseModal: () => set({ showOpenCaisseModal: false }),

      // Vente rapide voice action
      showVenteRapideModal: false,
      openVenteRapideModal: () => set({ showVenteRapideModal: true }),
      closeVenteRapideModal: () => set({ showVenteRapideModal: false }),
      voiceHistory: [],

      // Academy reader
      academyCourseId: null,
      openAcademyCourse: (courseId) =>
        set({
          academyCourseId: courseId,
          previousScreen: get().currentScreen,
          currentScreen: 'academy-course',
        }),
      closeAcademyCourse: () => set({ academyCourseId: null }),
      addVoiceEntry: (entry) =>
        set((s) => ({
          voiceHistory: [entry, ...s.voiceHistory].slice(0, 20),
        })),
    }),
    {
      name: 'julaba-app-store',
      partialize: (state) => ({
        darkMode: state.darkMode,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        soleilMode: state.soleilMode,
        voiceEnabled: state.voiceEnabled,
        voiceVolume: state.voiceVolume,
        voiceRate: state.voiceRate,
        voiceConfirmation: state.voiceConfirmation,
        wakeWordEnabled: state.wakeWordEnabled,
        currentScreen: state.currentScreen,
        userRole: state.userRole,
        isAuthenticated: state.isAuthenticated,
        merchantId: state.merchantId,
        merchantName: state.merchantName,
        merchantPhone: state.merchantPhone,
        merchantSexe: state.merchantSexe,
        merchantCategorie: state.merchantCategorie,
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
