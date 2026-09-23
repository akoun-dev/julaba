// MODE-990 (DET-001 tranche 4) — slice UI du store back-office :
// session BO (checkBoSession = la seule source d'autorité), navigation,
// sidebar, loading/erreurs par domaine, thème, recherche, palette de
// commandes, demande de détail acteur. Corps VERBATIM du store
// (preuve octet-pour-octet) ; boUser n'est jamais persisté (voir le
// persist du store combiné).
import type { StateCreator } from 'zustand'
import { type BoRole } from '@/lib/backoffice-permissions'
import type { BoUser } from './bo-models'
import type { BackofficeState, BoUiState } from './bo-state'

export const createBoUiSlice: StateCreator<
  BackofficeState,
  [['zustand/persist', unknown]],
  [],
  BoUiState
> = (set, get) => ({
      // Auth
      boUser: null,
      boUserRole: 'admin_general' as BoRole,
      boSessionChecked: false,
      setBoAuth: (user) => set({ boUser: user, boUserRole: user.role as BoRole, boSessionChecked: true }),
      checkBoSession: async () => {
        try {
          const res = await fetch('/api/backoffice/session')
          if (!res.ok) {
            set({ boUser: null, boSessionChecked: true })
            return
          }
          const user = await res.json()
          set({
            boUser: {
              id: user.id, email: user.email, name: user.name, role: user.role,
              zone: user.zone || undefined, isActive: user.isActive, createdAt: '',
            },
            boUserRole: user.role as BoRole,
            boSessionChecked: true,
          })
          get().fetchAllData()
        } catch {
          set({ boUser: null, boSessionChecked: true })
        }
      },
      boLogout: async () => {
        try {
          await fetch('/api/backoffice/logout', { method: 'POST' })
        } catch {
          // best-effort — clear local state regardless
        }
        set({ boUser: null, boCurrentScreen: 'bo-dashboard' })
      },

      // Navigation
      boCurrentScreen: 'bo-dashboard',
      boNavigate: (screen) => set({ boCurrentScreen: screen }),

      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      // Loading & error
      loading: false,
      errors: {},
      setLoading: (v) => set({ loading: v }),
      setDomainError: (domain, message) =>
        set((s) => {
          const errors = { ...s.errors }
          if (message) errors[domain] = message
          else delete errors[domain]
          return { errors }
        }),

      // Theme
      boTheme: 'light' as const,
      toggleBoTheme: () => {
        set((s) => {
          const next = s.boTheme === 'light' ? 'dark' : 'light'
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', next === 'dark')
          }
          return { boTheme: next }
        })
      },

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Global command palette (Ctrl+K)
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Cross-screen actor detail request (opened from command palette)
      actorDetailRequestId: null,
      openActorDetail: (actorId) =>
        set({ actorDetailRequestId: actorId, boCurrentScreen: 'bo-acteurs' }),
      clearActorDetailRequest: () => set({ actorDetailRequestId: null }),
})
