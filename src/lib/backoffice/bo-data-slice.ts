// MODE-990 (DET-001 tranche 4) — slice données du store back-office :
// état initial des collections, fetches paginés (acteurs/enrôlements/audit
// à 100 par page), dashboard, et fetchAllData (garde MODULE_ACCESS
// MODE-948 : chaque rôle ne charge que ses modules). Corps VERBATIM du
// store (preuve octet-pour-octet).
import type { StateCreator } from 'zustand'
import type {
  BoUser, BoActor, BoEnrolment, BoZone, BoMission, BoTeam, BoIdentificateur,
  AuditEntry, BoAlert, TickerData, DashboardData,
} from './bo-models'
import {
  mapUserFromApi, mapActorFromApi, mapEnrolmentFromApi, mapZoneFromApi,
  mapMissionFromApi, mapTeamFromApi, mapIdentificateurFromApi,
  mapAuditEntryFromApi, mapAlertFromApi, mapDashboardFromApi,
} from './api-mappers'
import { type ModuleName, hasModuleAccess } from '@/lib/backoffice-permissions'
import type { BackofficeState, BoDataState } from './bo-state'

export const createBoDataSlice: StateCreator<
  BackofficeState,
  [['zustand/persist', unknown]],
  [],
  BoDataState
> = (set, get) => ({
      // Data - empty initial state
      users: [],
      actors: [],
      enrolments: [],
      zones: [],
      missions: [],
      teams: [],
      identificateurs: [],
      auditLog: [],
      alerts: [],
      objectifs: [],
      objectifsPeriode: null,
      objectifsMigrationPending: false,
      alertRules: [],
      actorsTotal: 0,
      enrolmentsTotal: 0,
      auditLogTotal: 0,
      ticker: {
        transactionsPerMin: 0,
        enrolmentsPerHour: 0,
        uptime: 0,
        activeUsers: 0,
      },
      dashboard: null,

      // ============== FETCH FUNCTIONS ==============

      fetchUsers: async () => {
        set({ loading: true })
        get().setDomainError('users', null)
        try {
          const res = await fetch('/api/backoffice/users')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const users: BoUser[] = (Array.isArray(data) ? data : []).map(mapUserFromApi)
          set({ users })
        } catch (err) {
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de chargement des utilisateurs')
        } finally {
          set({ loading: false })
        }
      },

      fetchActors: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().actors.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('actors', null)
        try {
          const res = await fetch(`/api/backoffice/actors?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newActors: BoActor[] = (data.actors || []).map(mapActorFromApi)
          set((s) => ({
            actors: append ? [...s.actors, ...newActors] : newActors,
            actorsTotal: (data.total as number) ?? newActors.length,
          }))
        } catch (err) {
          get().setDomainError('actors', err instanceof Error ? err.message : 'Erreur de chargement des acteurs')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreActors: async () => {
        await get().fetchActors({ append: true })
      },

      fetchEnrolments: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().enrolments.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('enrolments', null)
        try {
          const res = await fetch(`/api/backoffice/enrolments?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newEnrolments: BoEnrolment[] = (data.enrolments || []).map(mapEnrolmentFromApi)
          set((s) => ({
            enrolments: append ? [...s.enrolments, ...newEnrolments] : newEnrolments,
            enrolmentsTotal: (data.total as number) ?? newEnrolments.length,
          }))
        } catch (err) {
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de chargement des inscriptions')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreEnrolments: async () => {
        await get().fetchEnrolments({ append: true })
      },

      fetchZones: async () => {
        set({ loading: true })
        get().setDomainError('zones', null)
        try {
          const res = await fetch('/api/backoffice/zones')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const zones: BoZone[] = (Array.isArray(data) ? data : []).map(mapZoneFromApi)
          set({ zones })
        } catch (err) {
          get().setDomainError('zones', err instanceof Error ? err.message : 'Erreur de chargement des zones')
        } finally {
          set({ loading: false })
        }
      },

      fetchMissions: async () => {
        set({ loading: true })
        get().setDomainError('missions', null)
        try {
          const res = await fetch('/api/backoffice/missions')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const missions: BoMission[] = (Array.isArray(data) ? data : []).map(mapMissionFromApi)
          set({ missions })
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de chargement des missions')
        } finally {
          set({ loading: false })
        }
      },

      fetchAuditLog: async (opts) => {
        const append = opts?.append ?? false
        const page = append ? Math.floor(get().auditLog.length / 100) + 1 : 1
        set({ loading: true })
        get().setDomainError('auditLog', null)
        try {
          const res = await fetch(`/api/backoffice/audit?limit=100&page=${page}`)
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const newEntries: AuditEntry[] = (data.logs || []).map(mapAuditEntryFromApi)
          set((s) => ({
            auditLog: append ? [...s.auditLog, ...newEntries] : newEntries,
            auditLogTotal: (data.total as number) ?? newEntries.length,
          }))
        } catch (err) {
          get().setDomainError('auditLog', err instanceof Error ? err.message : 'Erreur de chargement du journal d\'audit')
        } finally {
          set({ loading: false })
        }
      },
      fetchMoreAuditLog: async () => {
        await get().fetchAuditLog({ append: true })
      },

      fetchAlerts: async () => {
        set({ loading: true })
        get().setDomainError('alerts', null)
        try {
          const res = await fetch('/api/backoffice/alerts')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const alerts: BoAlert[] = (Array.isArray(data) ? data : []).map(mapAlertFromApi)
          set({ alerts })
        } catch (err) {
          get().setDomainError('alerts', err instanceof Error ? err.message : 'Erreur de chargement des alertes')
        } finally {
          set({ loading: false })
        }
      },

      fetchDashboard: async () => {
        set({ loading: true })
        get().setDomainError('dashboard', null)
        try {
          const res = await fetch('/api/backoffice')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          if (data.erreur) throw new Error(data.erreur)
          const dashboard = mapDashboardFromApi(data)
          set({
            dashboard,
            ticker: {
              transactionsPerMin: 0,
              enrolmentsPerHour: data.pendingEnrolments || 0,
              uptime: data.systemHealth?.uptime || 0,
              activeUsers: data.activeActors || 0,
            },
          })
          return dashboard
        } catch (err) {
          get().setDomainError('dashboard', err instanceof Error ? err.message : 'Erreur de chargement du tableau de bord')
          return null
        } finally {
          set({ loading: false })
        }
      },

      fetchAllData: async () => {
        set({ loading: true })
        const store = get()
        // MODE-948 (AUDIT-003 F-20) — chaque rôle ne charge que les modules
        // auxquels MODULE_ACCESS lui ouvre la porte : fini des fetches qui
        // finissent en 403 connus d'avance pour operateur_terrain (et pour
        // admin_general sur utilisateurs/audit). Ce n'est PAS une décision
        // d'accès — le serveur garde l'autorité — juste l'abstention des
        // appels voués à l'échec.
        const role = store.boUserRole
        const peut = (m: ModuleName) => hasModuleAccess(role, m)
        const rien = () => Promise.resolve()
        await Promise.allSettled([
          peut('utilisateurs') ? store.fetchUsers() : rien(),
          peut('acteurs') ? store.fetchActors() : rien(),
          peut('enrolement') ? store.fetchEnrolments() : rien(),
          peut('zones') ? store.fetchZones() : rien(),
          peut('missions') ? store.fetchMissions() : rien(),
          peut('missions') ? store.fetchTeams() : rien(),
          peut('identificateurs') ? store.fetchIdentificateurs() : rien(),
          peut('audit') ? store.fetchAuditLog() : rien(),
          peut('alertes') ? store.fetchAlerts() : rien(),
          store.fetchDashboard(),
        ])
        set({ loading: false })
      },
})
