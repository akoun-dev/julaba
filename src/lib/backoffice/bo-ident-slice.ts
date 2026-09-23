// MODE-990 (DET-001 tranche 4) — slice identificateurs & équipes du
// store back-office : roster complet (actifs + désactivés), équipes,
// création (code agent JID-XXXX généré côté serveur), mise à jour
// optimiste réconciliée, code de liaison one-shot (MODE-937). Corps
// VERBATIM du store (preuve octet-pour-octet).
import type { StateCreator } from 'zustand'
import type { BoIdentificateur, BoTeam } from './bo-models'
import { mapIdentificateurFromApi, mapTeamFromApi } from './api-mappers'
import type { BackofficeState, BoIdentState } from './bo-state'

export const createBoIdentSlice: StateCreator<
  BackofficeState,
  [['zustand/persist', unknown]],
  [],
  BoIdentState
> = (set, get) => ({
      fetchTeams: async () => {
        set({ loading: true })
        get().setDomainError('missions', null)
        try {
          const res = await fetch('/api/backoffice/teams')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const teams: BoTeam[] = (Array.isArray(data) ? data : []).map(mapTeamFromApi)
          set({ teams })
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de chargement des equipes')
        } finally {
          set({ loading: false })
        }
      },

      // Roster complet (actifs + désactivés) : l'écran Identificateurs gère
      // les deux états ; l'écran Missions filtre sur isActive de son côté.
      fetchIdentificateurs: async () => {
        set({ loading: true })
        get().setDomainError('missions', null)
        try {
          const res = await fetch('/api/backoffice/identificateurs?active=false')
          if (!res.ok) throw new Error(`Erreur ${res.status}`)
          const data = await res.json()
          const identificateurs: BoIdentificateur[] = (Array.isArray(data) ? data : []).map(mapIdentificateurFromApi)
          set({ identificateurs })
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de chargement des identificateurs')
        } finally {
          set({ loading: false })
        }
      },

      // Création d'un identificateur — réservée au back-office (règle
      // produit) : nom, prénom, téléphone, email optionnel, zone, équipe.
      // Le code agent unique (JID-XXXX) est généré côté serveur et renvoyé
      // dans la réponse pour être communiqué à l'agent.
      createIdentificateur: async (agent) => {
        try {
          const res = await fetch('/api/backoffice/identificateurs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agent),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const created = mapIdentificateurFromApi(await res.json())
          set((s) => ({ identificateurs: [...s.identificateurs, created].sort((a, b) => a.name.localeCompare(b.name)) }))
          return created
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de création de l\'identificateur')
          return null
        }
      },

      issueIdentificateurLiaisonCode: async (id) => {
        try {
          const res = await fetch('/api/backoffice/identificateurs/liaison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificateurId: id }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const data = (await res.json()) as { codeLiaison?: string }
          if (!data.codeLiaison) throw new Error('Réponse sans code')
          return data.codeLiaison
        } catch (err) {
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur d\'émission du code de liaison')
          return null
        }
      },

      updateIdentificateur: async (id, updates) => {
        const previous = get().identificateurs
        // Mise à jour optimiste (bascule actif/inactif notamment) puis
        // réconciliation avec la réponse serveur.
        set((s) => ({
          identificateurs: s.identificateurs.map((i) =>
            i.id === id
              ? {
                  ...i,
                  isActive: updates.isActive ?? i.isActive,
                  zone: updates.zone === undefined ? i.zone : updates.zone || undefined,
                  email: updates.email === undefined ? i.email : updates.email || undefined,
                  teamId: updates.teamId === undefined ? i.teamId : updates.teamId || undefined,
                }
              : i
          ),
        }))
        try {
          const res = await fetch('/api/backoffice/identificateurs', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...updates }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error((data as Record<string, string>).erreur || `Erreur ${res.status}`)
          }
          const updated = mapIdentificateurFromApi(await res.json())
          set((s) => ({ identificateurs: s.identificateurs.map((i) => (i.id === id ? updated : i)) }))
          return true
        } catch (err) {
          set({ identificateurs: previous })
          get().setDomainError('missions', err instanceof Error ? err.message : 'Erreur de mise à jour de l\'identificateur')
          return false
        }
      },
})
