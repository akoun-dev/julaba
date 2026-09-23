import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createBoUiSlice } from '@/lib/backoffice/bo-ui-slice'
import { createBoDataSlice } from '@/lib/backoffice/bo-data-slice'
import { createBoObjectifsSlice } from '@/lib/backoffice/bo-objectifs-slice'
import { createBoIdentSlice } from '@/lib/backoffice/bo-ident-slice'
import { createBoMutationsSlice } from '@/lib/backoffice/bo-mutations-slice'
import type { BackofficeState } from '@/lib/backoffice/bo-state'
import { type BoRole, type ModuleName, MODULE_LIST, MODULE_ACCESS, MODULE_LABELS, hasModuleAccess } from '@/lib/backoffice-permissions'

// MODE-990 (DET-001 tranche 4) — le store devient COMBINÉ de slices :
// les types (bo-models), les mappers API purs testés (api-mappers), la
// structure de la sidebar (bo-sidebar) et cinq slices (ui/data/objectifs/
// ident/mutations) vivent dans src/lib/backoffice/ — tous les corps
// VERBATIM (preuve octet-pour-octet via le script de chirurgie persisté).
// L'API publique ci-dessous est ré-exportée à l'identique : les 45
// consommateurs restent inchangés.

export type { BoRole, ModuleName }
// ROLE_HIERARCHY et getAccessibleModules restent exportés par leur module
// source (backoffice-permissions) : aucun écran ne les consommait via le
// store, cette réexportation morte a été retirée.
export { MODULE_LIST, MODULE_ACCESS, MODULE_LABELS, hasModuleAccess }

export type {
  BoUser, BoActor, BoEnrolment, BoZone, BoMissionAssignee, BoMission, BoTeam,
  BoIdentificateur, BoObjectif, BoAlertRule, AuditEntry, BoAlert, TickerData,
  DashboardData, BoErrorDomain, BoScreenRoute,
} from '@/lib/backoffice/bo-models'

export {
  BO_COLOR, BO_COLOR_PRIMARY, BO_COLOR_LIGHT, BO_COLOR_BG, BO_COLOR_BORDER,
  ROLE_LABELS, STATUS_COLORS, STATUS_LABELS, SEVERITY_COLORS,
  ACTOR_TYPE_LABELS, ACTOR_TYPE_ICONS, ADMINISTRATION_ITEMS,
  hasSidebarItemAccess, SIDEBAR_GROUPS, SIDEBAR_ITEMS,
} from '@/lib/backoffice/bo-sidebar'
export type { SidebarItem, SidebarGroup } from '@/lib/backoffice/bo-sidebar'

export const useBackofficeStore = create<BackofficeState>()(
  persist(
    (...a) => ({
      ...createBoUiSlice(...a),
      ...createBoDataSlice(...a),
      ...createBoObjectifsSlice(...a),
      ...createBoIdentSlice(...a),
      ...createBoMutationsSlice(...a),
    }),
    {
      name: 'julaba-backoffice-store',
      // boUser/boUserRole are deliberately NOT persisted: they are a
      // security-relevant claim, and must always come from the server
      // session (checkBoSession), never from client-controlled storage.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        boCurrentScreen: state.boCurrentScreen,
        boTheme: state.boTheme,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (!error && state) {
            // Apply persisted theme to DOM
            if (typeof document !== 'undefined') {
              document.documentElement.classList.toggle('dark', state.boTheme === 'dark')
            }
            // Resolve the real, server-verified session before trusting
            // anything about who is logged in or what they can access.
            state.checkBoSession()
          }
        }
      },
    }
  )
)
