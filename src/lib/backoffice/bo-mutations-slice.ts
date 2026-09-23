// MODE-990 (DET-001 tranche 4) — slice mutations du store back-office :
// création zones/missions/équipes/utilisateurs, mises à jour OPTIMISTES
// avec rollback précis (l'état précédent de CETTE entité, jamais un
// défaut codé en dur) ; la demande d'information est PERSISTÉE
// (PATCH action demander_info). Corps VERBATIM du store (preuve
// octet-pour-octet).
import type { StateCreator } from 'zustand'
import type { BoZone, BoMission, BoTeam, BoActor, BoEnrolment, BoUser } from './bo-models'
import { mapZoneFromApi, mapTeamFromApi, mapUserFromApi } from './api-mappers'
import type { BackofficeState, BoMutationsState } from './bo-state'

export const createBoMutationsSlice: StateCreator<
  BackofficeState,
  [['zustand/persist', unknown]],
  [],
  BoMutationsState
> = (set, get) => ({
      // ============== MUTATION ACTIONS ==============

      createZone: async (zone) => {
        try {
          const res = await fetch('/api/backoffice/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zone),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = mapZoneFromApi(await res.json())
          set((s) => ({ zones: [...s.zones, created].sort((a, b) => a.name.localeCompare(b.name)) }))
          return created
        } catch (err) {
          get().setDomainError('zones', err instanceof Error ? err.message : 'Erreur de création de la zone')
          return null
        }
      },

      createMission: async (mission) => {
        try {
          const res = await fetch('/api/backoffice/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: mission.title,
              description: mission.description,
              zone: mission.zone,
              targetCount: mission.targetCount,
              startDate: mission.startDate,
              endDate: mission.endDate || null,
              teamId: mission.teamId || null,
              identificateurIds: mission.identificateurIds,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            const errorData = data as Record<string, string>
            throw new Error(errorData.erreur || errorData.error || errorData.message || `Erreur ${res.status}`)
          }
          const createdId = (await res.json()).id as string
          // The create response doesn't carry the joined identificateur
          // names or team name the list endpoint provides — refetch instead
          // of trying to reconstruct the display fields locally.
          await get().fetchMissions()
          return get().missions.find((m) => m.id === createdId) || null
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de création de la mission')
          return null
        }
      },

      updateMissionStatus: async (missionId, status) => {
        const previous = get().missions.find((m) => m.id === missionId)
        set((s) => ({
          missions: s.missions.map((m) => (m.id === missionId ? { ...m, status } : m)),
        }))
        try {
          const res = await fetch('/api/backoffice/missions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: missionId, status }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          if (previous) {
            set((s) => ({ missions: s.missions.map((m) => (m.id === missionId ? previous : m)) }))
          }
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de mise à jour de la mission')
        }
      },

      createTeam: async (team) => {
        try {
          const res = await fetch('/api/backoffice/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(team),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = mapTeamFromApi(await res.json())
          set((s) => ({ teams: [...s.teams, created].sort((a, b) => a.name.localeCompare(b.name)) }))
          return created
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de création de l\'équipe')
          return null
        }
      },

      updateActorStatus: async (actorId, status) => {
        const previous = get().actors.find((a) => a.id === actorId)
        // Optimistic update
        set((s) => ({
          actors: s.actors.map((a) => (a.id === actorId ? { ...a, status } : a)),
        }))
        try {
          const res = await fetch('/api/backoffice/actors', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: actorId, status }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback to the actor's previous status, not a hardcoded default
          if (previous) {
            set((s) => ({
              actors: s.actors.map((a) => (a.id === actorId ? previous : a)),
            }))
          }
          get().setDomainError('actors', err instanceof Error ? err.message : 'Erreur de mise à jour du statut')
        }
      },

      updateActorCategorie: async (actorId, categorie) => {
        const previous = get().actors.find((a) => a.id === actorId)
        // Optimistic update
        set((s) => ({
          actors: s.actors.map((a) => (a.id === actorId ? { ...a, categorieMarchand: categorie } : a)),
        }))
        try {
          const res = await fetch('/api/backoffice/actors', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: actorId, categorieMarchand: categorie ?? '' }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback à la catégorie précédente de CET acteur
          if (previous) {
            set((s) => ({
              actors: s.actors.map((a) => (a.id === actorId ? previous : a)),
            }))
          }
          get().setDomainError('actors', err instanceof Error ? err.message : 'Erreur de mise à jour de la catégorie')
          throw err
        }
      },

      validateEnrolment: async (enrolmentId, userId) => {
        const now = new Date().toISOString()
        // Optimistic update
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'valide' as const, validatedBy: userId, validatedAt: now }
              : e
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/enrolments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: enrolmentId, action: 'valider', validatedBy: userId }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            enrolments: s.enrolments.map((e) =>
              e.id === enrolmentId
                ? { ...e, status: 'en_attente' as const, validatedBy: undefined, validatedAt: undefined }
                : e
            ),
          }))
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de validation')
          throw err
        }
      },

      rejectEnrolment: async (enrolmentId, reason, userId) => {
        const now = new Date().toISOString()
        // Optimistic update
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'rejete' as const, validatedBy: userId, validatedAt: now, rejectReason: reason }
              : e
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/enrolments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: enrolmentId, action: 'rejeter', validatedBy: userId, rejectReason: reason }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            enrolments: s.enrolments.map((e) =>
              e.id === enrolmentId
                ? { ...e, status: 'en_attente' as const, validatedBy: undefined, validatedAt: undefined, rejectReason: undefined }
                : e
            ),
          }))
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de rejet')
          throw err
        }
      },

      requestInfoEnrolment: async (enrolmentId, userId, reason) => {
        const now = new Date().toISOString()
        // Optimistic update — même contrat que valider/rejeter : la demande
        // d'information est PERSISTÉE (PATCH action demander_info), pas un
        // simple setState client perdu au refetch.
        const snapshot = get().enrolments.find((e) => e.id === enrolmentId)
        set((s) => ({
          enrolments: s.enrolments.map((e) =>
            e.id === enrolmentId
              ? { ...e, status: 'info_demandee' as const, validatedBy: userId, validatedAt: now, infoRequestReason: reason || undefined }
              : e
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/enrolments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: enrolmentId, action: 'demander_info', validatedBy: userId, infoRequestReason: reason }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback à l'état d'origine de CE dossier (pas un statut codé en dur)
          if (snapshot) {
            set((s) => ({
              enrolments: s.enrolments.map((e) => (e.id === enrolmentId ? snapshot : e)),
            }))
          }
          get().setDomainError('enrolments', err instanceof Error ? err.message : 'Erreur de la demande d\'information')
          throw err
        }
      },

      acknowledgeAlert: async (alertId) => {
        // Optimistic update
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)),
        }))
        try {
          const res = await fetch('/api/backoffice/alerts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: alertId, acknowledged: true }),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          set((s) => ({
            alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: false } : a)),
          }))
          get().setDomainError('alerts', err instanceof Error ? err.message : 'Erreur d\'acquittement')
        }
      },

      updateUser: async (userId, updates) => {
        const previous = get().users.find((u) => u.id === userId)
        // Optimistic update
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...updates } : u)),
        }))
        try {
          const body: Record<string, unknown> = { id: userId }
          if (updates.role) body.role = updates.role
          if (updates.isActive !== undefined) body.isActive = updates.isActive
          if (updates.zone !== undefined) body.zone = updates.zone
          if (updates.name) body.name = updates.name
          const res = await fetch('/api/backoffice/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
        } catch (err) {
          // Rollback
          if (previous) {
            set((s) => ({
              users: s.users.map((u) => (u.id === userId ? previous : u)),
            }))
          }
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de mise à jour de l\'utilisateur')
        }
      },

      createUser: async (user) => {
        try {
          const res = await fetch('/api/backoffice/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              role: user.role,
              zone: user.zone || null,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = await res.json()
          const newUser = mapUserFromApi(created)
          set((s) => ({ users: [...s.users, newUser] }))
          return { tempPassword: (created as { tempPassword: string }).tempPassword }
        } catch (err) {
          get().setDomainError('users', err instanceof Error ? err.message : 'Erreur de création de l\'utilisateur')
          return null
        }
      },
})
