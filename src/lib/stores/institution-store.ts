import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type BoRole } from '@/lib/backoffice-permissions'

// Univers institution (AUDIT_MATRICE_47_CAS I-01) — store Zustand persisté
// calqué sur le motif de backoffice-store.ts : insUser N'EST JAMAIS persisté
// (revendication sensible), il vient uniquement de la session serveur à
// chaque rechargement via checkInsSession() sur onRehydrateStorage.

export interface InsUser {
  id: string
  email: string
  name: string
  role: BoRole
  zone: string | null
  isActive: boolean
}

interface InstitutionState {
  insUser: InsUser | null
  insUserRole: BoRole
  insSessionChecked: boolean

  setInsAuth: (user: InsUser) => void
  checkInsSession: () => Promise<void>
  insLogout: () => Promise<void>
}

export const useInstitutionStore = create<InstitutionState>()(
  persist(
    (set) => ({
      insUser: null,
      insUserRole: 'institution',
      insSessionChecked: false,

      setInsAuth: (user) =>
        set({ insUser: user, insUserRole: user.role as BoRole, insSessionChecked: true }),

      // Seule source d'autorité : GET /api/backoffice/session (cookie httpOnly).
      // Un utilisateur connecté dans bo_users avec un autre rôle n'est PAS
      // un utilisateur institution — on reste en échec-fermé (insUser null).
      checkInsSession: async () => {
        try {
          const res = await fetch('/api/backoffice/session')
          if (!res.ok) {
            set({ insUser: null, insSessionChecked: true })
            return
          }
          const user = (await res.json()) as {
            id: string
            email: string
            name: string
            role: string
            zone: string | null
            isActive: boolean
          }
          if (user.role === 'institution') {
            set({
              insUser: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: 'institution',
                zone: user.zone,
                isActive: user.isActive,
              },
              insUserRole: 'institution',
              insSessionChecked: true,
            })
          } else {
            set({ insUser: null, insSessionChecked: true })
          }
        } catch {
          set({ insUser: null, insSessionChecked: true })
        }
      },

      insLogout: async () => {
        try {
          await fetch('/api/backoffice/logout', { method: 'POST' })
        } catch {
          // best-effort — l'état local est nettoyé quoi qu'il arrive
        }
        set({ insUser: null })
      },
    }),
    {
      name: 'julaba-institution-store',
      // Aucune valeur persistée : la session est re-vérifiée côté serveur à
      // chaque rechargement (même garde de sécurité que boUser/boUserRole).
      partialize: () => ({}),
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          void state.checkInsSession()
        }
      },
    }
  )
)